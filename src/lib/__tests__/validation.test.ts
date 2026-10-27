import { describe, expect, it } from 'vitest';
import { createRfqSchema, getCreateRfqSchema, submitPriceOnlyQuoteSchema, submitQuoteSchema } from '@/lib/validation';
import { normalizeDetailFieldSettings } from '@/lib/product-type-detail-fields';

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

describe('createRfqSchema product detail settings', () => {
  const optionalFields = normalizeDetailFieldSettings(
    ['length', 'width', 'diameter', 'height', 'thickness', 'shape', 'quantity'].map((key) => ({
      key, enabled: true, required: false,
    })),
    'Cushions'
  );
  const optionalSchema = getCreateRfqSchema(optionalFields);

  it('accepts the cushion wizard payload with empty optional dimensions', () => {
    const result = optionalSchema.safeParse({ ...baseRfq, length: 0, width: 0, height: 0, thickness: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ length: 0, width: 0, height: 0, thickness: 0 });
    }
  });

  it('accepts omitted optional dimensions and shape and defaults quantity to one', () => {
    const result = optionalSchema.safeParse({
      ...baseRfq, length: undefined, width: undefined, height: undefined,
      thickness: undefined, shape: undefined, quantity: undefined,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quantity).toBe(1);
  });

  it('accepts a mix of supplied and empty optional fields', () => {
    expect(optionalSchema.safeParse({ ...baseRfq, width: 0, thickness: 0, shape: '' }).success).toBe(true);
  });

  it.each(['length', 'width', 'height', 'thickness'] as const)('still requires %s with default settings', (key) => {
    const result = createRfqSchema.safeParse({ ...baseRfq, [key]: 0 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors[key]).toBeDefined();
  });

  it.each([-1, 'invalid', Infinity])('rejects invalid optional dimensions: %s', (value) => {
    for (const key of ['length', 'width', 'height', 'thickness']) {
      expect(optionalSchema.safeParse({ ...baseRfq, [key]: value }).success).toBe(false);
    }
  });

  it('uses diameter settings for round requests instead of length and width settings', () => {
    const schema = getCreateRfqSchema(normalizeDetailFieldSettings([
      { key: 'diameter', enabled: true, required: false },
    ], 'Cushions'));
    expect(schema.safeParse({ ...baseRfq, shape: 'Round', length: 0, width: 0, thickness: 0 }).success).toBe(true);

    const requiredResult = createRfqSchema.safeParse({ ...baseRfq, shape: 'Round', length: 0, width: 0 });
    expect(requiredResult.success).toBe(false);
    if (!requiredResult.success) expect(requiredResult.error.issues.some((issue) => issue.path[0] === 'diameter')).toBe(true);
  });

  it('does not require disabled fields even if their saved required flag is true', () => {
    const schema = getCreateRfqSchema(normalizeDetailFieldSettings([
      { key: 'height', enabled: false, required: true },
      { key: 'thickness', enabled: false, required: true },
      { key: 'shape', enabled: false, required: true },
    ], 'Cushions'));
    expect(schema.safeParse({ ...baseRfq, height: 0, thickness: 0, shape: '' }).success).toBe(true);
  });

  it('still requires shape by default', () => {
    expect(createRfqSchema.safeParse({ ...baseRfq, shape: '' }).success).toBe(false);
  });
});

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
