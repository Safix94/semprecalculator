'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { submitAutomaticQuoteSchema, submitQuoteSchema } from '@/lib/validation';
import { assertTokenHashingConfigured, hashToken } from '@/lib/tokens';
import { calculateSupplierPricing } from '@/lib/pricing';
import {
  convertSupplierBasePriceToEur,
  normalizeQuotePriceCurrency,
} from '@/lib/currency';
import { sendSalesQuoteReceivedEmail, sendSupplierQuoteConfirmationEmail } from '@/lib/mailer';
import { getSupplierRecipientEmails } from '@/lib/email-recipients';
import { getEffectiveSupplierPricingProfile } from './supplier-pricing';
import {
  SANNE_VOS_BLUESTONE_FORMULA_VERSION,
  calculateSanneVosBluestonePricing,
  isSanneVosBluestoneAutoPricingCandidate,
  resolveSanneVosShapeKind,
  resolveSanneVosSurfaceType,
  type SanneVosBluestoneRate,
  type SanneVosFinishFormula,
} from '@/lib/sanne-vos-pricing';
import {
  checkSupplierLinkRateLimits,
  getSupplierLinkRequestContext,
} from '@/lib/rate-limit';
import type {
  SupplierLinkRateLimitAction,
  SupplierLinkRequestContext,
} from '@/lib/rate-limit';
import { logAuditEvent } from './audit';
import type { SubmitAutomaticQuoteInput, SubmitQuoteInput } from '@/lib/validation';
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

async function enforceSupplierLinkRateLimit(
  action: SupplierLinkRateLimitAction,
  rfqId: string,
  tokenHash: string,
  requestContext: SupplierLinkRequestContext
): Promise<string | null> {
  const result = await checkSupplierLinkRateLimits({
    action,
    requestContext,
    scopes: [
      { name: 'ip', parts: [rfqId, requestContext.ipHash] },
      { name: 'token', parts: [rfqId, tokenHash] },
    ],
  });

  return result.allowed ? null : result.error;
}

async function enforceMalformedSupplierLinkRateLimit(
  action: SupplierLinkRateLimitAction,
  rfqId: string,
  requestContext: SupplierLinkRequestContext
): Promise<string | null> {
  const result = await checkSupplierLinkRateLimits({
    action,
    requestContext,
    scopes: [{ name: 'ip-malformed', parts: [rfqId, requestContext.ipHash] }],
  });

  return result.allowed ? null : result.error;
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
  const requestContext = await getSupplierLinkRequestContext();

  try {
    assertTokenHashingConfigured();
  } catch (error) {
    console.error('Supplier token validation failed due to token setup:', error);
    return { error: 'Supplier links are not configured. Please contact support.' };
  }

  if (!isValidSupplierToken(normalizedToken)) {
    const rateLimitError = await enforceMalformedSupplierLinkRateLimit(
      'supplier_token_validate',
      rfqId,
      requestContext
    );
    if (rateLimitError) {
      return { error: rateLimitError };
    }

    console.warn('Supplier token validation failed: malformed token.', {
      rfqId,
      token: maskSupplierToken(normalizedToken),
    });
    return { error: 'Invalid link' };
  }

  const tokenHash = hashToken(normalizedToken);
  const rateLimitError = await enforceSupplierLinkRateLimit(
    'supplier_token_validate',
    rfqId,
    tokenHash,
    requestContext
  );
  if (rateLimitError) {
    return { error: rateLimitError };
  }

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
    ip: requestContext.ip,
    userAgent: requestContext.userAgent,
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
  const requestContext = await getSupplierLinkRequestContext();

  try {
    assertTokenHashingConfigured();
  } catch (error) {
    console.error('Quote submission failed due to token setup:', error);
    return { error: 'Supplier links are not configured. Please contact support.' };
  }

  if (!isValidSupplierToken(normalizedToken)) {
    const rateLimitError = await enforceMalformedSupplierLinkRateLimit(
      'supplier_quote_submit',
      rfqId,
      requestContext
    );
    if (rateLimitError) {
      return { error: rateLimitError };
    }

    console.warn('Quote submission blocked: malformed token.', {
      rfqId,
      token: maskSupplierToken(normalizedToken),
    });
    return { error: 'Invalid link' };
  }

  // Validate token first
  const tokenHash = hashToken(normalizedToken);
  const rateLimitError = await enforceSupplierLinkRateLimit(
    'supplier_quote_submit',
    rfqId,
    tokenHash,
    requestContext
  );
  if (rateLimitError) {
    return { error: rateLimitError };
  }

  const { data: invite, error: inviteError } = await supabase
    .from('rfq_invites')
    .select('*, supplier:suppliers(name, email, additional_emails, preferred_language, quote_price_currency)')
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

  const { basePrice, volumeM3, leadTimeDays, comment } = parsed.data;

  // Supplier provides volume directly in m3. Do not derive pricing volume from RFQ thickness.
  const { data: rfqForPricing, error: rfqForPricingError } = await supabase
    .from('rfqs')
    .select(`
      created_by,
      status,
      product_type,
      material,
      material_table_top,
      material_table_foot,
      finish,
      finish_top,
      finish_edge,
      finish_color,
      finish_table_top,
      finish_table_foot,
      length,
      width,
      height,
      thickness,
      quantity,
      shape,
      model,
      usage_environment,
      notes,
      attachments:rfq_attachments(file_name)
    `)
    .eq('id', rfqId)
    .single();

  if (rfqForPricingError || !rfqForPricing) {
    return { error: 'Request not found' };
  }

  // Supplier-level pricing calculation. Supplier provides volume directly in m3.
  const inviteSupplier = Array.isArray(invite.supplier) ? invite.supplier[0] : invite.supplier;
  const quotePriceCurrency = normalizeQuotePriceCurrency(inviteSupplier?.quote_price_currency);
  let convertedBasePrice;
  try {
    convertedBasePrice = convertSupplierBasePriceToEur(basePrice, quotePriceCurrency);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supplier base price could not be converted.';
    return { error: message };
  }

  const pricingProfile = await getEffectiveSupplierPricingProfile(invite.supplier_id);
  let pricingResult;
  try {
    pricingResult = calculateSupplierPricing(convertedBasePrice.basePriceEur, volumeM3, pricingProfile);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pricing could not be calculated.';
    console.error('Quote submission blocked: supplier pricing calculation failed.', {
      rfqId,
      supplierId: invite.supplier_id,
      message,
    });
    return { error: message };
  }

  const {
    shippingCostCalculated,
    transportCostCalculated,
    productPriceAfterMargin,
    costIncludingTransport,
    transportAdjustedBasePrice,
    finalPriceCalculated,
    pricingSettingsSnapshot,
  } = pricingResult;

  const quotePricingPayload = {
    shipping_cost_calculated: shippingCostCalculated,
    transport_cost_calculated: transportCostCalculated,
    product_price_after_margin: productPriceAfterMargin,
    cost_including_transport: costIncludingTransport,
    transport_adjusted_base_price: transportAdjustedBasePrice,
    truck_multiplier_factor: pricingProfile.transportMode === 'truck' ? pricingProfile.truckMultiplierFactor ?? 1.5 : null,
    final_price_calculated: finalPriceCalculated,
    pricing_method: pricingProfile.transportMode,
    pricing_formula_version: pricingProfile.formulaVersion,
    retail_multiplier_factor: pricingProfile.retailMultiplierFactor,
    pricing_settings_snapshot: pricingSettingsSnapshot,
    currency: 'EUR',
    supplier_input_price: convertedBasePrice.supplierInputPrice,
    supplier_input_currency: convertedBasePrice.supplierInputCurrency,
    supplier_input_exchange_rate_per_eur: convertedBasePrice.supplierInputExchangeRatePerEur,
    supplier_input_exchange_rate_idr_per_eur: convertedBasePrice.supplierInputExchangeRateIdrPerEur,
    supplier_input_converted_at: convertedBasePrice.supplierInputConvertedAt,
  };

  const { data: existingQuote, error: existingQuoteError } = await supabase
    .from('rfq_quotes')
    .select('*')
    .eq('rfq_id', rfqId)
    .eq('supplier_id', invite.supplier_id)
    .maybeSingle();

  if (existingQuoteError) {
    return { error: `Failed to check existing quote: ${existingQuoteError.message}` };
  }

  if (invite.used_at && !existingQuote) {
    console.info('Quote submission blocked: invite marked used without an existing quote.', {
      rfqId,
      inviteId: invite.id,
      supplierId: invite.supplier_id,
      usedAt: invite.used_at,
    });
    return { error: 'This quote link was already used and no editable quote was found' };
  }

  let quote: RfqQuote | null = null;
  let isQuoteUpdate = false;

  if (existingQuote) {
    const { data: updatedQuote, error: updateQuoteError } = await supabase
      .from('rfq_quotes')
      .update({
        base_price: convertedBasePrice.basePriceEur,
        area_m2: null,
        volume_m3: volumeM3,
        ...quotePricingPayload,
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
        base_price: convertedBasePrice.basePriceEur,
        area_m2: null,
        volume_m3: volumeM3,
        ...quotePricingPayload,
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
      supplierInputPrice: convertedBasePrice.supplierInputPrice,
      supplierInputCurrency: convertedBasePrice.supplierInputCurrency,
      basePriceEur: convertedBasePrice.basePriceEur,
      exchangeRatePerEur: convertedBasePrice.supplierInputExchangeRatePerEur,
      exchangeRateIdrPerEur: convertedBasePrice.supplierInputExchangeRateIdrPerEur,
      volumeM3,
      shippingCostCalculated,
      transportCostCalculated,
      productPriceAfterMargin,
      costIncludingTransport,
      finalPriceCalculated,
      pricingMethod: pricingProfile.transportMode,
      pricingFormulaVersion: pricingProfile.formulaVersion,
      retailMultiplierFactor: pricingProfile.retailMultiplierFactor,
    },
    ip: requestContext.ip,
    userAgent: requestContext.userAgent,
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

  // Send confirmation email to supplier recipients. Do not expose internal calculated retail price or margins.
  if (inviteSupplier?.email && inviteSupplier?.name) {
    const supplierRecipients = getSupplierRecipientEmails({
      email: inviteSupplier.email,
      additional_emails: inviteSupplier.additional_emails ?? [],
    });

    try {
      const attachments = Array.isArray(rfqForPricing.attachments) ? rfqForPricing.attachments : [];
      const emailResult = await sendSupplierQuoteConfirmationEmail({
        supplierEmails: supplierRecipients,
        supplierName: inviteSupplier.name,
        rfqId,
        token: normalizedToken,
        rfq: {
          productType: rfqForPricing.product_type,
          material: rfqForPricing.material,
          materialTableTop: rfqForPricing.material_table_top,
          materialTableFoot: rfqForPricing.material_table_foot,
          shape: rfqForPricing.shape,
          finish: rfqForPricing.finish,
          finishTop: rfqForPricing.finish_top,
          finishEdge: rfqForPricing.finish_edge,
          finishColor: rfqForPricing.finish_color,
          finishTableTop: rfqForPricing.finish_table_top,
          finishTableFoot: rfqForPricing.finish_table_foot,
          length: rfqForPricing.length,
          width: rfqForPricing.width,
          height: rfqForPricing.height,
          thickness: rfqForPricing.thickness,
          quantity: rfqForPricing.quantity,
          model: rfqForPricing.model,
          usageEnvironment: rfqForPricing.usage_environment,
          notes: rfqForPricing.notes,
          attachmentNames: attachments
            .map((attachment) => attachment?.file_name)
            .filter((fileName): fileName is string => Boolean(fileName)),
        },
        quote: {
          supplierInputPrice: convertedBasePrice.supplierInputPrice,
          supplierInputCurrency: convertedBasePrice.supplierInputCurrency,
          volumeM3,
          leadTimeDays,
          comment: comment ?? null,
          submittedAt: quote.submitted_at,
          isUpdate: isQuoteUpdate,
        },
        language: inviteSupplier.preferred_language,
      });

      await logAuditEvent({
        actorType: 'system',
        actorId: 'mailer',
        action: 'EMAIL_SENT',
        entityType: 'rfq_quote',
        entityId: quote.id,
        metadata: {
          emailType: 'supplier_quote_confirmation',
          success: emailResult.success,
          sent: emailResult.sent,
          total: emailResult.total,
          error: emailResult.error,
          recipients: supplierRecipients,
          isQuoteUpdate,
        },
      });
    } catch (emailError) {
      const message = emailError instanceof Error ? emailError.message : 'Unknown email error';
      console.warn('Failed to send supplier quote confirmation email.', {
        rfqId,
        quoteId: quote.id,
        supplierId: invite.supplier_id,
        error: message,
      });
      await logAuditEvent({
        actorType: 'system',
        actorId: 'mailer',
        action: 'EMAIL_SENT',
        entityType: 'rfq_quote',
        entityId: quote.id,
        metadata: {
          emailType: 'supplier_quote_confirmation',
          success: false,
          error: message,
          recipients: supplierRecipients,
          isQuoteUpdate,
        },
      });
    }
  }

  return { data: quote };
}

export async function submitAutomaticSanneVosQuote(
  rfqId: string,
  token: string,
  input: SubmitAutomaticQuoteInput
) {
  const supabase = createServiceRoleClient();
  const normalizedToken = token.trim();
  const requestContext = await getSupplierLinkRequestContext();

  try {
    assertTokenHashingConfigured();
  } catch (error) {
    console.error('Automatic quote submission failed due to token setup:', error);
    return { error: 'Supplier links are not configured. Please contact support.' };
  }

  if (!isValidSupplierToken(normalizedToken)) {
    const rateLimitError = await enforceMalformedSupplierLinkRateLimit(
      'supplier_quote_submit',
      rfqId,
      requestContext
    );
    if (rateLimitError) {
      return { error: rateLimitError };
    }

    console.warn('Automatic quote submission blocked: malformed token.', {
      rfqId,
      token: maskSupplierToken(normalizedToken),
    });
    return { error: 'Invalid link' };
  }

  const tokenHash = hashToken(normalizedToken);
  const rateLimitError = await enforceSupplierLinkRateLimit(
    'supplier_quote_submit',
    rfqId,
    tokenHash,
    requestContext
  );
  if (rateLimitError) {
    return { error: rateLimitError };
  }

  const { data: invite, error: inviteError } = await supabase
    .from('rfq_invites')
    .select('*, supplier:suppliers(name, email, additional_emails, preferred_language, quote_price_currency)')
    .eq('rfq_id', rfqId)
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single();

  if (inviteError || !invite) {
    const diagnostics = await getInviteLookupDiagnostics(supabase, rfqId, tokenHash);
    console.warn('Automatic quote submission blocked: invite not found.', {
      rfqId,
      tokenHashPrefix: tokenHash.slice(0, 8),
      supabaseError: inviteError?.message ?? null,
      ...diagnostics,
    });
    return { error: 'Invalid or expired link' };
  }

  if (new Date(invite.expires_at) < new Date()) {
    return { error: 'This link has expired' };
  }

  const parsed = submitAutomaticQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { leadTimeDays, comment } = parsed.data;
  const { data: rfqForPricing, error: rfqForPricingError } = await supabase
    .from('rfqs')
    .select(`
      created_by,
      status,
      product_type,
      material,
      material_table_top,
      material_table_foot,
      finish,
      finish_top,
      finish_edge,
      finish_color,
      finish_table_top,
      finish_table_foot,
      length,
      width,
      height,
      thickness,
      quantity,
      shape,
      model,
      usage_environment,
      notes,
      attachments:rfq_attachments(file_name)
    `)
    .eq('id', rfqId)
    .single();

  if (rfqForPricingError || !rfqForPricing) {
    return { error: 'Request not found' };
  }

  const inviteSupplier = Array.isArray(invite.supplier) ? invite.supplier[0] : invite.supplier;
  if (!isSanneVosBluestoneAutoPricingCandidate(inviteSupplier?.name, rfqForPricing)) {
    return { error: 'Automatic pricing is only configured for Sanne Vos + Bluestone requests.' };
  }

  if (!rfqForPricing.finish) {
    return { error: 'No finish selected for this Bluestone request.' };
  }

  const { data: existingQuote, error: existingQuoteError } = await supabase
    .from('rfq_quotes')
    .select('*')
    .eq('rfq_id', rfqId)
    .eq('supplier_id', invite.supplier_id)
    .maybeSingle();

  if (existingQuoteError) {
    return { error: `Failed to check existing quote: ${existingQuoteError.message}` };
  }

  if (invite.used_at && !existingQuote) {
    return { error: 'This quote link was already used and no editable quote was found' };
  }

  const { data: material, error: materialError } = await supabase
    .from('materials')
    .select('id, name')
    .ilike('name', 'Bluestone')
    .maybeSingle();

  if (materialError || !material) {
    return { error: 'Bluestone material configuration was not found.' };
  }

  const { data: finishOption, error: finishError } = await supabase
    .from('finish_options')
    .select('name, abbreviation, formula_percentage')
    .ilike('name', rfqForPricing.finish)
    .maybeSingle();

  if (finishError || !finishOption) {
    return { error: `Finish "${rfqForPricing.finish}" is not configured in the finish master list.` };
  }

  const shapeKind = resolveSanneVosShapeKind(rfqForPricing.shape);
  const surfaceType = resolveSanneVosSurfaceType(finishOption.abbreviation);
  const thicknessCm = Number(rfqForPricing.thickness);
  const baseRateQuery = () => supabase
    .from('supplier_special_pricing_bluestone_rates')
    .select('shape_kind, thickness_cm, surface_type, base_price_per_m2_eur, discount_percentage, net_price_per_m2_eur, is_supported, unsupported_reason')
    .eq('supplier_id', invite.supplier_id)
    .eq('material_id', material.id)
    .eq('shape_kind', shapeKind)
    .eq('thickness_cm', thicknessCm);

  let { data: rate, error: rateError } = await baseRateQuery()
    .eq('surface_type', surfaceType)
    .maybeSingle();

  if (!rate && surfaceType === 'saw_cut') {
    const fallback = await baseRateQuery()
      .eq('surface_type', 'sanded')
      .maybeSingle();
    rate = fallback.data;
    rateError = fallback.error;
  }

  if (rateError || !rate) {
    return { error: `No Sanne Vos Bluestone rate found for ${shapeKind} ${thicknessCm} cm.` };
  }

  let automaticPricing;
  try {
    automaticPricing = calculateSanneVosBluestonePricing({
      rfq: rfqForPricing,
      rate: rate as SanneVosBluestoneRate,
      finish: finishOption as SanneVosFinishFormula,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Automatic pricing could not be calculated.';
    console.error('Automatic quote submission blocked: Sanne Vos pricing calculation failed.', {
      rfqId,
      supplierId: invite.supplier_id,
      message,
    });
    return { error: message };
  }

  const quotePricingPayload = {
    shipping_cost_calculated: 0,
    transport_cost_calculated: 0,
    product_price_after_margin: automaticPricing.productPriceAfterMargin,
    cost_including_transport: automaticPricing.lossAdjustedBasePrice,
    transport_adjusted_base_price: null,
    truck_multiplier_factor: null,
    final_price_calculated: automaticPricing.finalPriceCalculated,
    pricing_method: 'none',
    pricing_formula_version: SANNE_VOS_BLUESTONE_FORMULA_VERSION,
    retail_multiplier_factor: 2.95,
    pricing_settings_snapshot: automaticPricing.pricingSettingsSnapshot,
    currency: 'EUR',
    supplier_input_price: null,
    supplier_input_currency: 'EUR',
    supplier_input_exchange_rate_per_eur: null,
    supplier_input_exchange_rate_idr_per_eur: null,
    supplier_input_converted_at: null,
  };

  let quote: RfqQuote | null = null;
  let isQuoteUpdate = false;

  if (existingQuote) {
    const { data: updatedQuote, error: updateQuoteError } = await supabase
      .from('rfq_quotes')
      .update({
        base_price: automaticPricing.basePriceBeforeLoss,
        area_m2: automaticPricing.totalAreaM2,
        volume_m3: 0,
        ...quotePricingPayload,
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
        base_price: automaticPricing.basePriceBeforeLoss,
        area_m2: automaticPricing.totalAreaM2,
        volume_m3: 0,
        ...quotePricingPayload,
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

  const { error: markInviteUsedError } = await supabase
    .from('rfq_invites')
    .update({ used_at: new Date().toISOString() })
    .eq('id', invite.id);

  if (markInviteUsedError) {
    console.warn('Failed to mark invite as used after automatic quote submission.', {
      rfqId,
      inviteId: invite.id,
      quoteId: quote.id,
      error: markInviteUsedError.message,
    });
  }

  if (rfqForPricing.status === 'sent_to_supplier' || rfqForPricing.status === 'supplier_replied') {
    const { error: rfqStatusError } = await supabase
      .from('rfqs')
      .update({ status: 'quotes_received' })
      .eq('id', rfqId)
      .in('status', ['sent_to_supplier', 'supplier_replied']);

    if (rfqStatusError) {
      console.warn('Failed to update RFQ status to quotes_received after automatic quote submission.', {
        rfqId,
        quoteId: quote.id,
        error: rfqStatusError.message,
      });
    }
  }

  await logAuditEvent({
    actorType: 'supplier_link',
    actorId: invite.supplier_id,
    action: isQuoteUpdate ? 'QUOTE_UPDATED' : 'QUOTE_SUBMITTED',
    entityType: 'rfq_quote',
    entityId: quote.id,
    metadata: {
      rfqId,
      automaticPricing: true,
      pricingFormulaVersion: SANNE_VOS_BLUESTONE_FORMULA_VERSION,
      areaM2: automaticPricing.totalAreaM2,
      basePriceEur: automaticPricing.basePriceBeforeLoss,
      lossAdjustedBasePrice: automaticPricing.lossAdjustedBasePrice,
      productPriceAfterMargin: automaticPricing.productPriceAfterMargin,
      finalPriceCalculated: automaticPricing.finalPriceCalculated,
      finishMargin: automaticPricing.finishMargin,
      finishPercentageMultiplier: automaticPricing.finishPercentageMultiplier,
      retailMultiplierFactor: 2.95,
    },
    ip: requestContext.ip,
    userAgent: requestContext.userAgent,
  });

  if (rfqForPricing.created_by) {
    const { data: salesUser } = await supabase.auth.admin.getUserById(rfqForPricing.created_by);

    if (salesUser?.user?.email && inviteSupplier?.name) {
      const emailResult = await sendSalesQuoteReceivedEmail({
        salesEmail: salesUser.user.email,
        rfqId,
        supplierName: inviteSupplier.name,
        finalPrice: automaticPricing.finalPriceCalculated,
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
          automaticPricing: true,
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
  const requestContext = await getSupplierLinkRequestContext();

  try {
    assertTokenHashingConfigured();
  } catch (error) {
    console.error('Attachment access failed due to token setup:', error);
    return { error: 'Supplier links are not configured. Please contact support.' };
  }

  if (!isValidSupplierToken(normalizedToken)) {
    const rateLimitError = await enforceMalformedSupplierLinkRateLimit(
      'supplier_attachment_url',
      rfqId,
      requestContext
    );
    if (rateLimitError) {
      return { error: rateLimitError };
    }

    console.warn('Attachment access blocked: malformed token.', {
      rfqId,
      token: maskSupplierToken(normalizedToken),
      storagePath,
    });
    return { error: 'Access denied' };
  }

  const tokenHash = hashToken(normalizedToken);
  const rateLimitError = await enforceSupplierLinkRateLimit(
    'supplier_attachment_url',
    rfqId,
    tokenHash,
    requestContext
  );
  if (rateLimitError) {
    return { error: rateLimitError };
  }

  // Validate token
  const { data: invite } = await supabase
    .from('rfq_invites')
    .select('id, supplier_id, expires_at')
    .eq('rfq_id', rfqId)
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single();

  if (!invite) {
    return { error: 'Access denied' };
  }

  if (new Date(invite.expires_at) < new Date()) {
    return { error: 'This link has expired' };
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
