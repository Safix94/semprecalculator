'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { submitQuoteSchema } from '@/lib/validation';
import { assertTokenHashingConfigured, hashToken } from '@/lib/tokens';
import { calculateAllPricing } from '@/lib/pricing';
import { sendSalesQuoteReceivedEmail } from '@/lib/mailer';
import { logAuditEvent } from './audit';
import type { SubmitQuoteInput } from '@/lib/validation';

/**
 * Validate a supplier token and return the invite + RFQ data.
 * Uses service role because suppliers have no Supabase Auth session.
 */
export async function validateSupplierToken(rfqId: string, token: string) {
  const supabase = createServiceRoleClient();

  try {
    assertTokenHashingConfigured();
  } catch (error) {
    console.error('Supplier token validation failed due to token setup:', error);
    return { error: 'Supplier links are not configured. Please contact support.' };
  }

  const tokenHash = hashToken(token);

  // Find invite by token hash and rfq
  const { data: invite, error } = await supabase
    .from('rfq_invites')
    .select('*, supplier:suppliers(*)')
    .eq('rfq_id', rfqId)
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single();

  if (error || !invite) {
    return { error: 'Invalid or expired link' };
  }

  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    return { error: 'This link has expired' };
  }

  // Fetch RFQ
  const { data: rfq, error: rfqError } = await supabase
    .from('rfqs')
    .select('*, attachments:rfq_attachments(*)')
    .eq('id', rfqId)
    .single();

  if (rfqError || !rfq) {
    return { error: 'Request not found' };
  }

  // Check if already submitted
  const { data: existingQuote } = await supabase
    .from('rfq_quotes')
    .select('*')
    .eq('rfq_id', rfqId)
    .eq('supplier_id', invite.supplier_id)
    .single();

  // Update last access
  await supabase
    .from('rfq_invites')
    .update({ last_access_at: new Date().toISOString() })
    .eq('id', invite.id);

  await logAuditEvent({
    actorType: 'supplier_link',
    actorId: invite.supplier_id,
    action: 'INVITE_OPENED',
    entityType: 'rfq_invite',
    entityId: invite.id,
    metadata: { rfqId },
  });

  return {
    data: {
      invite,
      rfq,
      supplier: invite.supplier,
      existingQuote: existingQuote ?? null,
    },
  };
}

/**
 * Submit a supplier quote. Server-side pricing calculation.
 */
export async function submitQuote(
  rfqId: string,
  token: string,
  input: SubmitQuoteInput
) {
  const supabase = createServiceRoleClient();

  try {
    assertTokenHashingConfigured();
  } catch (error) {
    console.error('Quote submission failed due to token setup:', error);
    return { error: 'Supplier links are not configured. Please contact support.' };
  }

  // Validate token first
  const tokenHash = hashToken(token);

  const { data: invite, error: inviteError } = await supabase
    .from('rfq_invites')
    .select('*')
    .eq('rfq_id', rfqId)
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single();

  if (inviteError || !invite) {
    return { error: 'Invalid or expired link' };
  }

  if (new Date(invite.expires_at) < new Date()) {
    return { error: 'This link has expired' };
  }

  if (invite.used_at) {
    return { error: 'A quote has already been submitted via this link' };
  }

  // Validate input
  const parsed = submitQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { basePrice, volumeM3, leadTimeDays, comment } = parsed.data;

  // Server-side pricing calculation
  const { shippingCostCalculated, finalPriceCalculated } =
    calculateAllPricing(basePrice, volumeM3);

  // Insert quote
  const { data: quote, error: quoteError } = await supabase
    .from('rfq_quotes')
    .insert({
      rfq_id: rfqId,
      supplier_id: invite.supplier_id,
      base_price: basePrice,
      volume_m3: volumeM3,
      shipping_cost_calculated: shippingCostCalculated,
      final_price_calculated: finalPriceCalculated,
      lead_time_days: leadTimeDays ?? null,
      comment: comment ?? null,
    })
    .select()
    .single();

  if (quoteError) {
    return { error: `Failed to save quote: ${quoteError.message}` };
  }

  // Mark invite as used
  await supabase
    .from('rfq_invites')
    .update({ used_at: new Date().toISOString() })
    .eq('id', invite.id);

  // Audit log
  await logAuditEvent({
    actorType: 'supplier_link',
    actorId: invite.supplier_id,
    action: 'QUOTE_SUBMITTED',
    entityType: 'rfq_quote',
    entityId: quote.id,
    metadata: {
      rfqId,
      basePrice,
      volumeM3,
      shippingCostCalculated,
      finalPriceCalculated,
    },
  });

  // Notify sales user who created the RFQ
  const { data: rfq } = await supabase
    .from('rfqs')
    .select('created_by')
    .eq('id', rfqId)
    .single();

  if (rfq) {
    const { data: salesUser } = await supabase.auth.admin.getUserById(rfq.created_by);
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('name')
      .eq('id', invite.supplier_id)
      .single();

    if (salesUser?.user?.email && supplier) {
      const emailResult = await sendSalesQuoteReceivedEmail({
        salesEmail: salesUser.user.email,
        rfqId,
        supplierName: supplier.name,
        finalPrice: finalPriceCalculated,
      });

      await logAuditEvent({
        actorType: 'system',
        actorId: 'mailer',
        action: 'EMAIL_SENT',
        entityType: 'rfq_quote',
        entityId: quote.id,
        metadata: {
          success: emailResult.success,
          error: emailResult.error,
          recipient: salesUser.user.email,
        },
      });
    }
  }

  return { data: quote };
}

/**
 * Get signed URL for a supplier to view an attachment.
 */
export async function getAttachmentUrl(rfqId: string, token: string, storagePath: string) {
  const supabase = createServiceRoleClient();

  try {
    assertTokenHashingConfigured();
  } catch (error) {
    console.error('Attachment access failed due to token setup:', error);
    return { error: 'Supplier links are not configured. Please contact support.' };
  }

  const tokenHash = hashToken(token);

  // Validate token
  const { data: invite } = await supabase
    .from('rfq_invites')
    .select('id')
    .eq('rfq_id', rfqId)
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single();

  if (!invite) {
    return { error: 'Access denied' };
  }

  // Verify attachment belongs to this RFQ
  const { data: attachment } = await supabase
    .from('rfq_attachments')
    .select('id')
    .eq('rfq_id', rfqId)
    .eq('storage_path', storagePath)
    .single();

  if (!attachment) {
    return { error: 'Attachment not found' };
  }

  const { data } = await supabase.storage
    .from('rfq-attachments')
    .createSignedUrl(storagePath, 3600); // 1 hour

  if (!data?.signedUrl) {
    return { error: 'Failed to generate URL' };
  }

  return { url: data.signedUrl };
}
