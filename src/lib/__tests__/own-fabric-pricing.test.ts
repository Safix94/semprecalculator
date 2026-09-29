import { describe, expect, it } from 'vitest';
import {
  OWN_FABRIC_FINISH_NAME,
  calculateOwnFabricCost,
  calculateSupplierPricingWithOwnFabric,
  isOwnFabricFinish,
} from '@/lib/own-fabric-pricing';
import type { SupplierPricingProfile } from '@/lib/pricing';

// Jardinico's pricing profile: no transport, margin 2.0, retail multiple 2.5
// (Excel "Prijsberekening_nieuwe prijzen_2024_Bel CHD.xlsx", tab "B - jardinico CHD (2025)").
const jardinicoProfile: SupplierPricingProfile = {
  supplierId: 'jardinico',
  transportMode: 'none',
  formulaVersion: 'supplier_transport_v1',
  containerPriceEur: null,
  containerVolumeM3: null,
  productMarginFactor: 2,
  retailMultiplierFactor: 2.5,
  truckMultiplierFactor: null,
};

describe('isOwnFabricFinish', () => {
  it('matches the "Own fabric" finish case- and whitespace-insensitively', () => {
    expect(OWN_FABRIC_FINISH_NAME).toBe('Own fabric');
    expect(isOwnFabricFinish('Own fabric')).toBe(true);
    expect(isOwnFabricFinish('  own   FABRIC ')).toBe(true);
  });

  it('does not match other finishes or missing values', () => {
    expect(isOwnFabricFinish('Sunbrella A')).toBe(false);
    expect(isOwnFabricFinish('')).toBe(false);
    expect(isOwnFabricFinish(null)).toBe(false);
    expect(isOwnFabricFinish(undefined)).toBe(false);
  });
});

describe('calculateOwnFabricCost', () => {
  it('multiplies running meters by the price per meter, rounded to cents', () => {
    // Excel row 2: 0.48 m × € 29 = € 13.92
    expect(calculateOwnFabricCost({ meters: 0.48, pricePerMeterEur: 29 })).toBe(13.92);
    // Seat cushion: 3.02 m × € 32.30 = 97.546 → 97.55
    expect(calculateOwnFabricCost({ meters: 3.02, pricePerMeterEur: 32.3 })).toBe(97.55);
  });

  it('rejects non-positive meters or rates', () => {
    expect(() => calculateOwnFabricCost({ meters: 0, pricePerMeterEur: 29 })).toThrow();
    expect(() => calculateOwnFabricCost({ meters: 1, pricePerMeterEur: 0 })).toThrow();
    expect(() => calculateOwnFabricCost({ meters: Number.NaN, pricePerMeterEur: 29 })).toThrow();
  });
});

describe('calculateSupplierPricingWithOwnFabric', () => {
  it('adds the fabric cost to the purchase price before margin and multiplier (Excel row 2)', () => {
    // Franco bar chair, Bandung pine: Jardinico € 24 + 0.48 m × € 29 = € 37.92
    // → × 2 = 75.84 → × 2.5 = 189.60 → 190 + 1 = € 191
    const result = calculateSupplierPricingWithOwnFabric(24, 0, jardinicoProfile, {
      fabricName: 'Bandung pine',
      meters: 0.48,
      pricePerMeterEur: 29,
    });

    expect(result.fabricCostEur).toBe(13.92);
    expect(result.purchasePriceEur).toBe(37.92);
    expect(result.productPriceAfterMargin).toBe(75.84);
    expect(result.finalPriceCalculated).toBe(191);
  });

  it('matches the Excel seat cushion price (row 29: Sulawesi saffron)', () => {
    // € 94 + 3.02 m × € 32.30 = 191.55 → × 2 = 383.10 → × 2.5 = 957.75 → 958 + 1 = € 959
    const result = calculateSupplierPricingWithOwnFabric(94, 0, jardinicoProfile, {
      fabricName: 'Sulawesi saffron',
      meters: 3.02,
      pricePerMeterEur: 32.3,
    });

    expect(result.finalPriceCalculated).toBe(959);
  });

  it('records the fabric details in the pricing snapshot', () => {
    const result = calculateSupplierPricingWithOwnFabric(24, 0, jardinicoProfile, {
      fabricName: 'Bandung pine',
      meters: 0.48,
      pricePerMeterEur: 29,
    });

    expect(result.pricingSettingsSnapshot.ownFabric).toEqual({
      fabricName: 'Bandung pine',
      meters: 0.48,
      pricePerMeterEur: 29,
      fabricCostEur: 13.92,
      supplierBasePriceEur: 24,
      purchasePriceEur: 37.92,
      formula: 'purchasePrice = supplierBasePrice + meters × pricePerMeter',
    });
    expect(result.pricingSettingsSnapshot.transportMode).toBe('none');
  });

  it('keeps the transport cost for container suppliers', () => {
    const containerProfile: SupplierPricingProfile = {
      ...jardinicoProfile,
      supplierId: 'container',
      transportMode: 'container',
      containerPriceEur: 6700,
      containerVolumeM3: 67,
      productMarginFactor: 2.1,
      retailMultiplierFactor: 2.4,
    };
    // (100 + 1 × 10) × 2.1 = 231 + transport 100 × 0.5 m³ = 281 → × 2.4 = 674.4 → 674 + 1
    const result = calculateSupplierPricingWithOwnFabric(100, 0.5, containerProfile, {
      fabricName: 'Kimi 05',
      meters: 1,
      pricePerMeterEur: 10,
    });

    expect(result.transportCostCalculated).toBe(50);
    expect(result.finalPriceCalculated).toBe(675);
  });
});
