import { describe, expect, it } from 'vitest';
import {
  SANNE_JUK_FORMULA_VERSION,
  calculateSanneJukPricing,
  isSanneJukSupplierName,
} from '@/lib/sanne-juk-pricing';
import { roundRetailPrice } from '@/lib/pricing';
import { isPriceOnlySupplierName, isVolumelessQuoteFormula } from '@/lib/natuursteen-vos-pricing';

describe('Sanne Juk supplier detection', () => {
  it('matches the supplier name case- and whitespace-insensitively', () => {
    expect(isSanneJukSupplierName('Sanne Juk')).toBe(true);
    expect(isSanneJukSupplierName('  sanne   JUK ')).toBe(true);
    expect(isSanneJukSupplierName('Sanne Vos')).toBe(false);
    expect(isSanneJukSupplierName(null)).toBe(false);
  });

  it('is a price-only supplier with a volumeless formula', () => {
    expect(isPriceOnlySupplierName('Sanne Juk')).toBe(true);
    expect(isPriceOnlySupplierName('Natuursteen Vos')).toBe(true);
    expect(isPriceOnlySupplierName('Sanne Vos')).toBe(false);
    expect(isVolumelessQuoteFormula(SANNE_JUK_FORMULA_VERSION)).toBe(true);
  });
});

describe('roundRetailPrice', () => {
  it('rounds to whole euros and adds 1', () => {
    expect(roundRetailPrice(100.48)).toBe(101);
    expect(roundRetailPrice(100.5)).toBe(102);
    expect(roundRetailPrice(100.51)).toBe(102);
    expect(roundRetailPrice(100)).toBe(101);
  });
});

describe('calculateSanneJukPricing', () => {
  it('multiplies by 2.1 and 2.4, then rounds to whole euros + 1', () => {
    const result = calculateSanneJukPricing({ purchasePriceEur: 100 });
    expect(result.productPriceAfterMargin).toBe(210);
    expect(result.unroundedFinalPrice).toBe(504);
    expect(result.finalPriceCalculated).toBe(505);
    expect(result.pricingSettingsSnapshot.formulaVersion).toBe(SANNE_JUK_FORMULA_VERSION);
  });

  it('rounds a fraction below ,50 down before adding 1', () => {
    // 37.13 × 2.1 = 77.97 → × 2.4 = 187.13 → 187 + 1
    expect(calculateSanneJukPricing({ purchasePriceEur: 37.13 }).finalPriceCalculated).toBe(188);
  });

  it('rounds a fraction from ,50 up before adding 1', () => {
    // 37.3 × 2.1 = 78.33 → × 2.4 = 187.99 → 188 + 1
    expect(calculateSanneJukPricing({ purchasePriceEur: 37.3 }).finalPriceCalculated).toBe(189);
  });

  it('rejects a non-positive purchase price', () => {
    expect(() => calculateSanneJukPricing({ purchasePriceEur: 0 })).toThrow();
    expect(() => calculateSanneJukPricing({ purchasePriceEur: Number.NaN })).toThrow();
  });
});
