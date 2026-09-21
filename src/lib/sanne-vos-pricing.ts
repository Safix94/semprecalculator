import { isRoundShape } from '@/lib/rfq-format';

export const SANNE_VOS_BLUESTONE_FORMULA_VERSION = 'sanne_vos_bluestone_v1';
export const SANNE_VOS_SUPPLIER_NAME = 'Sanne Vos';
export const SANNE_VOS_MATERIAL_NAME = 'Bluestone';
export const SANNE_VOS_LOSS_RECOVERY_MULTIPLIER = 1.05;
export const SANNE_VOS_RETAIL_MULTIPLIER = 2.95;

export type SanneVosShapeKind = 'straight' | 'round';
export type SanneVosSurfaceType = 'sanded' | 'saw_cut';

export interface SanneVosRfqInput {
  material: string | null;
  finish: string | null;
  product_type?: string | null;
  finish_top?: string | null;
  finish_edge?: string | null;
  finish_color?: string | null;
  length: number | string | null;
  width: number | string | null;
  thickness: number | string | null;
  quantity: number | string | null;
  shape: string | null;
}

export interface SanneVosBluestoneRate {
  shape_kind: SanneVosShapeKind;
  thickness_cm: number | string;
  surface_type: SanneVosSurfaceType;
  base_price_per_m2_eur: number | string | null;
  discount_percentage: number | string;
  net_price_per_m2_eur: number | string | null;
  is_supported: boolean;
  unsupported_reason: string | null;
}

export interface SanneVosFinishFormula {
  name: string;
  abbreviation: string | null;
  formula_percentage: number | string | null;
}

export interface SanneVosBluestonePricingResult {
  areaM2PerPiece: number;
  totalAreaM2: number;
  quantity: number;
  basePriceBeforeLoss: number;
  lossAdjustedBasePrice: number;
  productPriceAfterMargin: number;
  finalPriceCalculated: number;
  finishPercentageMultiplier: number;
  finishMargin: number;
  shapeKind: SanneVosShapeKind;
  surfaceType: SanneVosSurfaceType;
  pricingSettingsSnapshot: Record<string, unknown>;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeCode(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

function toPositiveNumber(value: number | string | null | undefined, label: string): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return numeric;
}

export function isSanneVosSupplierName(name: string | null | undefined): boolean {
  return normalizeText(name) === normalizeText(SANNE_VOS_SUPPLIER_NAME);
}

export function isBluestoneMaterialName(name: string | null | undefined): boolean {
  return normalizeText(name) === normalizeText(SANNE_VOS_MATERIAL_NAME);
}

export function isSanneVosBluestoneAutoPricingCandidate(
  supplierName: string | null | undefined,
  rfq: Pick<SanneVosRfqInput, 'material'>
): boolean {
  return isSanneVosSupplierName(supplierName) && isBluestoneMaterialName(rfq.material);
}

export function isSanneVosRoundLikeShape(shape: string | null | undefined): boolean {
  return isRoundShape(shape) || normalizeText(shape) === 'oval';
}

// Round and oval tops share the round m² rate in the Sanne Vos price list.
export function resolveSanneVosShapeKind(shape: string | null | undefined): SanneVosShapeKind {
  return isSanneVosRoundLikeShape(shape) ? 'round' : 'straight';
}

export function resolveSanneVosSurfaceType(abbreviation: string | null | undefined): SanneVosSurfaceType {
  const code = normalizeCode(abbreviation);
  return code.includes('SC') ? 'saw_cut' : 'sanded';
}

// The Sanne Vos sheet prices every top on its bounding box (L × W), so a round top
// is charged as diameter × diameter and an oval as length × width.
export function calculateSanneVosAreaM2(rfq: Pick<SanneVosRfqInput, 'shape' | 'length' | 'width'>): number {
  const lengthCm = toPositiveNumber(rfq.length, 'Length');
  const hasWidth = rfq.width !== null && rfq.width !== undefined && rfq.width !== '';
  const widthCm = isSanneVosRoundLikeShape(rfq.shape) && !hasWidth
    ? lengthCm
    : toPositiveNumber(rfq.width, 'Width');

  // Keep full precision here: the Sanne Vos sheet never rounds the area, and rounding
  // 0.0625 m² to 0.063 already shifts a small top by almost 1 %.
  return roundTo((lengthCm / 100) * (widthCm / 100), 6);
}

export function percentageToMultiplier(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    throw new Error('No finish formula percentage configured for this finish.');
  }

  const percentage = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(percentage) || percentage < 0) {
    throw new Error('Finish formula percentage must be a non-negative number.');
  }

  return roundTo(1 + percentage / 100, 4);
}

// Margin rule confirmed 2026-09: always 1.9, except 2.1 when the finish code
// contains FE (Ferrara), T (Tiré) or V (Vintage). Regular (no code) is 1.9.
export function resolveFinishMargin(abbreviation: string | null | undefined): number {
  const code = normalizeCode(abbreviation);
  if (code.includes('FE') || code.includes('T') || code.includes('V')) {
    return 2.1;
  }

  return 1.9;
}

const NEUTRAL_FINISH_PARTS = new Set(['', 'regular', 'n.v.t.', 'nvt', 'n/a']);

// Regular / N.v.t. add nothing to a Table tops finish code.
export function isSanneVosNeutralFinishPart(value: string | null | undefined): boolean {
  return NEUTRAL_FINISH_PARTS.has(normalizeText(value));
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) {
    return [items];
  }

  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest])
  );
}

/**
 * Builds candidate finish codes for a Table tops request from the abbreviations of
 * its parts, given in canonical order: top, color, edge (e.g. A + F + R → "AFR").
 * The canonical concatenation comes first; the other unit permutations follow as
 * fallbacks because the master list sometimes stores a combination in another
 * order (e.g. "PEF" for Pebbles fumé). Empty codes are ignored.
 */
export function composeSanneVosFinishCodes(codes: Array<string | null | undefined>): string[] {
  const units = codes.map((code) => normalizeCode(code)).filter((code) => code.length > 0);
  if (units.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const order of permutations(units)) {
    const candidate = order.join('');
    if (!seen.has(candidate)) {
      seen.add(candidate);
      candidates.push(candidate);
    }
  }

  return candidates;
}

export function calculateSanneVosBluestonePricing({
  rfq,
  rate,
  finish,
  finishCode,
}: {
  rfq: SanneVosRfqInput;
  rate: SanneVosBluestoneRate;
  finish: SanneVosFinishFormula;
  /** Composed Table tops code that matched the master list; defaults to the finish abbreviation. */
  finishCode?: string | null;
}): SanneVosBluestonePricingResult {
  if (!isBluestoneMaterialName(rfq.material)) {
    throw new Error('Automatic Sanne Vos pricing is only configured for Bluestone.');
  }

  if (!rate.is_supported) {
    throw new Error(rate.unsupported_reason ?? 'Sanne Vos does not support this Bluestone shape/thickness.');
  }

  const netPricePerM2 = toPositiveNumber(rate.net_price_per_m2_eur, 'Net price per m²');
  const quantity = toPositiveNumber(rfq.quantity ?? 1, 'Quantity');
  const areaM2PerPiece = calculateSanneVosAreaM2(rfq);
  const totalAreaM2 = roundTo(areaM2PerPiece * quantity, 6);
  const resolvedFinishCode = normalizeCode(finishCode ?? finish.abbreviation) || null;
  const finishPercentageMultiplier = percentageToMultiplier(finish.formula_percentage);
  const finishMargin = resolveFinishMargin(resolvedFinishCode);
  const basePriceBeforeLoss = roundTo(totalAreaM2 * netPricePerM2 * finishPercentageMultiplier, 2);
  const lossAdjustedBasePrice = roundTo(basePriceBeforeLoss * SANNE_VOS_LOSS_RECOVERY_MULTIPLIER, 2);
  const productPriceAfterMargin = roundTo(lossAdjustedBasePrice * finishMargin, 2);
  const finalPriceCalculated = roundTo(productPriceAfterMargin * SANNE_VOS_RETAIL_MULTIPLIER, 2);

  return {
    areaM2PerPiece,
    totalAreaM2,
    quantity,
    basePriceBeforeLoss,
    lossAdjustedBasePrice,
    productPriceAfterMargin,
    finalPriceCalculated,
    finishPercentageMultiplier,
    finishMargin,
    shapeKind: rate.shape_kind,
    surfaceType: rate.surface_type,
    pricingSettingsSnapshot: {
      formulaVersion: SANNE_VOS_BLUESTONE_FORMULA_VERSION,
      supplierSpecialPricing: true,
      supplierName: SANNE_VOS_SUPPLIER_NAME,
      material: SANNE_VOS_MATERIAL_NAME,
      shapeKind: rate.shape_kind,
      thicknessCm: Number(rate.thickness_cm),
      surfaceType: rate.surface_type,
      areaM2PerPiece,
      quantity,
      totalAreaM2,
      basePricePerM2Eur: rate.base_price_per_m2_eur === null ? null : Number(rate.base_price_per_m2_eur),
      discountPercentage: Number(rate.discount_percentage),
      netPricePerM2Eur: netPricePerM2,
      finishName: finish.name,
      finishAbbreviation: finish.abbreviation,
      finishCode: resolvedFinishCode,
      finishParts: {
        top: rfq.finish_top ?? null,
        edge: rfq.finish_edge ?? null,
        color: rfq.finish_color ?? null,
      },
      finishFormulaPercentage: Number(finish.formula_percentage),
      finishPercentageMultiplier,
      lossRecoveryMultiplier: SANNE_VOS_LOSS_RECOVERY_MULTIPLIER,
      finishMargin,
      retailMultiplier: SANNE_VOS_RETAIL_MULTIPLIER,
      formula: 'totalAreaM2 * netPricePerM2Eur * finishPercentageMultiplier * lossRecoveryMultiplier * finishMargin * retailMultiplier',
    },
  };
}
