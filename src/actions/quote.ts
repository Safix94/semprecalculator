'use server';

import { after } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getSupplierTranslations, normalizeSupplierLanguage } from '@/lib/supplier-language';
import { resolveSupplierInviteByToken } from '@/lib/supplier-invite';
import { submitAutomaticQuoteSchema, submitQuoteSchema } from '@/lib/validation';
import { calculateSupplierPricing, calculateVolumeM3FromCm } from '@/lib/pricing';
import {
  convertSupplierBasePriceToEur,
  normalizeQuotePriceCurrency,
} from '@/lib/currency';
import { getFxRates } from '@/lib/fx-rates';
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
import { logAuditEvent } from './audit';
import type { SubmitAutomaticQuoteInput, SubmitQuoteInput } from '@/lib/validation';
import type {
  RfqQuote,
  SupplierContactView,
  SupplierInviteView,
  SupplierQuoteView,
  SupplierRfqView,
} from '@/types';

// Supplier-safe projections: never select internal pricing, margins,
// customer data or token hashes into supplier-facing responses.
const SUPPLIER_RFQ_COLUMNS =
  'id, product_type, material, material_table_top, material_table_foot, finish, finish_top, finish_edge, finish_color, finish_table_top, finish_table_foot, length, width, height, thickness, quantity, shape, model, usage_environment, notes, status';
const SUPPLIER_ATTACHMENT_COLUMNS = 'id, rfq_id, storage_path, file_name, mime_type, created_at';
const SUPPLIER_QUOTE_COLUMNS =
  'id, base_price, volume_m3, lead_time_days, comment, submitted_at, pricing_formula_version, supplier_input_price, supplier_input_currency';

/**
 * Validate a supplier token and return the invite + RFQ data.
 * Uses service role because suppliers have no Supabase Auth session.
 */
export async function validateSupplierToken(rfqId: string, token: string) {
  const supabase = createServiceRoleClient();

  const resolved = await resolveSupplierInviteByToken({
    rfqId,
    token,
    action: 'supplier_token_validate',
    supplierColumns: 'id, name, preferred_language, quote_price_currency',
    distinguishRevoked: true,
    logPrefix: 'Supplier token validation failed',
  });

  if ('error' in resolved) {
    if (resolved.reason === 'revoked') {
      // Revoked means the request was closed — show that instead of a
      // generic invalid-link error, in the supplier's language.
      const revokedSupplier = (Array.isArray(resolved.revokedInvite?.supplier)
        ? resolved.revokedInvite?.supplier[0]
        : resolved.revokedInvite?.supplier) as SupplierContactView | null;
      const labels = getSupplierTranslations(normalizeSupplierLanguage(revokedSupplier?.preferred_language));
      return { error: labels.requestClosedMessage, errorTitle: labels.requestClosedTitle };
    }

    return { error: resolved.error };
  }

  const { invite, requestContext } = resolved;
  const supplier = (Array.isArray(invite.supplier) ? invite.supplier[0] : invite.supplier) as
    | SupplierContactView
    | null;

  // RFQ and existing quote only depend on the invite — fetch them in parallel.
  const [{ data: rfq, error: rfqError }, { data: existingQuote }] = await Promise.all([
    supabase
      .from('rfqs')
      .select(`${SUPPLIER_RFQ_COLUMNS}, attachments:rfq_attachments(${SUPPLIER_ATTACHMENT_COLUMNS})`)
      .eq('id', rfqId)
      .single(),
    supabase
      .from('rfq_quotes')
      .select(SUPPLIER_QUOTE_COLUMNS)
      .eq('rfq_id', rfqId)
      .eq('supplier_id', invite.supplier_id)
      .maybeSingle(),
  ]);

  if (rfqError || !rfq) {
    console.error('Supplier token validation failed: RFQ not found.', {
      rfqId,
      inviteId: invite.id,
      error: rfqError?.message ?? null,
    });
    return { error: 'Request not found' };
  }

  // Bookkeeping writes don't affect the response — run them after it is sent.
  after(async () => {
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
  });

  return {
    data: {
      invite: { id: invite.id, invite_part: invite.invite_part, used_at: invite.used_at } as SupplierInviteView,
      rfq: rfq as unknown as SupplierRfqView,
      supplier,
      existingQuote: (existingQuote as SupplierQuoteView | null) ?? null,
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

  const resolved = await resolveSupplierInviteByToken({
    rfqId,
    token,
    action: 'supplier_quote_submit',
    supplierColumns: 'name, email, additional_emails, preferred_language, quote_price_currency',
    logPrefix: 'Quote submission blocked',
  });

  if ('error' in resolved) {
    return { error: resolved.error };
  }

  const { invite, requestContext } = resolved;

  // Validate input
  const parsed = submitQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { basePrice, lengthCm, widthCm, heightCm, leadTimeDays, comment } = parsed.data;
  const volumeM3 = calculateVolumeM3FromCm(lengthCm, widthCm, heightCm);

  // Supplier provides dimensions in cm; backend calculates volume in m³ for pricing.
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

  // Supplier-level pricing calculation. Supplier dimensions were converted to volumeM3 above.
  const inviteSupplier = Array.isArray(invite.supplier) ? invite.supplier[0] : invite.supplier;

  // Closed requests no longer accept quotes, even while the link is valid.
  if (rfqForPricing.status === 'closed') {
    const labels = getSupplierTranslations(normalizeSupplierLanguage(inviteSupplier?.preferred_language));
    return { error: labels.requestClosedSubmitError };
  }

  const quotePriceCurrency = normalizeQuotePriceCurrency(inviteSupplier?.quote_price_currency);
  let convertedBasePrice;
  try {
    const fxRates = await getFxRates();
    convertedBasePrice = convertSupplierBasePriceToEur(basePrice, quotePriceCurrency, fxRates);
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

  const savedQuote = quote;

  // Mark invite as used
  const { error: markInviteUsedError } = await supabase
    .from('rfq_invites')
    .update({ used_at: new Date().toISOString() })
    .eq('id', invite.id);

  if (markInviteUsedError) {
    console.warn('Failed to mark invite as used after quote submission.', {
      rfqId,
      inviteId: invite.id,
      quoteId: savedQuote.id,
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
      lengthCm,
      widthCm,
      heightCm,
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

  // Notifications don't affect the supplier's result — send them after the
  // response so the submit button resolves without waiting on Brevo.
  after(async () => {
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
          entityId: savedQuote.id,
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
            submittedAt: savedQuote.submitted_at,
            isUpdate: isQuoteUpdate,
          },
          language: inviteSupplier.preferred_language,
        });

        await logAuditEvent({
          actorType: 'system',
          actorId: 'mailer',
          action: 'EMAIL_SENT',
          entityType: 'rfq_quote',
          entityId: savedQuote.id,
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
          quoteId: savedQuote.id,
          supplierId: invite.supplier_id,
          error: message,
        });
        await logAuditEvent({
          actorType: 'system',
          actorId: 'mailer',
          action: 'EMAIL_SENT',
          entityType: 'rfq_quote',
          entityId: savedQuote.id,
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
  });

  // Supplier-facing response: only expose the quote id, never pricing fields.
  return { data: { id: savedQuote.id } };
}

export async function submitAutomaticSanneVosQuote(
  rfqId: string,
  token: string,
  input: SubmitAutomaticQuoteInput
) {
  const supabase = createServiceRoleClient();

  const resolved = await resolveSupplierInviteByToken({
    rfqId,
    token,
    action: 'supplier_quote_submit',
    supplierColumns: 'name, email, additional_emails, preferred_language, quote_price_currency',
    logPrefix: 'Automatic quote submission blocked',
  });

  if ('error' in resolved) {
    return { error: resolved.error };
  }

  const { invite, requestContext } = resolved;

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

  // Closed requests no longer accept quotes, even while the link is valid.
  if (rfqForPricing.status === 'closed') {
    const labels = getSupplierTranslations(normalizeSupplierLanguage(inviteSupplier?.preferred_language));
    return { error: labels.requestClosedSubmitError };
  }

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

  const savedQuote = quote;

  const { error: markInviteUsedError } = await supabase
    .from('rfq_invites')
    .update({ used_at: new Date().toISOString() })
    .eq('id', invite.id);

  if (markInviteUsedError) {
    console.warn('Failed to mark invite as used after automatic quote submission.', {
      rfqId,
      inviteId: invite.id,
      quoteId: savedQuote.id,
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

  // Sales notification doesn't affect the supplier's result — send it after
  // the response so the submit button resolves without waiting on Brevo.
  after(async () => {
    if (!rfqForPricing.created_by) {
      return;
    }

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
        entityId: savedQuote.id,
        metadata: {
          success: emailResult.success,
          error: emailResult.error,
          recipient: salesUser.user.email,
          automaticPricing: true,
        },
      });
    }
  });

  // Supplier-facing response: only expose the quote id, never pricing fields.
  return { data: { id: savedQuote.id } };
}

/**
 * Get signed URL for a supplier to view an attachment.
 */
export async function getAttachmentUrl(rfqId: string, token: string, storagePath: string) {
  const supabase = createServiceRoleClient();

  const resolved = await resolveSupplierInviteByToken({
    rfqId,
    token,
    action: 'supplier_attachment_url',
    invalidMessage: 'Access denied',
    notFoundMessage: 'Access denied',
    logPrefix: 'Attachment access blocked',
  });

  if ('error' in resolved) {
    return { error: resolved.error };
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
