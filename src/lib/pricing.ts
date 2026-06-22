/**
 * Pricing defaults and calculations.
 * All calculations are server-side only.
 */

export interface PricingSettings {
  containerPriceEur: number;
  containerVolumeM3: number;
  productMarginFactor: number;
  shippingMarginFactor: number;
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  containerPriceEur: 7500,
  containerVolumeM3: 67,
  productMarginFactor: 2.1,
  shippingMarginFactor: 2.4,
};

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Calculate shipping cost based on supplier-entered volume.
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
 * Calculate final price including margins.
 * Formula: (basePrice * productMarginFactor) + (shippingCost * shippingMarginFactor)
 * Rounded to 2 decimal places.
 */
export function calculateFinalPrice(
  basePrice: number,
  shippingCostCalculated: number,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS
): number {
  return roundTo(
    basePrice * settings.productMarginFactor +
      shippingCostCalculated * settings.shippingMarginFactor,
    2
  );
}

/**
 * Calculate all pricing from base inputs.
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
