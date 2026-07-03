import { describe, expect, it } from 'vitest';
import {
  formatRfqDimensions,
  formatRfqDimensionsWithOptions,
  isRoundShape,
  isTablesProductType,
  isTableTopsProductType,
} from '@/lib/rfq-format';

describe('product type helpers', () => {
  it('detects tables product types loosely', () => {
    expect(isTablesProductType('Tables')).toBe(true);
    expect(isTablesProductType('table tops')).toBe(true);
    expect(isTablesProductType('TableTops')).toBe(true);
    expect(isTablesProductType('Benches')).toBe(false);
    expect(isTablesProductType(null)).toBe(false);
  });

  it('detects table tops specifically', () => {
    expect(isTableTopsProductType('Table Tops')).toBe(true);
    expect(isTableTopsProductType('tables')).toBe(false);
  });

  it('detects round shapes', () => {
    expect(isRoundShape(' Round ')).toBe(true);
    expect(isRoundShape('Rectangular')).toBe(false);
    expect(isRoundShape(null)).toBe(false);
  });
});

describe('formatRfqDimensions', () => {
  it('formats rectangular dimensions with thickness', () => {
    expect(
      formatRfqDimensions({ shape: 'Rectangular', length: 200, width: 100, height: 75, thickness: 3 })
    ).toBe('200 x 100 x 75 cm (thickness top: 3 cm)');
  });

  it('formats round dimensions with diameter notation', () => {
    expect(
      formatRfqDimensions({ shape: 'Round', length: 120, width: 0, height: 75, thickness: 3 })
    ).toBe('Ø 120 x 75 cm (+ 3 cm thickness top)');
  });

  it('omits thickness when requested or zero', () => {
    expect(
      formatRfqDimensionsWithOptions(
        { shape: 'Rectangular', length: 200, width: 100, height: 75, thickness: 3 },
        { includeThickness: false }
      )
    ).toBe('200 x 100 x 75 cm');
    expect(
      formatRfqDimensions({ shape: 'Rectangular', length: 200, width: 100, height: 75, thickness: 0 })
    ).toBe('200 x 100 x 75 cm');
  });
});
