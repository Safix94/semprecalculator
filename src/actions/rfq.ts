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

  const parsed = createRfqSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { data: rfq, error } = await supabase
    .from('rfqs')
    .insert({
      ...parsed.data,
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

  // Fetch the RFQ
  const { data: rfq, error: rfqError } = await supabase
    .from('rfqs')
    .select('*')
    .eq('id', rfqId)
    .eq('status', 'draft')
    .single();

  if (rfqError || !rfq) {
    return { error: 'RFQ niet gevonden of al verzonden' };
  }

  // Find matching suppliers by material
  const { data: suppliers, error: suppError } = await supabase
    .from('suppliers')
    .select('*')
    .contains('materials', [rfq.material])
    .eq('is_active', true);

  if (suppError) {
    return { error: `Leveranciers ophalen mislukt: ${suppError.message}` };
  }

  if (!suppliers || suppliers.length === 0) {
    return { error: 'Geen leveranciers gevonden voor dit materiaal' };
  }

  // Create invites and send emails
  const results: { supplier: string; success: boolean; error?: string }[] = [];

  for (const supplier of suppliers) {
    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Insert invite using service role (to ensure it works even if RLS is strict)
    const { data: invite, error: inviteError } = await serviceClient
      .from('rfq_invites')
      .insert({
        rfq_id: rfqId,
        supplier_id: supplier.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (inviteError) {
      results.push({ supplier: supplier.name, success: false, error: inviteError.message });
      continue;
    }

    await logAuditEvent({
      actorType: user.role,
      actorId: user.id,
      action: 'INVITE_CREATED',
      entityType: 'rfq_invite',
      entityId: invite.id,
      metadata: { rfqId, supplierId: supplier.id },
    });

    // Send email
    const emailResult = await sendSupplierInviteEmail({
      supplierEmail: supplier.email,
      supplierName: supplier.name,
      rfqId,
      token,
      material: rfq.material,
      shape: rfq.shape,
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
        supplierEmail: supplier.email,
      },
    });

    results.push({
      supplier: supplier.name,
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
    metadata: { supplierCount: suppliers.length, results },
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
