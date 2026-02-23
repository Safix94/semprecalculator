'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { createRfqSchema, updateRfqSchema } from '@/lib/validation';
import { generateToken, hashToken } from '@/lib/tokens';
import { sendSupplierInviteEmail } from '@/lib/mailer';
import { logAuditEvent } from './audit';
import type { CreateRfqInput } from '@/lib/validation';

export async function createRfq(input: CreateRfqInput) {
  const user = await requireAuth();
  const supabase = await createClient();
  const serviceClient = createServiceRoleClient();

  const parsed = createRfqSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

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

  // If specific suppliers were selected, create invites immediately (but don't send emails yet)
  if (supplier_ids && supplier_ids.length > 0) {
    const inviteInserts = supplier_ids.map(supplierId => {
      const token = generateToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      
      return {
        rfq_id: rfq.id,
        supplier_id: supplierId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      };
    });

    const { error: inviteError } = await serviceClient
      .from('rfq_invites')
      .insert(inviteInserts);

    if (inviteError) {
      console.error('Failed to create invites:', inviteError);
      // Don't fail the RFQ creation, just log the error
    }
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
      supplierIds: supplier_ids 
    },
  });

  revalidatePath('/dashboard');
  return { data: rfq };
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

export async function uploadAttachment(rfqId: string, formData: FormData) {
  const user = await requireAuth();
  const supabase = await createClient();

  const file = formData.get('file') as File | null;
  if (!file) {
    return { error: 'Geen bestand geselecteerd' };
  }

  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/acad',
    'application/x-acad',
    'application/x-autocad',
    'image/vnd.dwg',
  ];
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!allowedTypes.includes(file.type) && ext !== 'dwg') {
    return { error: 'Ongeldig bestandstype. Toegestaan: PDF, JPG, PNG, DWG' };
  }

  const storagePath = `${rfqId}/${crypto.randomUUID()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('rfq-attachments')
    .upload(storagePath, file);

  if (uploadError) {
    return { error: `Upload mislukt: ${uploadError.message}` };
  }

  const { error: dbError } = await supabase.from('rfq_attachments').insert({
    rfq_id: rfqId,
    storage_path: storagePath,
    file_name: file.name,
    mime_type: file.type || 'application/octet-stream',
  });

  if (dbError) {
    return { error: `Opslaan mislukt: ${dbError.message}` };
  }

  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  return { success: true };
}

export async function sendRfq(rfqId: string) {
  const user = await requireAuth();
  const supabase = await createClient();
  const serviceClient = createServiceRoleClient();

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
    return { error: 'RFQ niet gevonden of al verzonden' };
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
    return { error: `Uitnodigingen ophalen mislukt: ${inviteError.message}` };
  }

  if (!invites || invites.length === 0) {
    return { error: 'Geen leveranciers geselecteerd voor deze RFQ' };
  }

  // Send emails to all suppliers with invites
  const results: { supplier: string; success: boolean; error?: string }[] = [];

  for (const invite of invites) {
    if (!invite.supplier) {
      results.push({ supplier: 'Unknown', success: false, error: 'Leverancier niet gevonden' });
      continue;
    }

    // Generate new token for sending (if needed)
    const token = generateToken();
    const tokenHash = hashToken(token);

    // Update the invite with new token if needed
    await serviceClient
      .from('rfq_invites')
      .update({ token_hash: tokenHash })
      .eq('id', invite.id);

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

  // Update RFQ status to sent
  await supabase
    .from('rfqs')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', rfqId);

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
  return { data: { sent: results.filter((r) => r.success).length, total: results.length, results } };
}

export async function closeRfq(rfqId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from('rfqs')
    .update({ status: 'closed' })
    .eq('id', rfqId)
    .eq('status', 'sent');

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
