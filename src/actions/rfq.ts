'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireAuth, requireRole } from '@/lib/auth';
import { createRfqSchema, updateRfqSchema, updateRfqNotesSchema } from '@/lib/validation';
import {
  assertTokenHashingConfigured,
  generateToken,
  hashToken,
  isTokenHashingConfigError,
} from '@/lib/tokens';
import {
  getPricingTeamEmailsFromEnv,
  sendPricingTeamRfqNotification,
  sendSupplierInviteEmail,
} from '@/lib/mailer';
import { formatRfqDimensionsWithOptions } from '@/lib/rfq-format';
import { logAuditEvent } from './audit';
import type { CreateRfqInput } from '@/lib/validation';
import type { Rfq, RfqAttachment, RfqComment, RfqInvite, RfqQuote, Supplier } from '@/types';

const TOKEN_CONFIG_ERROR_MESSAGE = 'RFQ invites are not configured. Set TOKEN_HASH_SECRET and try again.';
const INVITE_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000;
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type InvitePart = 'default' | 'table_top' | 'table_foot' | 'table_both';

interface InviteSelectionInput {
  supplierIds?: string[];
  supplierIdsTableTop?: string[];
  supplierIdsTableFoot?: string[];
}

async function productTypeExists(
  supabase: SupabaseServerClient,
  productType: string
): Promise<boolean> {
  const normalized = productType.trim();
  if (!normalized) {
    return true;
  }

  const { data, error } = await supabase
    .from('product_types')
    .select('id')
    .eq('name', normalized)
    .maybeSingle();

  if (error) {
    console.error('Failed to validate product type:', error.message);
    return false;
  }

  return Boolean(data);
}

type ReplaceRfqInvitesResult = { data: { created: number } } | { error: string };

function isTablesProductType(productType: string | null | undefined): boolean {
  return productType?.trim().toLowerCase() === 'tables';
}

function normalizeSupplierIds(ids?: string[]): string[] {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
}

function normalizeInviteSelectionInput(input: InviteSelectionInput | string[]): InviteSelectionInput {
  if (Array.isArray(input)) {
    return { supplierIds: input };
  }

  return {
    supplierIds: input.supplierIds ?? [],
    supplierIdsTableTop: input.supplierIdsTableTop ?? [],
    supplierIdsTableFoot: input.supplierIdsTableFoot ?? [],
  };
}

function buildInviteSelectionsForRfq(
  productType: string | null | undefined,
  input: InviteSelectionInput
): { rows: { supplier_id: string; invite_part: InvitePart }[] } | { error: string } {
  if (isTablesProductType(productType)) {
    const topSet = new Set(normalizeSupplierIds(input.supplierIdsTableTop));
    const footSet = new Set(normalizeSupplierIds(input.supplierIdsTableFoot));

    if (topSet.size === 0) {
      return { error: 'Select at least one supplier for the table top' };
    }

    if (footSet.size === 0) {
      return { error: 'Select at least one supplier for the table foot' };
    }

    const supplierUnion = new Set([...topSet, ...footSet]);
    const rows = [...supplierUnion].map((supplierId) => {
      const inTop = topSet.has(supplierId);
      const inFoot = footSet.has(supplierId);
      let invitePart: InvitePart = 'table_both';

      if (inTop && !inFoot) {
        invitePart = 'table_top';
      } else if (!inTop && inFoot) {
        invitePart = 'table_foot';
      }

      return {
        supplier_id: supplierId,
        invite_part: invitePart,
      };
    });

    return { rows };
  }

  const supplierIds = normalizeSupplierIds(input.supplierIds);
  if (supplierIds.length === 0) {
    return { error: 'Select at least one supplier' };
  }

  return {
    rows: supplierIds.map((supplierId) => ({
      supplier_id: supplierId,
      invite_part: 'default',
    })),
  };
}

async function replaceRfqInvitesWithServiceRole(
  rfqId: string,
  input: InviteSelectionInput
): Promise<ReplaceRfqInvitesResult> {
  try {
    const supabase = createServiceRoleClient();

    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .select('id, product_type')
      .eq('id', rfqId)
      .in('status', ['draft', 'sent_to_pricing'])
      .single();

    if (rfqError || !rfq) {
      return { error: 'RFQ not found or status does not allow invite updates' };
    }

    const inviteSelectionResult = buildInviteSelectionsForRfq(rfq.product_type, input);
    if ('error' in inviteSelectionResult) {
      return inviteSelectionResult;
    }

    const { error: deleteError } = await supabase
      .from('rfq_invites')
      .delete()
      .eq('rfq_id', rfqId);

    if (deleteError) {
      return { error: `Failed to replace invites: ${deleteError.message}` };
    }

    const expiresAt = new Date(Date.now() + INVITE_EXPIRATION_MS).toISOString();
    const inviteInserts = inviteSelectionResult.rows.map((row) => ({
      rfq_id: rfqId,
      supplier_id: row.supplier_id,
      invite_part: row.invite_part,
      token_hash: hashToken(generateToken()),
      expires_at: expiresAt,
    }));

    const { error: insertError } = await supabase
      .from('rfq_invites')
      .insert(inviteInserts);

    if (insertError) {
      return { error: `Failed to replace invites: ${insertError.message}` };
    }

    return { data: { created: inviteSelectionResult.rows.length } };
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

  const normalizedProductType = parsed.data.product_type?.trim() || null;
  if (normalizedProductType) {
    const isAllowedProductType = await productTypeExists(supabase, normalizedProductType);
    if (!isAllowedProductType) {
      return { error: { product_type: ['Invalid product type'] } };
    }
  }

  const hasSelectedSuppliers = isTablesProductType(normalizedProductType)
    ? (parsed.data.supplier_ids_table_top?.length ?? 0) > 0 ||
      (parsed.data.supplier_ids_table_foot?.length ?? 0) > 0
    : (parsed.data.supplier_ids?.length ?? 0) > 0;

  if (hasSelectedSuppliers) {
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
    const {
      supplier_ids,
      supplier_ids_table_top,
      supplier_ids_table_foot,
      ...rfqData
    } = parsed.data;
    const normalizedRfqData = {
      ...rfqData,
      product_type: normalizedProductType,
      material_table_top: rfqData.material_table_top?.trim() || null,
      material_table_foot: rfqData.material_table_foot?.trim() || null,
      finish_table_top: rfqData.finish_table_top?.trim() || null,
      finish_table_foot: rfqData.finish_table_foot?.trim() || null,
    };

    const { data: rfq, error } = await supabase
      .from('rfqs')
      .insert({
        ...normalizedRfqData,
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
        tableTopMaterialId: rfq.material_id_table_top,
        tableFootMaterialId: rfq.material_id_table_foot,
        tableTopFinish: rfq.finish_table_top,
        tableFootFinish: rfq.finish_table_foot,
        quantity: rfq.quantity,
        supplierIds: supplier_ids,
        supplierIdsTableTop: supplier_ids_table_top,
        supplierIdsTableFoot: supplier_ids_table_foot,
      },
    });

    // If suppliers were selected, force invite creation via service role.
    if (hasSelectedSuppliers) {
      const inviteResult = await replaceRfqInvitesWithServiceRole(rfq.id, {
        supplierIds: supplier_ids,
        supplierIdsTableTop: supplier_ids_table_top,
        supplierIdsTableFoot: supplier_ids_table_foot,
      });
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

export async function replaceRfqInvites(
  rfqId: string,
  input: InviteSelectionInput | string[]
) {
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

  const normalizedInput = normalizeInviteSelectionInput(input);
  const result = await replaceRfqInvitesWithServiceRole(rfqId, normalizedInput);
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

  if (parsed.data.product_type) {
    const normalizedProductType = parsed.data.product_type.trim();
    const isAllowedProductType = await productTypeExists(supabase, normalizedProductType);
    if (!isAllowedProductType) {
      return { error: { product_type: ['Invalid product type'] } };
    }
  }

  const parsedUpdateData: Partial<CreateRfqInput> = { ...parsed.data };
  delete parsedUpdateData.supplier_ids;
  delete parsedUpdateData.supplier_ids_table_top;
  delete parsedUpdateData.supplier_ids_table_foot;

  const updateData: Partial<CreateRfqInput> = {
    ...parsedUpdateData,
    product_type:
      parsed.data.product_type === undefined
        ? undefined
        : parsed.data.product_type?.trim() || null,
    material_table_top:
      parsed.data.material_table_top === undefined
        ? undefined
        : parsed.data.material_table_top?.trim() || null,
    material_table_foot:
      parsed.data.material_table_foot === undefined
        ? undefined
        : parsed.data.material_table_foot?.trim() || null,
    finish_table_top:
      parsed.data.finish_table_top === undefined
        ? undefined
        : parsed.data.finish_table_top?.trim() || null,
    finish_table_foot:
      parsed.data.finish_table_foot === undefined
        ? undefined
        : parsed.data.finish_table_foot?.trim() || null,
  };

  const { data: rfq, error } = await supabase
    .from('rfqs')
    .update(updateData)
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
  comments: RfqComment[];
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
      const message = rfqError?.message ?? 'RFQ not found.';
      console.error('Failed to load RFQ:', rfqError);
      return { error: message.includes('schema cache') || message.includes('does not exist') ? message : 'RFQ not found.' };
    }

    const [
      { data: attachments, error: attachmentsError },
      { data: invites, error: invitesError },
      { data: quotes, error: quotesError },
      { data: comments, error: commentsError },
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
      supabase
        .from('rfq_comments')
        .select('*')
        .eq('rfq_id', rfqId)
        .order('created_at', { ascending: true }),
    ]);

    const detailError =
      attachmentsError?.message ??
      invitesError?.message ??
      quotesError?.message ??
      commentsError?.message;
    if (attachmentsError || invitesError || quotesError || commentsError) {
      console.error('Failed to load RFQ detail data:', {
        attachmentsError: attachmentsError?.message,
        invitesError: invitesError?.message,
        quotesError: quotesError?.message,
        commentsError: commentsError?.message,
      });
      return {
        error:
          detailError && (detailError.includes('schema cache') || detailError.includes('does not exist'))
            ? detailError
            : 'Could not load RFQ details.',
      };
    }

    return {
      data: {
        rfq: rfq as Rfq,
        attachments: (attachments ?? []) as RfqAttachment[],
        invites: (invites ?? []) as (RfqInvite & { supplier: Supplier | null })[],
        quotes: (quotes ?? []) as (RfqQuote & { supplier: Supplier | null })[],
        comments: (comments ?? []) as RfqComment[],
      },
    };
  } catch (error) {
    console.error('Unexpected error while loading RFQ detail:', error);
    return { error: 'Could not load RFQ details.' };
  }
}

export async function uploadAttachment(rfqId: string, formData: FormData) {
  await requireRole('sales');
  const supabase = await createClient();

  const { data: rfq, error: rfqError } = await supabase
    .from('rfqs')
    .select('status')
    .eq('id', rfqId)
    .single();

  if (rfqError || !rfq) {
    return { error: 'RFQ not found' };
  }

  if (rfq.status === 'closed') {
    return { error: 'Cannot upload attachments to a closed RFQ' };
  }

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

export async function updateRfqNotes(rfqId: string, notes: string | null) {
  const user = await requireRole('sales');
  const supabase = await createClient();
  const normalizedNotes = typeof notes === 'string' ? notes.trim() : null;
  const parsed = updateRfqNotesSchema.safeParse({
    notes: normalizedNotes && normalizedNotes.length > 0 ? normalizedNotes : null,
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.flatten().fieldErrors.notes?.[0] ??
        'Invalid notes value',
    };
  }

  const { data: rfq, error: updateError } = await supabase
    .from('rfqs')
    .update({ notes: parsed.data.notes })
    .eq('id', rfqId)
    .neq('status', 'closed')
    .select('id')
    .single();

  if (updateError || !rfq) {
    return { error: updateError?.message ?? 'Could not update notes' };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'RFQ_UPDATED',
    entityType: 'rfq',
    entityId: rfqId,
    metadata: {
      notesUpdated: true,
    },
  });

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  return { data: { notes: parsed.data.notes } };
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

  // Fetch the RFQ (allow resend when already sent_to_supplier, e.g. after adding attachments)
  const { data: rfq, error: rfqError } = await supabase
    .from('rfqs')
    .select(`
      id, material, material_id, shape, finish, length, width, height, thickness, quantity,
      material_table_top, material_table_foot, finish_table_top, finish_table_foot,
      material_details:materials(name)
    `)
    .eq('id', rfqId)
    .in('status', ['draft', 'sent_to_pricing', 'sent_to_supplier'])
    .single();

  if (rfqError || !rfq) {
    if (rfqError) {
      console.error('sendRfq: failed to fetch RFQ', { rfqId, code: rfqError.code, message: rfqError.message });
    }
    const isNoRows = rfqError?.code === 'PGRST116';
    return {
      error: isNoRows
        ? 'RFQ not found or already sent to suppliers'
        : rfqError?.message ?? 'RFQ not found or already sent to suppliers',
    };
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
      metadata: { rfqId, supplierId: invite.supplier.id, invitePart: invite.invite_part ?? 'default' },
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
      invitePart: invite.invite_part ?? 'default',
      materialTableTop: rfq.material_table_top,
      finishTableTop: rfq.finish_table_top,
      materialTableFoot: rfq.material_table_foot,
      finishTableFoot: rfq.finish_table_foot,
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
        invitePart: invite.invite_part ?? 'default',
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

  // Update RFQ status to sent_to_supplier and refresh sent_at (also on resend)
  const { error: statusUpdateError } = await supabase
    .from('rfqs')
    .update({ status: 'sent_to_supplier', sent_at: new Date().toISOString() })
    .eq('id', rfqId)
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
    .select(
      'id, material, shape, finish, quantity, customer_name, product_type, status, material_table_top, material_table_foot, finish_table_top, finish_table_foot'
    )
    .eq('id', rfqId)
    .single();

  if (rfqError || !rfq) {
    if (rfqError) {
      console.error('sendToPricingTeam: failed to fetch RFQ', { rfqId, code: rfqError.code, message: rfqError.message });
    }
    return {
      error:
        rfqError?.message && (rfqError.message.includes('schema cache') || rfqError.message.includes('does not exist'))
          ? rfqError.message
          : 'RFQ not found',
    };
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
    rfq.product_type === 'Tables' && rfq.material_table_top
      ? `Table top: ${rfq.material_table_top}${rfq.finish_table_top ? ` (${rfq.finish_table_top})` : ''}`
      : null,
    rfq.product_type === 'Tables' && rfq.material_table_foot
      ? `Table foot: ${rfq.material_table_foot}${rfq.finish_table_foot ? ` (${rfq.finish_table_foot})` : ''}`
      : null,
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

  const { error: updateError } = await supabase
    .from('rfqs')
    .update({ status: 'sent_to_pricing' })
    .eq('id', rfqId);

  if (updateError) {
    console.error('Failed to update RFQ status to sent_to_pricing:', updateError);
    return { error: 'Pricing team notified but status could not be updated' };
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
    .in('status', ['sent_to_pricing', 'sent_to_supplier', 'quotes_received']);

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
