/**
 * Sanne Juk quotes a purchase price only (no dimensions, no transport).
 * That price is multiplied by the product margin (2.1) and the retail
 * multiplier (2.4); the result is rounded to whole euros (below ,50 down,
 * from ,50 up) and € 1 is added.
 */
import { RETAIL_PRICE_ROUNDING, roundRetailPrice } from '@/lib/pricing';

export const SANNE_JUK_SUPPLIER_NAME = 'Sanne Juk';
export const SANNE_JUK_FORMULA_VERSION = 'sanne_juk_v1';
export const SANNE_JUK_PRODUCT_MARGIN = 2.1;
export const SANNE_JUK_RETAIL_MULTIPLIER = 2.4;

export interface SanneJukPricingInput {
  /** Purchase price entered by the supplier, already converted to EUR. */
  purchasePriceEur: number;
}

export interface SanneJukPricingResult {
  basePrice: number;
  productPriceAfterMargin: number;
  unroundedFinalPrice: number;
  finalPriceCalculated: number;
  pricingSettingsSnapshot: Record<string, unknown>;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isSanneJukSupplierName(name: string | null | undefined): boolean {
  return normalizeText(name) === normalizeText(SANNE_JUK_SUPPLIER_NAME);
}

export function calculateSanneJukPricing(input: SanneJukPricingInput): SanneJukPricingResult {
  const basePrice = input.purchasePriceEur;
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    throw new Error('Purchase price must be a positive number.');
  }

  const productPriceAfterMargin = roundTo(basePrice * SANNE_JUK_PRODUCT_MARGIN, 2);
  const unroundedFinalPrice = roundTo(productPriceAfterMargin * SANNE_JUK_RETAIL_MULTIPLIER, 2);
  const finalPriceCalculated = roundRetailPrice(unroundedFinalPrice);

  return {
    basePrice,
    productPriceAfterMargin,
    unroundedFinalPrice,
    finalPriceCalculated,
    pricingSettingsSnapshot: {
      formulaVersion: SANNE_JUK_FORMULA_VERSION,
      supplierSpecialPricing: true,
      supplierName: SANNE_JUK_SUPPLIER_NAME,
      purchasePriceEur: basePrice,
      productMarginFactor: SANNE_JUK_PRODUCT_MARGIN,
      retailMultiplier: SANNE_JUK_RETAIL_MULTIPLIER,
      unroundedFinalPrice,
      rounding: RETAIL_PRICE_ROUNDING,
      formula: 'round(purchasePriceEur * productMarginFactor * retailMultiplier) + 1',
    },
  };
}
