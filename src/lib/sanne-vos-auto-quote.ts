import { createServiceRoleClient } from '@/lib/supabase/server';
import { isTableTopsProductType } from '@/lib/rfq-format';
import { logAuditEvent } from '@/actions/audit';
import {
  SANNE_VOS_BLUESTONE_FORMULA_VERSION,
  SANNE_VOS_RETAIL_MULTIPLIER,
  calculateSanneVosBluestonePricing,
  composeSanneVosFinishCodes,
  isSanneVosBluestoneAutoPricingCandidate,
  isSanneVosNeutralFinishPart,
  resolveSanneVosShapeKind,
  resolveSanneVosSurfaceType,
  type SanneVosBluestonePricingResult,
  type SanneVosBluestoneRate,
  type SanneVosFinishFormula,
} from '@/lib/sanne-vos-pricing';
import type { ActorType, RfqQuote } from '@/types';

/**
 * Sanne Vos is an internal Sempre employee who acts as the Bluestone "supplier".
 * Her quotes are never typed in: this module prices a request server-side and
 * stores the quote, so nothing has to be emailed to her or submitted via a link.
 *
 * Entry points:
 * - generateSanneVosAutomaticQuote: price one invite and upsert its quote.
 * - runSanneVosAutomaticQuoteForInvite: same, but records failures on the RFQ.
 * - autoQuoteSanneVosInvites: price every Sanne Vos + Bluestone invite of an RFQ.
 */

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

type FinishOptionRow = Pick<SanneVosFinishFormula, 'name' | 'abbreviation' | 'formula_percentage'>;

type SanneVosFinishResolution =
  | { finishOption: FinishOptionRow; finishCode: string | null }
  | { error: string };

const FINISH_OPTION_COLUMNS = 'name, abbreviation, formula_percentage';

const RFQ_PRICING_COLUMNS =
  'id, created_by, status, product_type, material, finish, finish_top, finish_edge, finish_color, length, width, thickness, quantity, shape';

interface RfqForPricing {
  id: string;
  created_by: string | null;
  status: string;
  product_type: string | null;
  material: string | null;
  finish: string | null;
  finish_top: string | null;
  finish_edge: string | null;
  finish_color: string | null;
  length: number | string | null;
  width: number | string | null;
  thickness: number | string | null;
  quantity: number | string | null;
  shape: string | null;
}

export interface SanneVosActor {
  type: ActorType;
  id: string;
}

export interface SanneVosAutomaticQuoteParams {
  rfqId: string;
  supplierId: string;
  supplierName: string | null | undefined;
  /** Invite to mark as used once the quote is stored; optional for internal runs. */
  inviteId?: string | null;
  /** Undefined keeps the value of an existing quote; null clears it. */
  leadTimeDays?: number | null;
  comment?: string | null;
  actor: SanneVosActor;
  requestContext?: { ip?: string | null; userAgent?: string | null };
  supabase?: ServiceClient;
}

export type SanneVosAutomaticQuoteResult =
  | {
      data: {
        quote: RfqQuote;
        pricing: SanneVosBluestonePricingResult;
        isUpdate: boolean;
        rfqStatus: string;
        createdBy: string | null;
      };
    }
  | { error: string; code?: 'closed' | 'not_candidate' };

/**
 * Finds the finish master-list row that drives Sanne Vos Bluestone pricing.
 *
 * Table tops carry three partial finishes (top, edge, color). Their master-list
 * abbreviations are combined into one code in the order top + color + edge
 * (e.g. Antique + Fumé + Rocky → "AFR"); Regular / N.v.t. parts add nothing.
 * Other product types keep a single finish name that is looked up directly.
 */
export async function resolveSanneVosFinishOption(
  supabase: ServiceClient,
  rfq: Pick<RfqForPricing, 'product_type' | 'finish' | 'finish_top' | 'finish_edge' | 'finish_color'>
): Promise<SanneVosFinishResolution> {
  if (!isTableTopsProductType(rfq.product_type)) {
    if (isSanneVosNeutralFinishPart(rfq.finish)) {
      return resolveRegularFinishOption(supabase);
    }

    const { data: finishOption, error } = await supabase
      .from('finish_options')
      .select(FINISH_OPTION_COLUMNS)
      .ilike('name', rfq.finish ?? '')
      .eq('is_active', true)
      .maybeSingle();

    if (error || !finishOption) {
      return { error: `Finish "${rfq.finish}" is not configured in the finish master list.` };
    }

    return { finishOption, finishCode: finishOption.abbreviation };
  }

  // Canonical order for the composed code: top, color, edge.
  const orderedParts = [rfq.finish_top, rfq.finish_color, rfq.finish_edge];
  const relevantParts = orderedParts.filter((part): part is string => !isSanneVosNeutralFinishPart(part));
  const combinationLabel = `${rfq.finish_top ?? '-'} / ${rfq.finish_edge ?? '-'} / ${rfq.finish_color ?? '-'}`;

  if (relevantParts.length === 0) {
    return resolveRegularFinishOption(supabase);
  }

  const { data: partRows, error: partsError } = await supabase
    .from('finish_options')
    .select(FINISH_OPTION_COLUMNS)
    .in('name', relevantParts)
    .eq('is_active', true);

  if (partsError) {
    return { error: `Failed to load finish options: ${partsError.message}` };
  }

  const abbreviationByName = new Map(
    (partRows ?? []).map((row) => [row.name.trim().toLowerCase(), row.abbreviation as string | null])
  );
  const partCodes = relevantParts.map((part) => abbreviationByName.get(part.trim().toLowerCase()) ?? null);
  const missingPart = relevantParts.find((_, index) => !partCodes[index]);
  if (missingPart) {
    return {
      error: `Finish "${missingPart}" has no abbreviation in the finish master list, so the combination "${combinationLabel}" cannot be priced.`,
    };
  }

  const candidates = composeSanneVosFinishCodes(partCodes);
  const { data: candidateRows, error: candidatesError } = await supabase
    .from('finish_options')
    .select(FINISH_OPTION_COLUMNS)
    .in('abbreviation', candidates)
    .eq('is_active', true);

  if (candidatesError) {
    return { error: `Failed to load finish options: ${candidatesError.message}` };
  }

  const rowByCode = new Map(
    (candidateRows ?? []).map((row) => [String(row.abbreviation ?? '').toUpperCase(), row])
  );
  const matchedCode = candidates.find((candidate) => rowByCode.has(candidate));
  const matchedRow = matchedCode ? rowByCode.get(matchedCode) : undefined;
  if (!matchedCode || !matchedRow) {
    return {
      error: `Finish combination "${combinationLabel}" (code ${candidates[0]}) is not configured in the finish master list.`,
    };
  }

  return { finishOption: matchedRow, finishCode: matchedCode };
}

async function resolveRegularFinishOption(supabase: ServiceClient): Promise<SanneVosFinishResolution> {
  const { data: regular, error } = await supabase
    .from('finish_options')
    .select(FINISH_OPTION_COLUMNS)
    .ilike('name', 'Regular')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !regular) {
    return { error: 'Finish "Regular" is not configured in the finish master list.' };
  }

  // Regular carries no code: no finish surcharge and the default margin.
  return { finishOption: regular, finishCode: null };
}

/**
 * Prices one Sanne Vos + Bluestone invite and creates or updates its quote.
 * Marks the invite as used, moves a sent RFQ to "quotes_received" and writes the
 * audit event. It never sends email; callers decide about notifications.
 */
export async function generateSanneVosAutomaticQuote(
  params: SanneVosAutomaticQuoteParams
): Promise<SanneVosAutomaticQuoteResult> {
  const supabase = params.supabase ?? createServiceRoleClient();
  const { rfqId, supplierId } = params;

  const { data: rfq, error: rfqError } = await supabase
    .from('rfqs')
    .select(RFQ_PRICING_COLUMNS)
    .eq('id', rfqId)
    .single();

  if (rfqError || !rfq) {
    return { error: 'Request not found' };
  }
  const rfqForPricing = rfq as RfqForPricing;

  // Closed requests no longer accept quotes.
  if (rfqForPricing.status === 'closed') {
    return { error: 'This request is closed.', code: 'closed' };
  }

  if (!isSanneVosBluestoneAutoPricingCandidate(params.supplierName, rfqForPricing)) {
    return { error: 'Automatic pricing is only configured for Sanne Vos + Bluestone requests.', code: 'not_candidate' };
  }

  if (!rfqForPricing.finish) {
    return { error: 'No finish selected for this Bluestone request.' };
  }

  const { data: existingQuote, error: existingQuoteError } = await supabase
    .from('rfq_quotes')
    .select('*')
    .eq('rfq_id', rfqId)
    .eq('supplier_id', supplierId)
    .maybeSingle();

  if (existingQuoteError) {
    return { error: `Failed to check existing quote: ${existingQuoteError.message}` };
  }

  const { data: material, error: materialError } = await supabase
    .from('materials')
    .select('id, name')
    .ilike('name', 'Bluestone')
    .maybeSingle();

  if (materialError || !material) {
    return { error: 'Bluestone material configuration was not found.' };
  }

  const finishResolution = await resolveSanneVosFinishOption(supabase, rfqForPricing);
  if ('error' in finishResolution) {
    return { error: finishResolution.error };
  }
  const { finishOption, finishCode } = finishResolution;

  const shapeKind = resolveSanneVosShapeKind(rfqForPricing.shape);
  const surfaceType = resolveSanneVosSurfaceType(finishCode);
  const thicknessCm = Number(rfqForPricing.thickness);
  const baseRateQuery = () =>
    supabase
      .from('supplier_special_pricing_bluestone_rates')
      .select('shape_kind, thickness_cm, surface_type, base_price_per_m2_eur, discount_percentage, net_price_per_m2_eur, is_supported, unsupported_reason')
      .eq('supplier_id', supplierId)
      .eq('material_id', material.id)
      .eq('shape_kind', shapeKind)
      .eq('thickness_cm', thicknessCm);

  let { data: rate, error: rateError } = await baseRateQuery().eq('surface_type', surfaceType).maybeSingle();

  if (!rate && surfaceType === 'saw_cut') {
    const fallback = await baseRateQuery().eq('surface_type', 'sanded').maybeSingle();
    rate = fallback.data;
    rateError = fallback.error;
  }

  if (rateError || !rate) {
    return { error: `No Sanne Vos Bluestone rate found for ${shapeKind} ${thicknessCm} cm.` };
  }

  let pricing: SanneVosBluestonePricingResult;
  try {
    pricing = calculateSanneVosBluestonePricing({
      rfq: rfqForPricing,
      rate: rate as SanneVosBluestoneRate,
      finish: finishOption,
      finishCode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Automatic pricing could not be calculated.';
    console.error('Sanne Vos automatic pricing failed.', { rfqId, supplierId, message });
    return { error: message };
  }

  const nowIso = new Date().toISOString();
  const quotePayload = {
    base_price: pricing.basePriceBeforeLoss,
    area_m2: pricing.totalAreaM2,
    volume_m3: 0,
    shipping_cost_calculated: 0,
    transport_cost_calculated: 0,
    product_price_after_margin: pricing.productPriceAfterMargin,
    cost_including_transport: pricing.lossAdjustedBasePrice,
    transport_adjusted_base_price: null,
    truck_multiplier_factor: null,
    final_price_calculated: pricing.finalPriceCalculated,
    pricing_method: 'none',
    pricing_formula_version: SANNE_VOS_BLUESTONE_FORMULA_VERSION,
    retail_multiplier_factor: SANNE_VOS_RETAIL_MULTIPLIER,
    pricing_settings_snapshot: pricing.pricingSettingsSnapshot,
    currency: 'EUR',
    supplier_input_price: null,
    supplier_input_currency: 'EUR',
    supplier_input_exchange_rate_per_eur: null,
    supplier_input_exchange_rate_idr_per_eur: null,
    supplier_input_converted_at: null,
  };

  let quote: RfqQuote;
  let isUpdate = false;

  if (existingQuote) {
    const { data: updatedQuote, error: updateQuoteError } = await supabase
      .from('rfq_quotes')
      .update({
        ...quotePayload,
        lead_time_days: params.leadTimeDays === undefined ? existingQuote.lead_time_days : params.leadTimeDays,
        comment: params.comment === undefined ? existingQuote.comment : params.comment,
        submitted_at: nowIso,
      })
      .eq('id', existingQuote.id)
      .select()
      .single();

    if (updateQuoteError || !updatedQuote) {
      return { error: `Failed to update quote: ${updateQuoteError?.message ?? 'Unknown error'}` };
    }

    quote = updatedQuote as RfqQuote;
    isUpdate = true;
  } else {
    const { data: insertedQuote, error: quoteError } = await supabase
      .from('rfq_quotes')
      .insert({
        rfq_id: rfqId,
        supplier_id: supplierId,
        ...quotePayload,
        lead_time_days: params.leadTimeDays ?? null,
        comment: params.comment ?? null,
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

  if (params.inviteId) {
    const { error: markInviteUsedError } = await supabase
      .from('rfq_invites')
      .update({ used_at: nowIso })
      .eq('id', params.inviteId);

    if (markInviteUsedError) {
      console.warn('Failed to mark invite as used after automatic quote.', {
        rfqId,
        inviteId: params.inviteId,
        quoteId: quote.id,
        error: markInviteUsedError.message,
      });
    }
  }

  let rfqStatus = rfqForPricing.status;
  if (rfqStatus === 'sent_to_supplier' || rfqStatus === 'supplier_replied') {
    const { error: rfqStatusError } = await supabase
      .from('rfqs')
      .update({ status: 'quotes_received' })
      .eq('id', rfqId)
      .in('status', ['sent_to_supplier', 'supplier_replied']);

    if (rfqStatusError) {
      console.warn('Failed to update RFQ status to quotes_received after automatic quote.', {
        rfqId,
        quoteId: quote.id,
        error: rfqStatusError.message,
      });
    } else {
      rfqStatus = 'quotes_received';
    }
  }

  await logAuditEvent({
    actorType: params.actor.type,
    actorId: params.actor.id,
    action: isUpdate ? 'QUOTE_UPDATED' : 'QUOTE_SUBMITTED',
    entityType: 'rfq_quote',
    entityId: quote.id,
    metadata: {
      rfqId,
      supplierId,
      automaticPricing: true,
      pricingFormulaVersion: SANNE_VOS_BLUESTONE_FORMULA_VERSION,
      areaM2: pricing.totalAreaM2,
      basePriceEur: pricing.basePriceBeforeLoss,
      lossAdjustedBasePrice: pricing.lossAdjustedBasePrice,
      productPriceAfterMargin: pricing.productPriceAfterMargin,
      finalPriceCalculated: pricing.finalPriceCalculated,
      finishCode: pricing.pricingSettingsSnapshot.finishCode,
      finishMargin: pricing.finishMargin,
      finishPercentageMultiplier: pricing.finishPercentageMultiplier,
      retailMultiplierFactor: SANNE_VOS_RETAIL_MULTIPLIER,
    },
    ip: params.requestContext?.ip ?? null,
    userAgent: params.requestContext?.userAgent ?? null,
  });

  return {
    data: { quote, pricing, isUpdate, rfqStatus, createdBy: rfqForPricing.created_by },
  };
}

export interface SanneVosInviteAutoQuoteResult {
  inviteId: string;
  supplierId: string;
  supplierName: string;
  success: boolean;
  isUpdate?: boolean;
  finalPrice?: number;
  error?: string;
}

/**
 * Prices one invite for an internal caller and, when that fails, leaves a trace
 * that sales can see: an audit event plus an internal note in the supplier thread.
 */
export async function runSanneVosAutomaticQuoteForInvite(params: {
  rfqId: string;
  invite: { id: string; supplier_id: string };
  supplierName: string;
  actor: SanneVosActor;
  supabase?: ServiceClient;
}): Promise<SanneVosInviteAutoQuoteResult> {
  const supabase = params.supabase ?? createServiceRoleClient();
  const result = await generateSanneVosAutomaticQuote({
    supabase,
    rfqId: params.rfqId,
    inviteId: params.invite.id,
    supplierId: params.invite.supplier_id,
    supplierName: params.supplierName,
    actor: params.actor,
  });

  if ('data' in result) {
    return {
      inviteId: params.invite.id,
      supplierId: params.invite.supplier_id,
      supplierName: params.supplierName,
      success: true,
      isUpdate: result.data.isUpdate,
      finalPrice: result.data.pricing.finalPriceCalculated,
    };
  }

  await logAuditEvent({
    actorType: params.actor.type,
    actorId: params.actor.id,
    action: 'AUTOMATIC_QUOTE_FAILED',
    entityType: 'rfq_invite',
    entityId: params.invite.id,
    metadata: { rfqId: params.rfqId, supplierId: params.invite.supplier_id, error: result.error },
  });

  const { error: noteError } = await supabase.from('rfq_comments').insert({
    rfq_id: params.rfqId,
    supplier_id: params.invite.supplier_id,
    author_type: 'internal',
    author_id: params.actor.id,
    author_email: null,
    body: `Automatic price could not be calculated: ${result.error}`,
  });

  if (noteError) {
    console.warn('Failed to record automatic pricing failure as internal note.', {
      rfqId: params.rfqId,
      inviteId: params.invite.id,
      error: noteError.message,
    });
  }

  return {
    inviteId: params.invite.id,
    supplierId: params.invite.supplier_id,
    supplierName: params.supplierName,
    success: false,
    error: result.error,
  };
}

/**
 * Prices every Sanne Vos + Bluestone invite of an RFQ.
 *
 * - mode "create": price all candidate invites (used right after RFQ creation).
 * - mode "refresh": only re-price invites that already have an automatic quote,
 *   so an edited request never silently gains a quote (used after edits).
 */
export async function autoQuoteSanneVosInvites(params: {
  rfqId: string;
  actor: SanneVosActor;
  mode: 'create' | 'refresh';
  supabase?: ServiceClient;
}): Promise<{ inviteCount: number; results: SanneVosInviteAutoQuoteResult[] }> {
  const supabase = params.supabase ?? createServiceRoleClient();

  const { data: rfq, error: rfqError } = await supabase
    .from('rfqs')
    .select('id, material, status')
    .eq('id', params.rfqId)
    .single();

  if (rfqError || !rfq || rfq.status === 'closed') {
    return { inviteCount: 0, results: [] };
  }

  const { data: invites, error: invitesError } = await supabase
    .from('rfq_invites')
    .select('id, supplier_id, supplier:suppliers(id, name)')
    .eq('rfq_id', params.rfqId);

  if (invitesError || !invites) {
    return { inviteCount: 0, results: [] };
  }

  const candidates = invites
    .map((invite) => {
      const supplier = Array.isArray(invite.supplier) ? invite.supplier[0] : invite.supplier;
      return { invite, supplierName: supplier?.name ?? null };
    })
    .filter(
      (entry): entry is { invite: (typeof invites)[number]; supplierName: string } =>
        !!entry.supplierName && isSanneVosBluestoneAutoPricingCandidate(entry.supplierName, { material: rfq.material })
    );

  if (candidates.length === 0) {
    return { inviteCount: invites.length, results: [] };
  }

  let toPrice = candidates;
  if (params.mode === 'refresh') {
    const { data: existingQuotes } = await supabase
      .from('rfq_quotes')
      .select('supplier_id')
      .eq('rfq_id', params.rfqId)
      .eq('pricing_formula_version', SANNE_VOS_BLUESTONE_FORMULA_VERSION)
      .in('supplier_id', candidates.map((entry) => entry.invite.supplier_id));

    const quotedSupplierIds = new Set((existingQuotes ?? []).map((quote) => quote.supplier_id));
    toPrice = candidates.filter((entry) => quotedSupplierIds.has(entry.invite.supplier_id));
  }

  const results: SanneVosInviteAutoQuoteResult[] = [];
  for (const entry of toPrice) {
    results.push(
      await runSanneVosAutomaticQuoteForInvite({
        supabase,
        rfqId: params.rfqId,
        invite: { id: entry.invite.id, supplier_id: entry.invite.supplier_id },
        supplierName: entry.supplierName,
        actor: params.actor,
      })
    );
  }

  return { inviteCount: invites.length, results };
}
