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
    expect(result.finalPriceCalculated).toBe(8629);
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
    expect(result.finalPriceCalculated).toBe(10238);
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
    expect(result.finalPriceCalculated).toBe(1187);
  });

  it('falls back to margin 1.9 and flags it when the finish could not be resolved', () => {
    const result = calculateNatuursteenVosPricing({
      purchasePriceEur: 100,
      finishCode: null,
      finishName: null,
      finishResolutionError: 'Finish "Unknown" is not configured in the finish master list.',
    });

    expect(result.finishMargin).toBe(1.9);
    expect(result.finalPriceCalculated).toBe(590);
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
      stainStop: false,
      stainStopSurchargeEur: 0,
      formula: '(purchasePriceEur * lossRecoveryMultiplier * finishMargin + stainStopSurchargeEur) * retailMultiplier',
    });
  });

  it('rejects a non-positive or invalid purchase price', () => {
    expect(() => calculateNatuursteenVosPricing({ purchasePriceEur: 0, finishCode: null, finishName: null })).toThrow();
    expect(() => calculateNatuursteenVosPricing({ purchasePriceEur: -5, finishCode: 'A', finishName: 'Antique' })).toThrow();
    expect(() => calculateNatuursteenVosPricing({ purchasePriceEur: Number.NaN, finishCode: 'A', finishName: 'Antique' })).toThrow();
  });
});

describe('stain stop surcharge', () => {
  // Sheet row 13 again (Regular, margin 1.9): 201.50 × 1.05 × 1.9 = 402.00.
  it('adds € 60 per piece after the finish margin and before the retail multiplier', () => {
    const result = calculateNatuursteenVosPricing({
      purchasePriceEur: 201.5,
      finishCode: null,
      finishName: 'Regular',
      stainStop: true,
      quantity: 1,
    });

    expect(result.productPriceAfterMargin).toBe(402);
    expect(result.stainStopSurcharge).toBe(60);
    // (402 + 60) × 2.95 = 1362.90 → 1363 + 1
    expect(result.finalPriceCalculated).toBe(1364);
    expect(result.pricingSettingsSnapshot).toMatchObject({
      stainStop: true,
      stainStopUnitEur: 60,
      stainStopSurchargeEur: 60,
      quantity: 1,
      formula: '(purchasePriceEur * lossRecoveryMultiplier * finishMargin + stainStopSurchargeEur) * retailMultiplier',
    });
  });

  it('multiplies the surcharge by the requested quantity', () => {
    const result = calculateNatuursteenVosPricing({
      purchasePriceEur: 201.5,
      finishCode: null,
      finishName: 'Regular',
      stainStop: true,
      quantity: 3,
    });

    expect(result.stainStopSurcharge).toBe(180);
    // (402 + 180) × 2.95 = 1716.90 → 1717 + 1
    expect(result.finalPriceCalculated).toBe(1718);
  });

  it('charges nothing when stain stop is off or not given', () => {
    const off = calculateNatuursteenVosPricing({ purchasePriceEur: 201.5, finishCode: null, finishName: 'Regular', stainStop: false, quantity: 4 });
    const missing = calculateNatuursteenVosPricing({ purchasePriceEur: 201.5, finishCode: null, finishName: 'Regular' });

    expect(off.stainStopSurcharge).toBe(0);
    expect(off.finalPriceCalculated).toBe(1187);
    expect(missing.stainStopSurcharge).toBe(0);
    expect(missing.finalPriceCalculated).toBe(1187);
    expect(missing.pricingSettingsSnapshot).toMatchObject({ stainStop: false, stainStopSurchargeEur: 0 });
  });
});
