/**
 * Pricing defaults and calculations.
 * All calculations are server-side only.
 */

export type TransportMode = 'none' | 'container' | 'truck';

export interface PricingSettings {
  containerPriceEur: number;
  containerVolumeM3: number;
  productMarginFactor: number;
  /** Legacy name. Semantically this is the retail multiplier. */
  shippingMarginFactor: number;
}

export interface SupplierPricingProfile {
  supplierId: string;
  transportMode: TransportMode;
  formulaVersion: string;
  containerPriceEur: number | null;
  containerVolumeM3: number | null;
  productMarginFactor: number;
  retailMultiplierFactor: number;
  truckMultiplierFactor: number | null;
}

export interface SupplierPricingResult {
  shippingCostCalculated: number;
  transportCostCalculated: number;
  productPriceAfterMargin: number;
  costIncludingTransport: number;
  finalPriceCalculated: number;
  pricingSettingsSnapshot: Record<string, unknown>;
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  containerPriceEur: 7500,
  containerVolumeM3: 67,
  productMarginFactor: 2.1,
  shippingMarginFactor: 2.4,
};

export const SUPPLIER_PRICING_FORMULA_VERSION = 'supplier_transport_v1';

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function assertPositiveNumber(value: number | null, label: string): asserts value is number {
  if (!Number.isFinite(value) || value === null || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

/**
 * Calculate legacy/global shipping cost based on supplier-entered volume.
 * Formula: (containerPriceEur / containerVolumeM3) * volumeM3
 * Rounded to 3 decimal places.
 */
export function calculateShippingCost(
  volumeM3: number,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS
): number {
  return roundTo((settings.containerPriceEur / settings.containerVolumeM3) * volumeM3, 3);
}

/**
 * Legacy calculation retained for older/global settings code paths.
 * Formula: (basePrice * productMarginFactor * shippingMarginFactor) + shippingCost
 * Rounded to 2 decimal places.
 */
export function calculateFinalPrice(
  basePrice: number,
  shippingCostCalculated: number,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS
): number {
  return roundTo(
    basePrice * settings.productMarginFactor * settings.shippingMarginFactor +
      shippingCostCalculated,
    2
  );
}

/**
 * Legacy/global pricing calculation retained for compatibility.
 */
export function calculateAllPricing(
  basePrice: number,
  volumeM3: number,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS
) {
  const shippingCostCalculated = calculateShippingCost(volumeM3, settings);
  const finalPriceCalculated = calculateFinalPrice(
    basePrice,
    shippingCostCalculated,
    settings
  );
  return { shippingCostCalculated, finalPriceCalculated };
}

function calculateTransportCost(volumeM3: number, profile: SupplierPricingProfile): number {
  if (profile.transportMode === 'none') {
    return 0;
  }

  if (profile.transportMode === 'container') {
    assertPositiveNumber(profile.containerPriceEur, 'Container price');
    assertPositiveNumber(profile.containerVolumeM3, 'Container volume');
    return roundTo((profile.containerPriceEur / profile.containerVolumeM3) * volumeM3, 3);
  }

  throw new Error('Truck pricing is not configured yet. Use container or no transport for now.');
}

/**
 * Supplier-level pricing v2.
 *
 * Container formula:
 * transportCost = (containerPriceEur / containerVolumeM3) * volumeM3
 * productPriceAfterMargin = basePrice * productMarginFactor
 * costIncludingTransport = productPriceAfterMargin + transportCost
 * retailPrice = costIncludingTransport * retailMultiplierFactor
 */
export function calculateSupplierPricing(
  basePrice: number,
  volumeM3: number,
  profile: SupplierPricingProfile
): SupplierPricingResult {
  assertPositiveNumber(basePrice, 'Supplier base price');
  assertPositiveNumber(volumeM3, 'Supplier volume');
  assertPositiveNumber(profile.productMarginFactor, 'Product margin');
  assertPositiveNumber(profile.retailMultiplierFactor, 'Retail multiplier');

  const transportCostCalculated = calculateTransportCost(volumeM3, profile);
  const productPriceAfterMargin = roundTo(basePrice * profile.productMarginFactor, 2);
  const costIncludingTransport = roundTo(productPriceAfterMargin + transportCostCalculated, 2);
  const finalPriceCalculated = roundTo(costIncludingTransport * profile.retailMultiplierFactor, 2);

  return {
    shippingCostCalculated: transportCostCalculated,
    transportCostCalculated,
    productPriceAfterMargin,
    costIncludingTransport,
    finalPriceCalculated,
    pricingSettingsSnapshot: {
      formulaVersion: profile.formulaVersion || SUPPLIER_PRICING_FORMULA_VERSION,
      transportMode: profile.transportMode,
      containerPriceEur: profile.containerPriceEur,
      containerVolumeM3: profile.containerVolumeM3,
      productMarginFactor: profile.productMarginFactor,
      retailMultiplierFactor: profile.retailMultiplierFactor,
      truckMultiplierFactor: profile.truckMultiplierFactor,
    },
  };
}
