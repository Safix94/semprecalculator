'use server';

import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Rfq, RfqQuote, RfqSearchResponse, RfqSearchResult, Supplier } from '@/types';

const DEFAULT_PAGE_SIZE = 25;
const MAX_FETCH_ROWS = 1000;

export interface SearchRfqsInput {
  page?: number;
  pageSize?: number;
  q?: string | null;
  supplier?: string | null;
  productType?: string | null;
  material?: string | null;
  finish?: string | null;
  shape?: string | null;
  status?: string | null;
  createdFrom?: string | null;
  createdTo?: string | null;
  length?: string | number | null;
  width?: string | number | null;
  height?: string | number | null;
  thickness?: string | number | null;
}

type InviteRow = {
  supplier_id: string | null;
  supplier: Supplier | Supplier[] | null;
};

type QuoteRow = Pick<RfqQuote, 'id' | 'final_price_calculated'>;

type RfqSearchRow = Rfq & {
  rfq_invites?: InviteRow[] | null;
  rfq_quotes?: QuoteRow[] | null;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeLoose(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function getString(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function parsePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value as number));
}

function parseNumberFilter(value: string | number | null | undefined): number | null {
  const normalized = getString(value);
  if (!normalized) return null;
  const parsed = Number(normalized.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function numbersMatch(actual: number, expected: number | null): boolean {
  if (expected === null) return true;
  return Math.abs(Number(actual) - expected) < 0.0001;
}

function textIncludes(value: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  return normalizeText(value).includes(needle);
}

function supplierFromInvite(invite: InviteRow): Supplier | null {
  if (Array.isArray(invite.supplier)) {
    return invite.supplier[0] ?? null;
  }
  return invite.supplier ?? null;
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function buildSearchBlob(row: RfqSearchRow, supplierNames: string[]): string {
  return [
    row.customer_name,
    row.product_type,
    row.material,
    row.material_table_top,
    row.material_table_foot,
    row.finish,
    row.finish_top,
    row.finish_edge,
    row.finish_color,
    row.finish_table_top,
    row.finish_table_foot,
    row.shape,
    row.model,
    row.usage_environment,
    row.notes,
    row.status,
    ...supplierNames,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(' | ');
}

function materialMatches(row: RfqSearchRow, materialFilter: string): boolean {
  if (!materialFilter) return true;
  return [row.material, row.material_table_top, row.material_table_foot].some((value) => textIncludes(value, materialFilter));
}

function finishMatches(row: RfqSearchRow, finishFilter: string): boolean {
  if (!finishFilter) return true;
  return [
    row.finish,
    row.finish_top,
    row.finish_edge,
    row.finish_color,
    row.finish_table_top,
    row.finish_table_foot,
  ].some((value) => textIncludes(value, finishFilter));
}

function rowToResult(row: RfqSearchRow): RfqSearchResult {
  const suppliers = (row.rfq_invites ?? [])
    .map(supplierFromInvite)
    .filter((supplier): supplier is Supplier => Boolean(supplier));
  const supplierNames = uniqueSorted(suppliers.map((supplier) => supplier.name));
  const supplierIds = uniqueSorted([
    ...(row.rfq_invites ?? []).map((invite) => invite.supplier_id),
    ...suppliers.map((supplier) => supplier.id),
  ]);
  const quotes = row.rfq_quotes ?? [];
  const bestFinalPrice = quotes
    .map((quote) => Number(quote.final_price_calculated))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0] ?? null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rfq_invites, rfq_quotes, ...rfq } = row;

  return {
    rfq,
    supplierNames,
    supplierIds,
    quoteCount: quotes.length,
    bestFinalPrice,
  };
}

export async function searchRfqs(input: SearchRfqsInput = {}): Promise<{ data: RfqSearchResponse } | { error: string }> {
  await requireRole('sales');

  const pageSize = Math.min(parsePositiveInteger(input.pageSize, DEFAULT_PAGE_SIZE), 100);
  const requestedPage = parsePositiveInteger(input.page, 1);
  const q = normalizeText(input.q);
  const supplierFilter = normalizeLoose(input.supplier);
  const productTypeFilter = getString(input.productType);
  const materialFilter = normalizeText(input.material);
  const finishFilter = normalizeText(input.finish);
  const shapeFilter = normalizeText(input.shape);
  const statusFilter = getString(input.status);
  const createdFrom = getString(input.createdFrom);
  const createdTo = getString(input.createdTo);
  const lengthFilter = parseNumberFilter(input.length);
  const widthFilter = parseNumberFilter(input.width);
  const heightFilter = parseNumberFilter(input.height);
  const thicknessFilter = parseNumberFilter(input.thickness);

  try {
    const supabase = await createClient();
    let query = supabase
      .from('rfqs')
      .select(`
        *,
        rfq_invites (
          supplier_id,
          supplier:suppliers (
            id,
            name,
            email,
            materials,
            is_active,
            created_at
          )
        ),
        rfq_quotes (
          id,
          final_price_calculated
        )
      `)
      .order('created_at', { ascending: false })
      .limit(MAX_FETCH_ROWS);

    if (productTypeFilter) {
      query = query.eq('product_type', productTypeFilter);
    }
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }
    if (shapeFilter) {
      query = query.ilike('shape', `%${shapeFilter}%`);
    }
    if (createdFrom) {
      query = query.gte('created_at', `${createdFrom}T00:00:00`);
    }
    if (createdTo) {
      query = query.lte('created_at', `${createdTo}T23:59:59.999`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Failed to search RFQs:', error.message);
      return { error: 'RFQ history could not be loaded.' };
    }

    const filteredRows = ((data ?? []) as RfqSearchRow[]).filter((row) => {
      const result = rowToResult(row);
      const supplierNames = result.supplierNames;
      const supplierIds = result.supplierIds.map(normalizeLoose);
      const supplierMatches =
        !supplierFilter ||
        supplierNames.some((name) => normalizeLoose(name).includes(supplierFilter)) ||
        supplierIds.includes(supplierFilter);

      if (!supplierMatches) return false;
      if (q && !buildSearchBlob(row, supplierNames).includes(q)) return false;
      if (!materialMatches(row, materialFilter)) return false;
      if (!finishMatches(row, finishFilter)) return false;
      if (!numbersMatch(row.length, lengthFilter)) return false;
      if (!numbersMatch(row.width, widthFilter)) return false;
      if (!numbersMatch(row.height, heightFilter)) return false;
      if (!numbersMatch(row.thickness, thicknessFilter)) return false;

      return true;
    });

    const totalCount = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const currentPage = Math.min(requestedPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    const results = filteredRows.slice(start, start + pageSize).map(rowToResult);

    return {
      data: {
        results,
        totalCount,
        totalPages,
        currentPage,
        pageSize,
      },
    };
  } catch (error) {
    console.error('Failed to search RFQs:', error);
    return { error: 'RFQ history could not be loaded.' };
  }
}
