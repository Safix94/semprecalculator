import { describe, expect, it } from 'vitest';
import {
  calculateSupplierPricing,
  DEFAULT_TRUCK_MULTIPLIER_FACTOR,
  type SupplierPricingProfile,
} from '@/lib/pricing';

function profile(overrides: Partial<SupplierPricingProfile> = {}): SupplierPricingProfile {
  return {
    supplierId: 'supplier-1',
    transportMode: 'container',
    formulaVersion: 'supplier_transport_v1',
    containerPriceEur: 7500,
    containerVolumeM3: 67,
    productMarginFactor: 2.1,
    retailMultiplierFactor: 2.4,
    truckMultiplierFactor: null,
    ...overrides,
  };
}

// Golden values: guard the live pricing formulas against accidental changes.
describe('calculateSupplierPricing', () => {
  it('container mode: transport + margin + retail multiplier', () => {
    const result = calculateSupplierPricing(100, 2, profile());

    expect(result.transportCostCalculated).toBe(223.881);
    expect(result.shippingCostCalculated).toBe(223.881);
    expect(result.productPriceAfterMargin).toBe(210);
    expect(result.costIncludingTransport).toBe(433.88);
    expect(result.finalPriceCalculated).toBe(1041.31);
    expect(result.transportAdjustedBasePrice).toBeNull();
  });

  it('none mode: margin + retail multiplier only', () => {
    const result = calculateSupplierPricing(100, 2, profile({ transportMode: 'none' }));

    expect(result.transportCostCalculated).toBe(0);
    expect(result.productPriceAfterMargin).toBe(210);
    expect(result.costIncludingTransport).toBe(210);
    expect(result.finalPriceCalculated).toBe(504);
  });

  it('truck mode: truck multiplier applied to base price first', () => {
    const result = calculateSupplierPricing(
      100,
      2,
      profile({ transportMode: 'truck', truckMultiplierFactor: 1.5 })
    );

    expect(result.transportAdjustedBasePrice).toBe(150);
    expect(result.productPriceAfterMargin).toBe(315);
    expect(result.finalPriceCalculated).toBe(756);
  });

  it('truck mode falls back to the default truck multiplier', () => {
    const result = calculateSupplierPricing(
      100,
      2,
      profile({ transportMode: 'truck', truckMultiplierFactor: null })
    );

    expect(result.transportAdjustedBasePrice).toBe(100 * DEFAULT_TRUCK_MULTIPLIER_FACTOR);
  });

  it('rejects non-positive base price and volume', () => {
    expect(() => calculateSupplierPricing(0, 2, profile())).toThrow();
    expect(() => calculateSupplierPricing(100, 0, profile())).toThrow();
    expect(() => calculateSupplierPricing(-5, 2, profile())).toThrow();
  });

  it('container mode requires container price and volume', () => {
    expect(() =>
      calculateSupplierPricing(100, 2, profile({ containerPriceEur: null }))
    ).toThrow('Container price must be a positive number.');
    expect(() =>
      calculateSupplierPricing(100, 2, profile({ containerVolumeM3: null }))
    ).toThrow('Container volume must be a positive number.');
  });
});
