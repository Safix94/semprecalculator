import { describe, expect, it } from 'vitest';
import {
  calculateSanneVosAreaM2,
  calculateSanneVosBluestonePricing,
  composeSanneVosFinishCodes,
  isSanneVosBluestoneAutoPricingCandidate,
  isSanneVosNeutralFinishPart,
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
    expect(resolveSanneVosShapeKind('Oval')).toBe('round');
    expect(resolveSanneVosShapeKind('Rectangular')).toBe('straight');
    expect(resolveSanneVosShapeKind(null)).toBe('straight');
    expect(resolveSanneVosSurfaceType('SC')).toBe('saw_cut');
    expect(resolveSanneVosSurfaceType('H')).toBe('sanded');
  });

  it('maps finish percentages', () => {
    expect(percentageToMultiplier(10)).toBe(1.1);
    expect(percentageToMultiplier(0)).toBe(1);
    expect(() => percentageToMultiplier(null)).toThrow();
  });

  it('uses margin 1.9 by default, also for Regular and the former 1.7 group', () => {
    expect(resolveFinishMargin('')).toBe(1.9);
    expect(resolveFinishMargin(null)).toBe(1.9);
    expect(resolveFinishMargin('A')).toBe(1.9);
    expect(resolveFinishMargin('B')).toBe(1.9);
    expect(resolveFinishMargin('L')).toBe(1.9);
    expect(resolveFinishMargin('SC')).toBe(1.9);
    expect(resolveFinishMargin('F')).toBe(1.9);
    expect(resolveFinishMargin('AFR')).toBe(1.9);
    expect(resolveFinishMargin('PEF')).toBe(1.9);
  });

  it('uses margin 2.1 whenever the finish code contains FE, T or V', () => {
    expect(resolveFinishMargin('FE')).toBe(2.1);
    expect(resolveFinishMargin('T')).toBe(2.1);
    expect(resolveFinishMargin('V')).toBe(2.1);
    expect(resolveFinishMargin('FEFK')).toBe(2.1);
    expect(resolveFinishMargin('AT')).toBe(2.1);
    expect(resolveFinishMargin('VL')).toBe(2.1);
    expect(resolveFinishMargin('TPE')).toBe(2.1);
    expect(resolveFinishMargin('fe')).toBe(2.1);
  });
});

describe('composeSanneVosFinishCodes', () => {
  it('treats Regular, N.v.t. and empty parts as neutral', () => {
    expect(isSanneVosNeutralFinishPart('Regular')).toBe(true);
    expect(isSanneVosNeutralFinishPart(' regular ')).toBe(true);
    expect(isSanneVosNeutralFinishPart('N.v.t.')).toBe(true);
    expect(isSanneVosNeutralFinishPart('')).toBe(true);
    expect(isSanneVosNeutralFinishPart(null)).toBe(true);
    expect(isSanneVosNeutralFinishPart('Leathered')).toBe(false);
  });

  it('returns the canonical top + color + edge code first', () => {
    expect(composeSanneVosFinishCodes(['A', 'F', 'R'])[0]).toBe('AFR');
    expect(composeSanneVosFinishCodes(['FE', 'F', 'K'])[0]).toBe('FEFK');
  });

  it('drops empty codes and returns a single code as-is', () => {
    expect(composeSanneVosFinishCodes([null, 'L', ''])).toEqual(['L']);
    expect(composeSanneVosFinishCodes([null, null, null])).toEqual([]);
  });

  it('offers unit permutations as fallback candidates', () => {
    const candidates = composeSanneVosFinishCodes(['F', 'PE']);
    expect(candidates[0]).toBe('FPE');
    expect(candidates).toContain('PEF');
    expect(new Set(candidates).size).toBe(candidates.length);
  });
});

describe('calculateSanneVosAreaM2', () => {
  it('computes rectangular area from cm dimensions', () => {
    expect(calculateSanneVosAreaM2({ shape: 'Rectangular', length: 100, width: 50 })).toBe(0.5);
  });

  it('prices a round top on its bounding square, like the Sanne Vos sheet', () => {
    expect(calculateSanneVosAreaM2({ shape: 'Round', length: 100, width: null })).toBe(1);
    expect(calculateSanneVosAreaM2({ shape: 'Round', length: 40, width: 40 })).toBe(0.16);
  });

  it('prices an oval top on its bounding rectangle', () => {
    expect(calculateSanneVosAreaM2({ shape: 'Oval', length: 100, width: 50 })).toBe(0.5);
    expect(calculateSanneVosAreaM2({ shape: 'Oval', length: 100, width: null })).toBe(1);
  });

  it('requires a width for rectangular pieces', () => {
    expect(() => calculateSanneVosAreaM2({ shape: 'Rectangular', length: 100, width: null })).toThrow();
  });
});

describe('calculateSanneVosBluestonePricing', () => {
  it('matches the golden calculation for a straight sanded piece', () => {
    const result = calculateSanneVosBluestonePricing({
      rfq: {
        material: 'Bluestone',
        finish: 'Antique',
        length: 100,
        width: 50,
        thickness: 3,
        quantity: 2,
        shape: 'Rectangular',
      },
      rate: supportedRate,
      finish: { name: 'Antique', abbreviation: 'A', formula_percentage: 10 },
    });

    expect(result.areaM2PerPiece).toBe(0.5);
    expect(result.totalAreaM2).toBe(1);
    expect(result.basePriceBeforeLoss).toBe(110);
    expect(result.lossAdjustedBasePrice).toBe(115.5);
    expect(result.finishMargin).toBe(1.9);
    expect(result.productPriceAfterMargin).toBe(219.45);
    expect(result.finalPriceCalculated).toBe(647.38);
  });

  it('matches the real Table tops case: 550x130x5 Regular / Regular / Leathered', () => {
    const result = calculateSanneVosBluestonePricing({
      rfq: {
        material: 'Bluestone',
        finish: 'Regular / Regular / Leathered',
        product_type: 'Table tops',
        finish_top: 'Regular',
        finish_edge: 'Regular',
        finish_color: 'Leathered',
        length: 550,
        width: 130,
        thickness: 5,
        quantity: 1,
        shape: 'Rectangular',
      },
      rate: {
        shape_kind: 'straight',
        thickness_cm: 5,
        surface_type: 'sanded',
        base_price_per_m2_eur: 205,
        discount_percentage: 3,
        net_price_per_m2_eur: 198.85,
        is_supported: true,
        unsupported_reason: null,
      },
      finish: { name: 'Leathered', abbreviation: 'L', formula_percentage: 11 },
      finishCode: 'L',
    });

    expect(result.areaM2PerPiece).toBe(7.15);
    expect(result.basePriceBeforeLoss).toBe(1578.17);
    expect(result.lossAdjustedBasePrice).toBe(1657.08);
    expect(result.finishMargin).toBe(1.9);
    expect(result.productPriceAfterMargin).toBe(3148.45);
    expect(result.finalPriceCalculated).toBe(9287.93);
    expect(result.pricingSettingsSnapshot.finishCode).toBe('L');
    expect(result.pricingSettingsSnapshot.finishParts).toEqual({
      top: 'Regular',
      edge: 'Regular',
      color: 'Leathered',
    });
  });

  it('applies the 2.1 margin for a Ferrara combination', () => {
    const result = calculateSanneVosBluestonePricing({
      rfq: { material: 'Bluestone', finish: 'Ferrara / Korinthia / Fumé', length: 100, width: 100, thickness: 3, quantity: 1, shape: 'Rectangular' },
      rate: supportedRate,
      finish: { name: 'Ferrara fumé korinthia', abbreviation: 'FEFK', formula_percentage: 88 },
    });

    expect(result.finishMargin).toBe(2.1);
    expect(result.finishPercentageMultiplier).toBe(1.88);
  });

  it('rejects unsupported rates and non-Bluestone materials', () => {
    expect(() =>
      calculateSanneVosBluestonePricing({
        rfq: { material: 'Marble', finish: 'Antique', length: 100, width: 50, thickness: 3, quantity: 1, shape: 'Rectangular' },
        rate: supportedRate,
        finish: { name: 'Antique', abbreviation: 'A', formula_percentage: 10 },
      })
    ).toThrow();
    expect(() =>
      calculateSanneVosBluestonePricing({
        rfq: { material: 'Bluestone', finish: 'Antique', length: 100, width: 50, thickness: 3, quantity: 1, shape: 'Rectangular' },
        rate: { ...supportedRate, is_supported: false, unsupported_reason: 'Not supported' },
        finish: { name: 'Antique', abbreviation: 'A', formula_percentage: 10 },
      })
    ).toThrow('Not supported');
  });
});

describe('golden rows from the Sanne Vos price sheet ("B - vos CHD")', () => {
  // Real rows from the sheet, priced with the sheet's own m² price so the formula
  // itself is verified. Column T ("PRIJS VOOR AFRONDING") is the expected result.
  const sheetRows = [
    { row: 1327, shape: 'Rectangular', thickness: 5, length: 250, width: 110, m2Price: 199, code: '', pct: 0, expected: 3220.7 },
    { row: 1239, shape: 'Rectangular', thickness: 5, length: 240, width: 110, m2Price: 199, code: 'L', pct: 11, expected: 3431.98 },
    { row: 1096, shape: 'Rectangular', thickness: 3, length: 211, width: 91, m2Price: 134, code: 'AR', pct: 28, expected: 1938.22 },
    { row: 783, shape: 'Rectangular', thickness: 2, length: 160, width: 74, m2Price: 91, code: 'F', pct: 23, expected: 779.94 },
    { row: 1085, shape: 'Rectangular', thickness: 4, length: 210, width: 90, m2Price: 199, code: 'BFR', pct: 58, expected: 3497.33 },
    { row: 1230, shape: 'Rectangular', thickness: 5, length: 240, width: 100, m2Price: 199, code: 'TR', pct: 72, expected: 5343.47 },
    { row: 673, shape: 'Round', thickness: 5, length: 145, width: null, m2Price: 288, code: 'A', pct: 11, expected: 3955.64 },
    { row: 1629, shape: 'Oval', thickness: 5, length: 300, width: 100, m2Price: 288, code: 'FEK', pct: 69, expected: 9497.98 },
  ];

  it.each(sheetRows)('row $row ($shape $thickness cm, code "$code") matches the sheet within 5 cents', (r) => {
    const result = calculateSanneVosBluestonePricing({
      rfq: { material: 'Bluestone', finish: r.code || 'Regular', length: r.length, width: r.width, thickness: r.thickness, quantity: 1, shape: r.shape },
      rate: {
        shape_kind: resolveSanneVosShapeKind(r.shape),
        thickness_cm: r.thickness,
        surface_type: 'sanded',
        base_price_per_m2_eur: r.m2Price,
        discount_percentage: 0,
        net_price_per_m2_eur: r.m2Price,
        is_supported: true,
        unsupported_reason: null,
      },
      finish: { name: r.code || 'Regular', abbreviation: r.code || null, formula_percentage: r.pct },
    });

    const diffInCents = Math.round(Math.abs(result.finalPriceCalculated - r.expected) * 100);
    expect(diffInCents).toBeLessThanOrEqual(5);
  });
});
