/**
 * "Own fabric" surcharge for cushions and upholstery.
 *
 * Source: Excel "Prijsberekening_nieuwe prijzen_2024_Bel CHD.xlsx",
 * tab "B - jardinico CHD (2025)". When the sales team picks the finish
 * "Own fabric" (a Sempre fabric the supplier does not stock), the supplier
 * quotes the price for sewing the piece and the running meters of fabric
 * it needs. The fabric cost (meters × price per running meter, from the
 * own-fabric master list) is added to the supplier's purchase price BEFORE
 * the supplier's normal margin and multiplier are applied:
 *
 *   purchasePrice = supplierBasePrice + meters × pricePerMeter
 *   retailPrice   = normal supplier formula on purchasePrice
 *
 * All calculations are server-side only.
 */
import {
  calculateSupplierPricing,
  type SupplierPricingProfile,
  type SupplierPricingResult,
} from '@/lib/pricing';

export const OWN_FABRIC_FINISH_NAME = 'Own fabric';
export const OWN_FABRIC_FORMULA = 'purchasePrice = supplierBasePrice + meters × pricePerMeter';

export interface OwnFabricInput {
  /** Name of the fabric from the own-fabric master list, stored for traceability. */
  fabricName: string;
  /** Running meters of fabric the supplier needs for one piece. */
  meters: number;
  /** Price per running meter in EUR at the time of the quote. */
  pricePerMeterEur: number;
}

export interface OwnFabricPricingResult extends SupplierPricingResult {
  /** Supplier price without fabric, in EUR. */
  supplierBasePriceEur: number;
  fabricCostEur: number;
  /** Supplier price + fabric cost: the amount the normal formula starts from. */
  purchasePriceEur: number;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function assertPositiveNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

export function isOwnFabricFinish(finish: string | null | undefined): boolean {
  return normalizeText(finish) === normalizeText(OWN_FABRIC_FINISH_NAME);
}

export function calculateOwnFabricCost(input: Pick<OwnFabricInput, 'meters' | 'pricePerMeterEur'>): number {
  assertPositiveNumber(input.meters, 'Fabric meters');
  assertPositiveNumber(input.pricePerMeterEur, 'Fabric price per meter');
  return roundTo(input.meters * input.pricePerMeterEur, 2);
}

/**
 * Supplier pricing for an "Own fabric" request: the fabric cost is added to the
 * supplier's base price, then the supplier's own transport/margin/multiplier
 * formula runs on that purchase price.
 */
export function calculateSupplierPricingWithOwnFabric(
  supplierBasePriceEur: number,
  volumeM3: number,
  profile: SupplierPricingProfile,
  fabric: OwnFabricInput
): OwnFabricPricingResult {
  assertPositiveNumber(supplierBasePriceEur, 'Supplier base price');
  const fabricCostEur = calculateOwnFabricCost(fabric);
  const purchasePriceEur = roundTo(supplierBasePriceEur + fabricCostEur, 2);
  const pricing = calculateSupplierPricing(purchasePriceEur, volumeM3, profile);

  return {
    ...pricing,
    supplierBasePriceEur,
    fabricCostEur,
    purchasePriceEur,
    pricingSettingsSnapshot: {
      ...pricing.pricingSettingsSnapshot,
      ownFabric: {
        fabricName: fabric.fabricName,
        meters: fabric.meters,
        pricePerMeterEur: fabric.pricePerMeterEur,
        fabricCostEur,
        supplierBasePriceEur,
        purchasePriceEur,
        formula: OWN_FABRIC_FORMULA,
      },
    },
  };
}
