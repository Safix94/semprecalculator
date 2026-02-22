/**
 * Pricing constants and calculations.
 * All calculations are server-side only.
 */

export const PRICING = {
  containerPriceEur: 7500,
  containerVolumeM3: 67,
  productMarginFactor: 2.1,
  shippingMarginFactor: 2.4,
} as const;

/**
 * Calculate shipping cost based on volume.
 * Formula: (containerPriceEur / containerVolumeM3) * volumeM3
 * Rounded to 3 decimal places.
 */
export function calculateShippingCost(volumeM3: number): number {
  const raw =
    (PRICING.containerPriceEur / PRICING.containerVolumeM3) * volumeM3;
  return Math.round(raw * 1000) / 1000;
}

/**
 * Calculate final price including margins.
 * Formula: (basePrice * productMarginFactor) + (shippingCost * shippingMarginFactor)
 * Rounded to 2 decimal places.
 */
export function calculateFinalPrice(
  basePrice: number,
  shippingCostCalculated: number
): number {
  const raw =
    basePrice * PRICING.productMarginFactor +
    shippingCostCalculated * PRICING.shippingMarginFactor;
  return Math.round(raw * 100) / 100;
}

/**
 * Calculate all pricing from base inputs.
 */
export function calculateAllPricing(basePrice: number, volumeM3: number) {
  const shippingCostCalculated = calculateShippingCost(volumeM3);
  const finalPriceCalculated = calculateFinalPrice(
    basePrice,
    shippingCostCalculated
  );
  return { shippingCostCalculated, finalPriceCalculated };
}
