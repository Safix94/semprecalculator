'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { createRfqSchema, updateRfqSchema } from '@/lib/validation';
import {
  assertTokenHashingConfigured,
  generateToken,
  hashToken,
  isTokenHashingConfigError,
} from '@/lib/tokens';
import { sendPricingTeamRfqNotification, sendSupplierInviteEmail } from '@/lib/mailer';
import { formatRfqDimensionsWithOptions } from '@/lib/rfq-format';
import { logAuditEvent } from './audit';
import type { CreateRfqInput } from '@/lib/validation';
import type { Rfq, RfqAttachment, RfqInvite, RfqQuote, Supplier } from '@/types';

const TOKEN_CONFIG_ERROR_MESSAGE = 'RFQ invites are not configured. Set TOKEN_HASH_SECRET and try again.';
const INVITE_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000;

function getPricingTeamEmailsFromEnv(): string[] {
  const raw = process.env.PRICING_TEAM_EMAIL ?? '';

  return [...new Set(raw.split(',').map((email) => email.trim()).filter(Boolean))];
}

type ReplaceRfqInvitesResult = { data: { created: number } } | { error: string };

async function replaceRfqInvitesWithServiceRole(
  rfqId: string,
  supplierIds: string[]
): Promise<ReplaceRfqInvitesResult> {
  try {
    const normalizedSupplierIds = [...new Set(supplierIds)];
    if (normalizedSupplierIds.length === 0) {
      return { error: 'Select at least one supplier' };
    }

    const supabase = createServiceRoleClient();

    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .select('id')
      .eq('id', rfqId)
      .eq('status', 'draft')
      .single();

    if (rfqError || !rfq) {
      return { error: 'RFQ not found or not in draft status' };
    }

    const { error: deleteError } = await supabase
      .from('rfq_invites')
      .delete()
      .eq('rfq_id', rfqId);

    if (deleteError) {
      return { error: `Failed to replace invites: ${deleteError.message}` };
    }

    const expiresAt = new Date(Date.now() + INVITE_EXPIRATION_MS).toISOString();
    const inviteInserts = normalizedSupplierIds.map((supplierId) => ({
      rfq_id: rfqId,
      supplier_id: supplierId,
      token_hash: hashToken(generateToken()),
      expires_at: expiresAt,
    }));

    const { error: insertError } = await supabase
      .from('rfq_invites')
      .insert(inviteInserts);

    if (insertError) {
      return { error: `Failed to replace invites: ${insertError.message}` };
    }

    return { data: { created: normalizedSupplierIds.length } };
  } catch (error) {
    if (isTokenHashingConfigError(error)) {
      return { error: TOKEN_CONFIG_ERROR_MESSAGE };
    }
    const message = error instanceof Error ? error.message : 'Failed to replace invites';
    return { error: message };
  }
}

export async function createRfq(input: CreateRfqInput) {
  const user = await requireAuth();
  const supabase = await createClient();

  const parsed = createRfqSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  if (parsed.data.supplier_ids && parsed.data.supplier_ids.length > 0) {
    try {
      assertTokenHashingConfigured();
    } catch (error) {
      console.error('RFQ token setup validation failed:', error);
      return {
        error: {
          _form: [TOKEN_CONFIG_ERROR_MESSAGE],
        },
      };
    }
  }

  try {
    // Extract supplier_ids from the input (not stored in RFQ table)
    const { supplier_ids, ...rfqData } = parsed.data;

    const { data: rfq, error } = await supabase
      .from('rfqs')
      .insert({
        ...rfqData,
        created_by: user.id,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      return { error: { _form: [error.message] } };
    }

    await logAuditEvent({
      actorType: user.role,
      actorId: user.id,
      action: 'RFQ_CREATED',
      entityType: 'rfq',
      entityId: rfq.id,
      metadata: {
        materialId: rfq.material_id,
        finish: rfq.finish,
        quantity: rfq.quantity,
        supplierIds: supplier_ids,
      },
    });

    // If suppliers were selected, force invite creation via service role.
    if (supplier_ids && supplier_ids.length > 0) {
      const inviteResult = await replaceRfqInvitesWithServiceRole(rfq.id, supplier_ids);
      if ('error' in inviteResult) {
        console.error('Failed to create supplier invites after RFQ creation:', {
          rfqId: rfq.id,
          inviteError: inviteResult.error,
        });
        revalidatePath('/dashboard');
        revalidatePath(`/dashboard/rfqs/${rfq.id}`);
        return {
          error: {
            _form: [`RFQ created but failed to create supplier invites: ${inviteResult.error}`],
          },
        };
      }
    }

    revalidatePath('/dashboard');
    return { data: rfq };
  } catch (error) {
    console.error('Unexpected error while creating RFQ:', error);
    if (isTokenHashingConfigError(error)) {
      return {
        error: {
          _form: [TOKEN_CONFIG_ERROR_MESSAGE],
        },
      };
    }
    return { error: { _form: ['Failed to create RFQ. Please try again.'] } };
  }
}

export async function replaceRfqInvites(rfqId: string, supplierIds: string[]) {
  const user = await requireAuth();

  if (user.role !== 'sales' && user.role !== 'admin') {
    return { error: 'Unauthorized' };
  }

  try {
    assertTokenHashingConfigured();
  } catch (error) {
    console.error('RFQ token setup validation failed:', error);
    return { error: TOKEN_CONFIG_ERROR_MESSAGE };
  }

  const normalizedSupplierIds = [...new Set(supplierIds)];
  if (normalizedSupplierIds.length === 0) {
    return { error: 'Select at least one supplier' };
  }

  const result = await replaceRfqInvitesWithServiceRole(rfqId, normalizedSupplierIds);
  if ('error' in result) {
    return result;
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  return result;
}

export async function updateRfq(rfqId: string, input: Partial<CreateRfqInput>) {
  const user = await requireAuth();
  const supabase = await createClient();

  const parsed = updateRfqSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { data: rfq, error } = await supabase
    .from('rfqs')
    .update(parsed.data)
    .eq('id', rfqId)
    .eq('status', 'draft')
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'RFQ_UPDATED',
    entityType: 'rfq',
    entityId: rfqId,
  });

  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  return { data: rfq };
}

interface RfqDetailData {
  rfq: Rfq;
  attachments: RfqAttachment[];
  invites: (RfqInvite & { supplier: Supplier | null })[];
  quotes: (RfqQuote & { supplier: Supplier | null })[];
}

export async function getRfqDetail(rfqId: string): Promise<{ data: RfqDetailData } | { error: string }> {
  await requireAuth();
  const supabase = await createClient();

  try {
    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .select('*')
      .eq('id', rfqId)
      .single();

    if (rfqError || !rfq) {
      return { error: 'RFQ not found.' };
    }

    const [
      { data: attachments, error: attachmentsError },
      { data: invites, error: invitesError },
      { data: quotes, error: quotesError },
    ] = await Promise.all([
      supabase
        .from('rfq_attachments')
        .select('*')
        .eq('rfq_id', rfqId)
        .order('created_at'),
      supabase
        .from('rfq_invites')
        .select('*, supplier:suppliers(*)')
        .eq('rfq_id', rfqId)
        .order('created_at'),
      supabase
        .from('rfq_quotes')
        .select('*, supplier:suppliers(*)')
        .eq('rfq_id', rfqId)
        .order('final_price_calculated', { ascending: true }),
    ]);

    if (attachmentsError || invitesError || quotesError) {
      console.error('Failed to load RFQ detail data:', {
        attachmentsError: attachmentsError?.message,
        invitesError: invitesError?.message,
        quotesError: quotesError?.message,
      });
      return { error: 'Could not load RFQ details.' };
    }

    return {
      data: {
        rfq: rfq as Rfq,
        attachments: (attachments ?? []) as RfqAttachment[],
        invites: (invites ?? []) as (RfqInvite & { supplier: Supplier | null })[],
        quotes: (quotes ?? []) as (RfqQuote & { supplier: Supplier | null })[],
      },
    };
  } catch (error) {
    console.error('Unexpected error while loading RFQ detail:', error);
    return { error: 'Could not load RFQ details.' };
  }
}

export async function uploadAttachment(rfqId: string, formData: FormData) {
  await requireAuth();
  const supabase = await createClient();

  const file = formData.get('file') as File | null;
  if (!file) {
    return { error: 'No file selected' };
  }

  const allowedTypes = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.sketchup.skp',
    'application/acad',
    'application/x-acad',
    'application/x-autocad',
    'image/vnd.dwg',
    'application/octet-stream',
  ]);
  const allowedExtensions = new Set(['skp', 'pdf', 'jpg', 'jpeg', 'png', 'dwg']);
  const ext = file.name.split('.').pop()?.toLowerCase();
  if ((!file.type || !allowedTypes.has(file.type)) && (!ext || !allowedExtensions.has(ext))) {
    return { error: 'Invalid file type. Allowed: SKP, PDF, JPG, PNG, DWG' };
  }

  const storagePath = `${rfqId}/${crypto.randomUUID()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('rfq-attachments')
    .upload(storagePath, file);

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  const { error: dbError } = await supabase.from('rfq_attachments').insert({
    rfq_id: rfqId,
    storage_path: storagePath,
    file_name: file.name,
    mime_type: file.type || 'application/octet-stream',
  });

  if (dbError) {
    return { error: `Save failed: ${dbError.message}` };
  }

  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  return { success: true };
}

export async function sendRfq(rfqId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  try {
    assertTokenHashingConfigured();
  } catch (error) {
    console.error('RFQ token setup validation failed:', error);
    return { error: TOKEN_CONFIG_ERROR_MESSAGE };
  }

  // Fetch the RFQ with material details
  const { data: rfq, error: rfqError } = await supabase
    .from('rfqs')
    .select(`
      *,
      material_details:materials(name)
    `)
    .eq('id', rfqId)
    .eq('status', 'draft')
    .single();

  if (rfqError || !rfq) {
    return { error: 'RFQ not found or already sent to suppliers' };
  }

  // Get existing invites for this RFQ
  const { data: invites, error: inviteError } = await supabase
    .from('rfq_invites')
    .select(`
      *,
      supplier:suppliers(*)
    `)
    .eq('rfq_id', rfqId);

  if (inviteError) {
    return { error: `Failed to fetch invites: ${inviteError.message}` };
  }

  if (!invites || invites.length === 0) {
    return { error: 'No suppliers selected for this RFQ' };
  }

  // Send emails to all suppliers with invites
  const results: { supplier: string; success: boolean; error?: string }[] = [];
  const dimensionsText = formatRfqDimensionsWithOptions(
    {
      shape: rfq.shape,
      length: Number(rfq.length),
      width: Number(rfq.width),
      height: Number(rfq.height),
      thickness: Number(rfq.thickness),
    },
    { includeThickness: true }
  );
  const quantity = Number(rfq.quantity ?? 1);

  for (const invite of invites) {
    if (!invite.supplier) {
      results.push({ supplier: 'Unknown', success: false, error: 'Supplier not found' });
      continue;
    }

    // Generate a fresh token for this send.
    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + INVITE_EXPIRATION_MS).toISOString();

    // Refresh invite state before emailing. If this fails, don't send a broken link.
    const { data: refreshedInvite, error: refreshInviteError } = await supabase
      .from('rfq_invites')
      .update({
        token_hash: tokenHash,
        expires_at: expiresAt,
        revoked_at: null,
        used_at: null,
        last_access_at: null,
      })
      .eq('id', invite.id)
      .select('id')
      .single();

    if (refreshInviteError || !refreshedInvite) {
      const reason = refreshInviteError?.message ?? 'Unknown invite update error';
      console.error('Failed to refresh supplier invite before send:', {
        rfqId,
        inviteId: invite.id,
        supplierId: invite.supplier.id,
        reason,
      });
      results.push({
        supplier: invite.supplier.name,
        success: false,
        error: `Failed to refresh invite token: ${reason}`,
      });
      continue;
    }

    await logAuditEvent({
      actorType: user.role,
      actorId: user.id,
      action: 'INVITE_CREATED',
      entityType: 'rfq_invite',
      entityId: invite.id,
      metadata: { rfqId, supplierId: invite.supplier.id },
    });

    // Send email
    const materialName = rfq.material_details?.name || rfq.material;
    const emailResult = await sendSupplierInviteEmail({
      supplierEmail: invite.supplier.email,
      supplierName: invite.supplier.name,
      rfqId,
      token,
      material: materialName,
      shape: rfq.shape,
      finish: rfq.finish,
      dimensionsText,
      quantity,
    });

    await logAuditEvent({
      actorType: 'system',
      actorId: 'mailer',
      action: 'EMAIL_SENT',
      entityType: 'rfq_invite',
      entityId: invite.id,
      metadata: {
        success: emailResult.success,
        error: emailResult.error,
        supplierEmail: invite.supplier.email,
      },
    });

    results.push({
      supplier: invite.supplier.name,
      success: emailResult.success,
      error: emailResult.error,
    });
  }

  const sentCount = results.filter((r) => r.success).length;
  const totalCount = results.length;

  if (sentCount === 0) {
    return {
      error:
        'Geen enkele e-mail kon worden verzonden. Controleer BREVO_API_KEY, afzender-instellingen en audit logs.',
    };
  }

  // Update RFQ status to sent to supplier
  const { error: statusUpdateError } = await supabase
    .from('rfqs')
    .update({ status: 'sent_to_supplier', sent_at: new Date().toISOString() })
    .eq('id', rfqId)
    .eq('status', 'draft')
    .select('id')
    .single();

  if (statusUpdateError) {
    return {
      error: `E-mails zijn verstuurd naar ${sentCount}/${totalCount} leveranciers, maar de RFQ-status kon niet worden bijgewerkt: ${statusUpdateError.message}`,
    };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'RFQ_SENT',
    entityType: 'rfq',
    entityId: rfqId,
    metadata: { supplierCount: invites.length, results },
  });

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  return { data: { sent: sentCount, total: totalCount, results } };
}

export async function sendToPricingTeam(rfqId: string) {
  const user = await requireAuth();
  if (user.role !== 'sales' && user.role !== 'admin') {
    return { error: 'Unauthorized' };
  }

  const supabase = await createClient();
  const { data: rfq, error: rfqError } = await supabase
    .from('rfqs')
    .select('id, material, shape, finish, quantity, customer_name, product_type, status')
    .eq('id', rfqId)
    .single();

  if (rfqError || !rfq) {
    return { error: 'RFQ not found' };
  }

  if (rfq.status !== 'draft') {
    return { error: 'Only draft RFQs can be sent to pricing team' };
  }

  const pricingEmails = getPricingTeamEmailsFromEnv();
  if (pricingEmails.length === 0) {
    return { error: 'PRICING_TEAM_EMAIL is not configured' };
  }

  const rfqSummary = [
    rfq.product_type ? `Type: ${rfq.product_type}` : null,
    `Material: ${rfq.material}`,
    `Shape: ${rfq.shape}`,
    rfq.finish ? `Finish: ${rfq.finish}` : null,
    `Quantity: ${Number(rfq.quantity ?? 1)}`,
    rfq.customer_name ? `Customer: ${rfq.customer_name}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const emailResult = await sendPricingTeamRfqNotification({
    pricingEmails,
    rfqId,
    rfqSummary,
  });

  if (emailResult.sent === 0) {
    const firstFailure = emailResult.results.find((result) => !result.success)?.error;
    return {
      error: firstFailure
        ? `Failed to notify pricing team: ${firstFailure}`
        : 'Failed to notify pricing team',
    };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'RFQ_SENT_TO_PRICING',
    entityType: 'rfq',
    entityId: rfqId,
    metadata: {
      recipients: pricingEmails,
      sent: emailResult.sent,
      total: emailResult.total,
      results: emailResult.results,
    },
  });

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  return { data: { sent: emailResult.sent, total: emailResult.total } };
}

export async function closeRfq(rfqId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from('rfqs')
    .update({ status: 'closed' })
    .eq('id', rfqId)
    .in('status', ['sent_to_supplier', 'quotes_received']);

  if (error) {
    return { error: error.message };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'RFQ_UPDATED',
    entityType: 'rfq',
    entityId: rfqId,
    metadata: { status: 'closed' },
  });

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  return { success: true };
}
