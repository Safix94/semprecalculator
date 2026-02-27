'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { submitQuoteSchema } from '@/lib/validation';
import { assertTokenHashingConfigured, hashToken } from '@/lib/tokens';
import { calculateAllPricing } from '@/lib/pricing';
import { sendSalesQuoteReceivedEmail } from '@/lib/mailer';
import { logAuditEvent } from './audit';
import type { SubmitQuoteInput } from '@/lib/validation';
import type { RfqQuote } from '@/types';

const SUPPLIER_TOKEN_REGEX = /^[a-f0-9]{64}$/i;

function maskSupplierToken(token: string): string {
  if (token.length < 12) {
    return `len=${token.length}`;
  }
  return `${token.slice(0, 6)}...${token.slice(-4)} (len=${token.length})`;
}

function isValidSupplierToken(token: string): boolean {
  return SUPPLIER_TOKEN_REGEX.test(token);
}

async function getInviteLookupDiagnostics(
  supabase: ReturnType<typeof createServiceRoleClient>,
  rfqId: string,
  tokenHash: string
) {
  const [{ count: activeInviteCount }, { count: revokedInviteCount }, { count: tokenHashMatchCount }] =
    await Promise.all([
      supabase
        .from('rfq_invites')
        .select('id', { count: 'exact', head: true })
        .eq('rfq_id', rfqId)
        .is('revoked_at', null),
      supabase
        .from('rfq_invites')
        .select('id', { count: 'exact', head: true })
        .eq('rfq_id', rfqId)
        .not('revoked_at', 'is', null),
      supabase
        .from('rfq_invites')
        .select('id', { count: 'exact', head: true })
        .eq('token_hash', tokenHash)
        .is('revoked_at', null),
    ]);

  return {
    activeInviteCount: activeInviteCount ?? 0,
    revokedInviteCount: revokedInviteCount ?? 0,
    tokenHashMatchCount: tokenHashMatchCount ?? 0,
  };
}

/**
 * Validate a supplier token and return the invite + RFQ data.
 * Uses service role because suppliers have no Supabase Auth session.
 */
export async function validateSupplierToken(rfqId: string, token: string) {
  const supabase = createServiceRoleClient();
  const normalizedToken = token.trim();

  try {
    assertTokenHashingConfigured();
  } catch (error) {
    console.error('Supplier token validation failed due to token setup:', error);
    return { error: 'Supplier links are not configured. Please contact support.' };
  }

  if (!isValidSupplierToken(normalizedToken)) {
    console.warn('Supplier token validation failed: malformed token.', {
      rfqId,
      token: maskSupplierToken(normalizedToken),
    });
    return { error: 'Invalid link' };
  }

  const tokenHash = hashToken(normalizedToken);

  // Find invite by token hash and rfq
  const { data: invite, error } = await supabase
    .from('rfq_invites')
    .select('*, supplier:suppliers(*)')
    .eq('rfq_id', rfqId)
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single();

  if (error || !invite) {
    const diagnostics = await getInviteLookupDiagnostics(supabase, rfqId, tokenHash);
    console.warn('Supplier token validation failed: invite not found.', {
      rfqId,
      tokenHashPrefix: tokenHash.slice(0, 8),
      supabaseError: error?.message ?? null,
      ...diagnostics,
    });
    return { error: 'Invalid or expired link' };
  }

  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    console.info('Supplier token validation failed: invite expired.', {
      rfqId,
      inviteId: invite.id,
      supplierId: invite.supplier_id,
      expiresAt: invite.expires_at,
      now: new Date().toISOString(),
    });
    return { error: 'This link has expired' };
  }

  // Fetch RFQ
  const { data: rfq, error: rfqError } = await supabase
    .from('rfqs')
    .select('*, attachments:rfq_attachments(*)')
    .eq('id', rfqId)
    .single();

  if (rfqError || !rfq) {
    console.error('Supplier token validation failed: RFQ not found.', {
      rfqId,
      inviteId: invite.id,
      error: rfqError?.message ?? null,
    });
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
  const { error: lastAccessError } = await supabase
    .from('rfq_invites')
    .update({ last_access_at: new Date().toISOString() })
    .eq('id', invite.id);

  if (lastAccessError) {
    console.warn('Failed to update invite last_access_at.', {
      inviteId: invite.id,
      rfqId,
      error: lastAccessError.message,
    });
  }

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
  const normalizedToken = token.trim();

  try {
    assertTokenHashingConfigured();
  } catch (error) {
    console.error('Quote submission failed due to token setup:', error);
    return { error: 'Supplier links are not configured. Please contact support.' };
  }

  if (!isValidSupplierToken(normalizedToken)) {
    console.warn('Quote submission blocked: malformed token.', {
      rfqId,
      token: maskSupplierToken(normalizedToken),
    });
    return { error: 'Invalid link' };
  }

  // Validate token first
  const tokenHash = hashToken(normalizedToken);

  const { data: invite, error: inviteError } = await supabase
    .from('rfq_invites')
    .select('*')
    .eq('rfq_id', rfqId)
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single();

  if (inviteError || !invite) {
    const diagnostics = await getInviteLookupDiagnostics(supabase, rfqId, tokenHash);
    console.warn('Quote submission blocked: invite not found.', {
      rfqId,
      tokenHashPrefix: tokenHash.slice(0, 8),
      supabaseError: inviteError?.message ?? null,
      ...diagnostics,
    });
    return { error: 'Invalid or expired link' };
  }

  if (new Date(invite.expires_at) < new Date()) {
    console.info('Quote submission blocked: invite expired.', {
      rfqId,
      inviteId: invite.id,
      supplierId: invite.supplier_id,
      expiresAt: invite.expires_at,
      now: new Date().toISOString(),
    });
    return { error: 'This link has expired' };
  }

  // Validate input
  const parsed = submitQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { basePrice, areaM2, leadTimeDays, comment } = parsed.data;

  // Fetch RFQ thickness (stored in cm) to derive volume in m3 from supplier area input (m2).
  const { data: rfqForPricing, error: rfqForPricingError } = await supabase
    .from('rfqs')
    .select('thickness, created_by, status')
    .eq('id', rfqId)
    .single();

  if (rfqForPricingError || !rfqForPricing) {
    return { error: 'Request not found' };
  }

  const thicknessCm = Math.max(Number(rfqForPricing.thickness ?? 0), 0);
  const volumeM3 = Math.round(areaM2 * (thicknessCm / 100) * 1000) / 1000;

  // Server-side pricing calculation
  const { shippingCostCalculated, finalPriceCalculated } =
    calculateAllPricing(basePrice, volumeM3);
  const { data: existingQuote, error: existingQuoteError } = await supabase
    .from('rfq_quotes')
    .select('*')
    .eq('rfq_id', rfqId)
    .eq('supplier_id', invite.supplier_id)
    .maybeSingle();

  if (existingQuoteError) {
    return { error: `Failed to check existing quote: ${existingQuoteError.message}` };
  }

  if (invite.used_at) {
    console.info('Quote submission blocked: invite already used.', {
      rfqId,
      inviteId: invite.id,
      supplierId: invite.supplier_id,
      usedAt: invite.used_at,
      hasExistingQuote: Boolean(existingQuote),
    });
    return { error: 'A quote has already been submitted via this link' };
  }

  let quote: RfqQuote | null = null;
  let isQuoteUpdate = false;

  if (existingQuote) {
    const { data: updatedQuote, error: updateQuoteError } = await supabase
      .from('rfq_quotes')
      .update({
        base_price: basePrice,
        area_m2: areaM2,
        volume_m3: volumeM3,
        shipping_cost_calculated: shippingCostCalculated,
        final_price_calculated: finalPriceCalculated,
        lead_time_days: leadTimeDays ?? null,
        comment: comment ?? null,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', existingQuote.id)
      .select()
      .single();

    if (updateQuoteError || !updatedQuote) {
      return { error: `Failed to update quote: ${updateQuoteError?.message ?? 'Unknown error'}` };
    }

    quote = updatedQuote as RfqQuote;
    isQuoteUpdate = true;
  } else {
    const { data: insertedQuote, error: quoteError } = await supabase
      .from('rfq_quotes')
      .insert({
        rfq_id: rfqId,
        supplier_id: invite.supplier_id,
        base_price: basePrice,
        area_m2: areaM2,
        volume_m3: volumeM3,
        shipping_cost_calculated: shippingCostCalculated,
        final_price_calculated: finalPriceCalculated,
        lead_time_days: leadTimeDays ?? null,
        comment: comment ?? null,
      })
      .select()
      .single();

    if (quoteError || !insertedQuote) {
      if (quoteError?.code === '23505') {
        return { error: 'A quote has already been submitted for this request' };
      }
      return { error: `Failed to save quote: ${quoteError?.message ?? 'Unknown error'}` };
    }

    quote = insertedQuote as RfqQuote;
  }

  if (!quote) {
    return { error: 'Failed to save quote' };
  }

  // Mark invite as used
  const { error: markInviteUsedError } = await supabase
    .from('rfq_invites')
    .update({ used_at: new Date().toISOString() })
    .eq('id', invite.id);

  if (markInviteUsedError) {
    console.warn('Failed to mark invite as used after quote submission.', {
      rfqId,
      inviteId: invite.id,
      quoteId: quote.id,
      error: markInviteUsedError.message,
    });
  }

  // Move RFQ to quotes_received once the first quote arrives.
  if (rfqForPricing.status === 'sent_to_supplier' || rfqForPricing.status === 'supplier_replied') {
    const { error: rfqStatusError } = await supabase
      .from('rfqs')
      .update({ status: 'quotes_received' })
      .eq('id', rfqId)
      .in('status', ['sent_to_supplier', 'supplier_replied']);

    if (rfqStatusError) {
      console.warn('Failed to update RFQ status to quotes_received after quote submission.', {
        rfqId,
        quoteId: quote.id,
        error: rfqStatusError.message,
      });
    }
  }

  // Audit log
  await logAuditEvent({
    actorType: 'supplier_link',
    actorId: invite.supplier_id,
    action: isQuoteUpdate ? 'QUOTE_UPDATED' : 'QUOTE_SUBMITTED',
    entityType: 'rfq_quote',
    entityId: quote.id,
    metadata: {
      rfqId,
      basePrice,
      areaM2,
      volumeM3,
      shippingCostCalculated,
      finalPriceCalculated,
    },
  });

  // Notify sales user who created the RFQ
  if (rfqForPricing.created_by) {
    const { data: salesUser } = await supabase.auth.admin.getUserById(rfqForPricing.created_by);
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
  const normalizedToken = token.trim();

  try {
    assertTokenHashingConfigured();
  } catch (error) {
    console.error('Attachment access failed due to token setup:', error);
    return { error: 'Supplier links are not configured. Please contact support.' };
  }

  if (!isValidSupplierToken(normalizedToken)) {
    console.warn('Attachment access blocked: malformed token.', {
      rfqId,
      token: maskSupplierToken(normalizedToken),
      storagePath,
    });
    return { error: 'Access denied' };
  }

  const tokenHash = hashToken(normalizedToken);

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
