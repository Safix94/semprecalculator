import { describe, expect, it } from 'vitest';
import { createRfqSchema, submitPriceOnlyQuoteSchema, submitQuoteSchema } from '@/lib/validation';

const baseRfq = {
  product_type: 'Cushions',
  material: 'Fabric',
  material_id: '6d3d5f0e-2f4a-4c2b-9d0e-1a2b3c4d5e6f',
  finish: 'Sunbrella A',
  length: 60,
  width: 60,
  height: 10,
  thickness: 1,
  quantity: 1,
  shape: 'Rectangular',
};

describe('createRfqSchema own fabric', () => {
  it('requires a fabric when the finish is "Own fabric"', () => {
    const result = createRfqSchema.safeParse({ ...baseRfq, finish: 'Own fabric' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.own_fabric_id?.[0]).toBe('Fabric is required for Own fabric');
    }
  });

  it('accepts an own fabric request with a fabric', () => {
    const result = createRfqSchema.safeParse({
      ...baseRfq,
      finish: 'own fabric',
      own_fabric_id: '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d',
    });
    expect(result.success).toBe(true);
  });

  it('does not require a fabric for other finishes', () => {
    expect(createRfqSchema.safeParse(baseRfq).success).toBe(true);
  });
});

describe('quote schemas fabric meters', () => {
  it('accepts positive fabric meters on both quote schemas', () => {
    const full = submitQuoteSchema.safeParse({ basePrice: 24, lengthCm: 10, widthCm: 10, heightCm: 10, fabricMeters: '0.48' });
    expect(full.success).toBe(true);
    if (full.success) expect(full.data.fabricMeters).toBe(0.48);

    const priceOnly = submitPriceOnlyQuoteSchema.safeParse({ basePrice: 24, fabricMeters: 3.02 });
    expect(priceOnly.success).toBe(true);
    if (priceOnly.success) expect(priceOnly.data.fabricMeters).toBe(3.02);
  });

  it('rejects zero or negative fabric meters', () => {
    expect(submitPriceOnlyQuoteSchema.safeParse({ basePrice: 24, fabricMeters: 0 }).success).toBe(false);
    expect(submitPriceOnlyQuoteSchema.safeParse({ basePrice: 24, fabricMeters: -1 }).success).toBe(false);
  });

  it('keeps fabric meters optional', () => {
    const result = submitPriceOnlyQuoteSchema.safeParse({ basePrice: 24 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fabricMeters ?? null).toBeNull();
  });
});
