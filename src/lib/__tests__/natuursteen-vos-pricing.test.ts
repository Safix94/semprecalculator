import { describe, expect, it } from 'vitest';
import {
  NATUURSTEEN_VOS_FORMULA_VERSION,
  calculateNatuursteenVosPricing,
  isNatuursteenVosSupplierName,
  isVolumelessQuoteFormula,
} from '@/lib/natuursteen-vos-pricing';

describe('supplier detection', () => {
  it('detects Natuursteen Vos case- and whitespace-insensitively', () => {
    expect(isNatuursteenVosSupplierName('Natuursteen Vos')).toBe(true);
    expect(isNatuursteenVosSupplierName('  natuursteen   VOS ')).toBe(true);
  });

  it('does not match Sanne Vos, other suppliers or empty names', () => {
    expect(isNatuursteenVosSupplierName('Sanne Vos')).toBe(false);
    expect(isNatuursteenVosSupplierName('Vos')).toBe(false);
    expect(isNatuursteenVosSupplierName(null)).toBe(false);
    expect(isNatuursteenVosSupplierName(undefined)).toBe(false);
  });

  it('knows which formula versions store no supplier volume', () => {
    expect(isVolumelessQuoteFormula('sanne_vos_bluestone_v1')).toBe(true);
    expect(isVolumelessQuoteFormula(NATUURSTEEN_VOS_FORMULA_VERSION)).toBe(true);
    expect(isVolumelessQuoteFormula('supplier_transport_v1')).toBe(false);
    expect(isVolumelessQuoteFormula(null)).toBe(false);
  });
});

describe('calculateNatuursteenVosPricing', () => {
  // Sheet "B - vos CHD", row 3: Anabel top bluestone ferrara, L = 1326.39, code FE.
  it('prices a Ferrara top with margin 2.1 (sheet row 3)', () => {
    const result = calculateNatuursteenVosPricing({
      purchasePriceEur: 1326.39,
      finishCode: 'FE',
      finishName: 'Ferrara',
    });

    expect(result.basePrice).toBe(1326.39);
    expect(result.lossAdjustedBasePrice).toBe(1392.71);
    expect(result.finishMargin).toBe(2.1);
    expect(result.productPriceAfterMargin).toBe(2924.69);
    expect(result.finalPriceCalculated).toBe(8627.84);
  });

  // Sheet row 6: Anabel top bluestone antique, L = 1739.38, code A.
  it('prices an Antique top with margin 1.9 (sheet row 6)', () => {
    const result = calculateNatuursteenVosPricing({
      purchasePriceEur: 1739.38,
      finishCode: 'A',
      finishName: 'Antique',
    });

    expect(result.lossAdjustedBasePrice).toBe(1826.35);
    expect(result.finishMargin).toBe(1.9);
    // 1826.35 × 1.9 = 3470.0649… in floating point, so it rounds down; the sheet's
    // unrounded total is 10236.686, which the step-wise chain lands on as well.
    expect(result.productPriceAfterMargin).toBe(3470.06);
    expect(result.finalPriceCalculated).toBe(10236.68);
  });

  // Sheet row 13: console bluestone without a finish code, L = 201.50.
  it('prices a Regular (no code) item with margin 1.9 (sheet row 13)', () => {
    const result = calculateNatuursteenVosPricing({
      purchasePriceEur: 201.5,
      finishCode: null,
      finishName: 'Regular',
    });

    expect(result.lossAdjustedBasePrice).toBe(211.58);
    expect(result.finishMargin).toBe(1.9);
    expect(result.productPriceAfterMargin).toBe(402);
    expect(result.finalPriceCalculated).toBe(1185.9);
  });

  it('falls back to margin 1.9 and flags it when the finish could not be resolved', () => {
    const result = calculateNatuursteenVosPricing({
      purchasePriceEur: 100,
      finishCode: null,
      finishName: null,
      finishResolutionError: 'Finish "Unknown" is not configured in the finish master list.',
    });

    expect(result.finishMargin).toBe(1.9);
    expect(result.finalPriceCalculated).toBe(588.53);
    expect(result.pricingSettingsSnapshot).toMatchObject({
      formulaVersion: 'natuursteen_vos_v1',
      supplierSpecialPricing: true,
      finishMarginFallback: true,
      finishResolutionError: 'Finish "Unknown" is not configured in the finish master list.',
      lossRecoveryMultiplier: 1.05,
      retailMultiplier: 2.95,
    });
  });

  it('records the inputs and factors in the pricing snapshot', () => {
    const result = calculateNatuursteenVosPricing({
      purchasePriceEur: 1326.39,
      finishCode: 'FE',
      finishName: 'Ferrara',
    });

    expect(result.pricingSettingsSnapshot).toMatchObject({
      formulaVersion: NATUURSTEEN_VOS_FORMULA_VERSION,
      supplierName: 'Natuursteen Vos',
      purchasePriceEur: 1326.39,
      finishName: 'Ferrara',
      finishCode: 'FE',
      finishMargin: 2.1,
      finishMarginFallback: false,
      finishResolutionError: null,
      formula: 'purchasePriceEur * lossRecoveryMultiplier * finishMargin * retailMultiplier',
    });
  });

  it('rejects a non-positive or invalid purchase price', () => {
    expect(() => calculateNatuursteenVosPricing({ purchasePriceEur: 0, finishCode: null, finishName: null })).toThrow();
    expect(() => calculateNatuursteenVosPricing({ purchasePriceEur: -5, finishCode: 'A', finishName: 'Antique' })).toThrow();
    expect(() => calculateNatuursteenVosPricing({ purchasePriceEur: Number.NaN, finishCode: 'A', finishName: 'Antique' })).toThrow();
  });
});
