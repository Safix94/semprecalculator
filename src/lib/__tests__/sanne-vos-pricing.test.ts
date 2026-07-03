import { describe, expect, it } from 'vitest';
import {
  calculateSanneVosAreaM2,
  calculateSanneVosBluestonePricing,
  isSanneVosBluestoneAutoPricingCandidate,
  percentageToMultiplier,
  resolveFinishMargin,
  resolveSanneVosShapeKind,
  resolveSanneVosSurfaceType,
  type SanneVosBluestoneRate,
} from '@/lib/sanne-vos-pricing';

const supportedRate: SanneVosBluestoneRate = {
  shape_kind: 'straight',
  thickness_cm: 3,
  surface_type: 'sanded',
  base_price_per_m2_eur: 120,
  discount_percentage: 0,
  net_price_per_m2_eur: 100,
  is_supported: true,
  unsupported_reason: null,
};

describe('candidate and resolver helpers', () => {
  it('detects the Sanne Vos + Bluestone combination case-insensitively', () => {
    expect(isSanneVosBluestoneAutoPricingCandidate('sanne vos', { material: 'BLUESTONE' })).toBe(true);
    expect(isSanneVosBluestoneAutoPricingCandidate('Sanne Vos', { material: 'Marble' })).toBe(false);
    expect(isSanneVosBluestoneAutoPricingCandidate('Other', { material: 'Bluestone' })).toBe(false);
  });

  it('resolves shape kind and surface type', () => {
    expect(resolveSanneVosShapeKind('Round')).toBe('round');
    expect(resolveSanneVosShapeKind('Rectangular')).toBe('straight');
    expect(resolveSanneVosSurfaceType('SC')).toBe('saw_cut');
    expect(resolveSanneVosSurfaceType('H')).toBe('sanded');
  });

  it('maps finish percentages and margins', () => {
    expect(percentageToMultiplier(10)).toBe(1.1);
    expect(percentageToMultiplier(0)).toBe(1);
    expect(() => percentageToMultiplier(null)).toThrow();
    expect(resolveFinishMargin('T')).toBe(2.1);
    expect(resolveFinishMargin('A')).toBe(1.7);
    expect(resolveFinishMargin('H')).toBe(1.9);
    expect(() => resolveFinishMargin('')).toThrow();
  });
});

describe('calculateSanneVosAreaM2', () => {
  it('computes rectangular area from cm dimensions', () => {
    expect(calculateSanneVosAreaM2({ shape: 'Rectangular', length: 100, width: 50 })).toBe(0.5);
  });

  it('computes round area from the diameter', () => {
    expect(calculateSanneVosAreaM2({ shape: 'Round', length: 100, width: null })).toBe(0.785);
  });
});

describe('calculateSanneVosBluestonePricing', () => {
  it('matches the golden calculation for a straight sanded piece', () => {
    const result = calculateSanneVosBluestonePricing({
      rfq: {
        material: 'Bluestone',
        finish: 'Honed',
        length: 100,
        width: 50,
        thickness: 3,
        quantity: 2,
        shape: 'Rectangular',
      },
      rate: supportedRate,
      finish: { name: 'Honed', abbreviation: 'A', formula_percentage: 10 },
    });

    expect(result.areaM2PerPiece).toBe(0.5);
    expect(result.totalAreaM2).toBe(1);
    expect(result.basePriceBeforeLoss).toBe(110);
    expect(result.lossAdjustedBasePrice).toBe(115.5);
    expect(result.productPriceAfterMargin).toBe(196.35);
    expect(result.finalPriceCalculated).toBe(579.23);
  });

  it('rejects unsupported rates and non-Bluestone materials', () => {
    expect(() =>
      calculateSanneVosBluestonePricing({
        rfq: { material: 'Marble', finish: 'Honed', length: 100, width: 50, thickness: 3, quantity: 1, shape: 'Rectangular' },
        rate: supportedRate,
        finish: { name: 'Honed', abbreviation: 'A', formula_percentage: 10 },
      })
    ).toThrow();
    expect(() =>
      calculateSanneVosBluestonePricing({
        rfq: { material: 'Bluestone', finish: 'Honed', length: 100, width: 50, thickness: 3, quantity: 1, shape: 'Rectangular' },
        rate: { ...supportedRate, is_supported: false, unsupported_reason: 'Not supported' },
        finish: { name: 'Honed', abbreviation: 'A', formula_percentage: 10 },
      })
    ).toThrow('Not supported');
  });
});
