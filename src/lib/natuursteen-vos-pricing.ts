import {
  SANNE_VOS_BLUESTONE_FORMULA_VERSION,
  SANNE_VOS_LOSS_RECOVERY_MULTIPLIER,
  SANNE_VOS_RETAIL_MULTIPLIER,
  STAIN_STOP_SURCHARGE_EUR,
  resolveFinishMargin,
} from '@/lib/sanne-vos-pricing';
import { RETAIL_PRICE_ROUNDING, roundRetailPrice } from '@/lib/pricing';
import { SANNE_JUK_FORMULA_VERSION, isSanneJukSupplierName } from '@/lib/sanne-juk-pricing';

/**
 * Natuursteen Vos is an external supplier that quotes a purchase price itself.
 * That price is then pushed through the same chain as the Sanne Vos sheet
 * ("B - vos CHD", from column L onwards): × 1.05 loss recovery, × finish margin
 * (1.9, or 2.1 for FE/T/V finish codes), + stain stop surcharge when requested,
 * × 2.95 retail multiplier. The finish percentage surcharge does not apply: it is
 * already part of the supplier's price.
 */
export const NATUURSTEEN_VOS_SUPPLIER_NAME = 'Natuursteen Vos';
export const NATUURSTEEN_VOS_FORMULA_VERSION = 'natuursteen_vos_v1';
export const NATUURSTEEN_VOS_DEFAULT_FINISH_MARGIN = 1.9;

const VOLUMELESS_FORMULA_VERSIONS = new Set<string>([
  SANNE_VOS_BLUESTONE_FORMULA_VERSION,
  NATUURSTEEN_VOS_FORMULA_VERSION,
  SANNE_JUK_FORMULA_VERSION,
]);

export interface NatuursteenVosPricingInput {
  /** Purchase price entered by the supplier, already converted to EUR. */
  purchasePriceEur: number;
  /** Finish code from the master list; null for Regular or when unresolved. */
  finishCode: string | null;
  finishName: string | null;
  /** Set when the RFQ finish could not be matched; pricing then uses the default margin. */
  finishResolutionError?: string | null;
  /** Table tops: stain stop requested; adds STAIN_STOP_SURCHARGE_EUR per piece. */
  stainStop?: boolean | null;
  /** Number of pieces in the request; defaults to 1. */
  quantity?: number | null;
}

export interface NatuursteenVosPricingResult {
  basePrice: number;
  lossAdjustedBasePrice: number;
  productPriceAfterMargin: number;
  /** Total stain stop surcharge (per piece × quantity); 0 when not requested. */
  stainStopSurcharge: number;
  finalPriceCalculated: number;
  finishMargin: number;
  finishMarginFallback: boolean;
  pricingSettingsSnapshot: Record<string, unknown>;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isNatuursteenVosSupplierName(name: string | null | undefined): boolean {
  return normalizeText(name) === normalizeText(NATUURSTEEN_VOS_SUPPLIER_NAME);
}

/** Suppliers that enter a purchase price only, without dimensions. */
export function isPriceOnlySupplierName(name: string | null | undefined): boolean {
  return isNatuursteenVosSupplierName(name) || isSanneJukSupplierName(name);
}

/** Quotes priced through a Vos chain or the Sanne Juk formula carry no supplier volume (volume_m3 is stored as 0). */
export function isVolumelessQuoteFormula(formulaVersion: string | null | undefined): boolean {
  return formulaVersion ? VOLUMELESS_FORMULA_VERSIONS.has(formulaVersion) : false;
}

export function calculateNatuursteenVosPricing(input: NatuursteenVosPricingInput): NatuursteenVosPricingResult {
  const basePrice = input.purchasePriceEur;
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    throw new Error('Purchase price must be a positive number.');
  }

  const finishResolutionError = input.finishResolutionError ?? null;
  const finishMarginFallback = finishResolutionError !== null;
  const finishCode = input.finishCode ? input.finishCode.trim().toUpperCase() : null;
  const finishMargin = finishMarginFallback ? NATUURSTEEN_VOS_DEFAULT_FINISH_MARGIN : resolveFinishMargin(finishCode);

  // Same step-wise rounding as the Sanne Vos chain so both Vos flows agree to the cent.
  const lossAdjustedBasePrice = roundTo(basePrice * SANNE_VOS_LOSS_RECOVERY_MULTIPLIER, 2);
  const productPriceAfterMargin = roundTo(lossAdjustedBasePrice * finishMargin, 2);
  const quantity = typeof input.quantity === 'number' && Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 1;
  const stainStop = input.stainStop === true;
  const stainStopSurcharge = stainStop ? roundTo(STAIN_STOP_SURCHARGE_EUR * quantity, 2) : 0;
  const basisPrice = roundTo(productPriceAfterMargin + stainStopSurcharge, 2);
  const unroundedFinalPrice = roundTo(basisPrice * SANNE_VOS_RETAIL_MULTIPLIER, 2);
  const finalPriceCalculated = roundRetailPrice(unroundedFinalPrice);

  return {
    basePrice,
    lossAdjustedBasePrice,
    productPriceAfterMargin,
    stainStopSurcharge,
    finalPriceCalculated,
    finishMargin,
    finishMarginFallback,
    pricingSettingsSnapshot: {
      formulaVersion: NATUURSTEEN_VOS_FORMULA_VERSION,
      supplierSpecialPricing: true,
      supplierName: NATUURSTEEN_VOS_SUPPLIER_NAME,
      purchasePriceEur: basePrice,
      finishName: input.finishName,
      finishCode,
      finishMargin,
      finishMarginFallback,
      finishResolutionError,
      lossRecoveryMultiplier: SANNE_VOS_LOSS_RECOVERY_MULTIPLIER,
      quantity,
      stainStop,
      stainStopUnitEur: STAIN_STOP_SURCHARGE_EUR,
      stainStopSurchargeEur: stainStopSurcharge,
      retailMultiplier: SANNE_VOS_RETAIL_MULTIPLIER,
      unroundedFinalPrice,
      rounding: RETAIL_PRICE_ROUNDING,
      formula: '(purchasePriceEur * lossRecoveryMultiplier * finishMargin + stainStopSurchargeEur) * retailMultiplier',
    },
  };
}
