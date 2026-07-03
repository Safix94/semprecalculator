import { describe, expect, it } from 'vitest';
import {
  buildRfqMatchInput,
  hasEnoughRfqMatchInput,
  scoreRfqMatch,
} from '@/lib/rfq-match';

const baseSource = {
  product_type: 'Tables',
  material: 'Bluestone',
  finish: 'Honed',
  supplier_ids: ['supplier-1'],
  shape: 'Rectangular',
  length: 200,
  width: 100,
  height: 75,
  thickness: 3,
};

describe('buildRfqMatchInput', () => {
  it('normalizes text, dedupes lists and parses numbers', () => {
    const input = buildRfqMatchInput({
      ...baseSource,
      material: ' Bluestone ',
      material_table_top: 'bluestone',
      length: '200,5',
    });

    expect(input.productType).toBe('tables');
    expect(input.materials).toEqual(['bluestone']);
    expect(input.length).toBe(200.5);
    expect(input.supplierIds).toEqual(['default:supplier-1']);
  });
});

describe('hasEnoughRfqMatchInput', () => {
  it('requires product type, materials, finishes and suppliers', () => {
    expect(hasEnoughRfqMatchInput(buildRfqMatchInput(baseSource))).toBe(true);
    expect(hasEnoughRfqMatchInput(buildRfqMatchInput({ ...baseSource, finish: null }))).toBe(false);
    expect(hasEnoughRfqMatchInput(buildRfqMatchInput({ ...baseSource, supplier_ids: [] }))).toBe(false);
  });
});

describe('scoreRfqMatch', () => {
  const input = buildRfqMatchInput(baseSource);

  it('scores exact when supplier and dimensions match', () => {
    expect(scoreRfqMatch(buildRfqMatchInput(baseSource), input)).toBe('exact');
  });

  it('scores similar_same_supplier when dimensions differ', () => {
    const candidate = buildRfqMatchInput({ ...baseSource, length: 180 });
    expect(scoreRfqMatch(candidate, input)).toBe('similar_same_supplier');
  });

  it('scores similar_different_supplier when only the supplier differs', () => {
    const candidate = buildRfqMatchInput({ ...baseSource, supplier_ids: ['supplier-2'] });
    expect(scoreRfqMatch(candidate, input)).toBe('similar_different_supplier');
  });

  it('returns null when material differs', () => {
    const candidate = buildRfqMatchInput({ ...baseSource, material: 'Marble' });
    expect(scoreRfqMatch(candidate, input)).toBeNull();
  });

  it('ignores width for round shapes', () => {
    const roundSource = { ...baseSource, shape: 'Round', width: 0 };
    const candidate = buildRfqMatchInput({ ...roundSource, width: 999 });
    expect(scoreRfqMatch(candidate, buildRfqMatchInput(roundSource))).toBe('exact');
  });
});
