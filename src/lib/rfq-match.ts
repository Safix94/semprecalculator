import { isRoundShape } from '@/lib/rfq-format';
import type { Rfq, RfqSearchResult } from '@/types';

export type RfqMatchScore = 'exact' | 'similar_same_supplier' | 'similar_different_supplier';

export interface RfqMatchInput {
  productType: string;
  materials: string[];
  finishes: string[];
  supplierIds: string[];
  shape: string;
  length: number | null;
  width: number | null;
  height: number | null;
  thickness: number | null;
}

export interface RfqDuplicateMatch extends RfqSearchResult {
  matchScore: RfqMatchScore;
  reason: string;
}

export interface RfqDuplicateWarning {
  exact: RfqDuplicateMatch[];
  similar: RfqDuplicateMatch[];
}

interface RfqMatchSource {
  product_type?: string | null;
  material?: string | null;
  material_table_top?: string | null;
  material_table_foot?: string | null;
  finish?: string | null;
  finish_top?: string | null;
  finish_edge?: string | null;
  finish_color?: string | null;
  finish_table_top?: string | null;
  finish_table_foot?: string | null;
  supplier_ids?: string[];
  supplier_ids_table_top?: string[];
  supplier_ids_table_foot?: string[];
  shape?: string | null;
  length?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  thickness?: number | string | null;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedList(values: Array<string | null | undefined>): string[] {
  return uniqueSorted(values.map(normalizeText).filter(Boolean));
}

function supplierKey(value: string, part: 'default' | 'table_top' | 'table_foot'): string {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  return normalized.includes(':') ? normalized : `${part}:${normalized}`;
}

function normalizedSupplierIds(source: RfqMatchSource): string[] {
  return uniqueSorted([
    ...(source.supplier_ids ?? []).map((id) => supplierKey(id, 'default')),
    ...(source.supplier_ids_table_top ?? []).map((id) => supplierKey(id, 'table_top')),
    ...(source.supplier_ids_table_foot ?? []).map((id) => supplierKey(id, 'table_foot')),
  ]);
}

function listsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function listsIntersect(left: string[], right: string[]): boolean {
  return left.some((value) => right.includes(value));
}

function numbersEqual(left: number | null, right: number | null): boolean {
  if (left === null && right === null) return true;
  if (left === null || right === null) return false;
  return Math.abs(left - right) < 0.0001;
}

function dimensionsEqual(candidate: RfqMatchInput, input: RfqMatchInput): boolean {
  const candidateRound = isRoundShape(candidate.shape);
  const inputRound = isRoundShape(input.shape);

  return (
    normalizeText(candidate.shape) === normalizeText(input.shape) &&
    numbersEqual(candidate.length, input.length) &&
    (candidateRound || inputRound || numbersEqual(candidate.width, input.width)) &&
    numbersEqual(candidate.height, input.height) &&
    numbersEqual(candidate.thickness, input.thickness)
  );
}

export function buildRfqMatchInput(source: RfqMatchSource): RfqMatchInput {
  return {
    productType: normalizeText(source.product_type),
    materials: normalizedList([
      source.material,
      source.material_table_top,
      source.material_table_foot,
    ]),
    finishes: normalizedList([
      source.finish,
      source.finish_top,
      source.finish_edge,
      source.finish_color,
      source.finish_table_top,
      source.finish_table_foot,
    ]),
    supplierIds: normalizedSupplierIds(source),
    shape: normalizeText(source.shape),
    length: normalizeNumber(source.length),
    width: normalizeNumber(source.width),
    height: normalizeNumber(source.height),
    thickness: normalizeNumber(source.thickness),
  };
}

export function hasEnoughRfqMatchInput(input: RfqMatchInput): boolean {
  return (
    Boolean(input.productType) &&
    input.materials.length > 0 &&
    input.finishes.length > 0 &&
    input.supplierIds.length > 0
  );
}

export function scoreRfqMatch(candidate: RfqMatchInput, input: RfqMatchInput): RfqMatchScore | null {
  const sameProduct = candidate.productType === input.productType;
  const sameMaterials = listsEqual(candidate.materials, input.materials);
  const sameFinishes = listsEqual(candidate.finishes, input.finishes);

  if (!sameProduct || !sameMaterials || !sameFinishes) {
    return null;
  }

  const hasSharedSupplier = listsIntersect(candidate.supplierIds, input.supplierIds);
  const sameDimensions = dimensionsEqual(candidate, input);

  if (hasSharedSupplier && sameDimensions) {
    return 'exact';
  }

  if (hasSharedSupplier) {
    return 'similar_same_supplier';
  }

  if (sameDimensions) {
    return 'similar_different_supplier';
  }

  return null;
}

export function reasonForScore(score: RfqMatchScore): string {
  if (score === 'exact') {
    return 'Exact same supplier, product, material, finish, and dimensions';
  }

  if (score === 'similar_same_supplier') {
    return 'Same supplier, product, material, and finish; dimensions differ';
  }

  return 'Same product, material, finish, and dimensions; different supplier';
}

export function buildRfqCandidateMatchInput(rfq: Rfq, supplierIds: string[]): RfqMatchInput {
  return buildRfqMatchInput({
    product_type: rfq.product_type,
    material: rfq.material,
    material_table_top: rfq.material_table_top,
    material_table_foot: rfq.material_table_foot,
    finish: rfq.finish,
    finish_top: rfq.finish_top,
    finish_edge: rfq.finish_edge,
    finish_color: rfq.finish_color,
    finish_table_top: rfq.finish_table_top,
    finish_table_foot: rfq.finish_table_foot,
    supplier_ids: supplierIds,
    shape: rfq.shape,
    length: rfq.length,
    width: rfq.width,
    height: rfq.height,
    thickness: rfq.thickness,
  });
}
