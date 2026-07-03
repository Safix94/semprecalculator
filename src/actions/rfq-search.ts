'use server';

import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  buildRfqCandidateMatchInput,
  buildRfqMatchInput,
  hasEnoughRfqMatchInput,
  reasonForScore,
  scoreRfqMatch,
  type RfqDuplicateMatch,
  type RfqDuplicateWarning,
} from '@/lib/rfq-match';
import type { Rfq, RfqQuote, RfqSearchResponse, RfqSearchResult, Supplier } from '@/types';

const DEFAULT_PAGE_SIZE = 25;
const MAX_FETCH_ROWS = 1000;
const SIMILAR_RFQS_CANDIDATE_LIMIT = 300;
const NUMERIC_MATCH_TOLERANCE = 0.0001;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RFQ_SEARCH_SELECT = `
  *,
  rfq_invites (
    supplier_id,
    invite_part,
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
`;

export interface SearchRfqsInput {
  page?: number;
  pageSize?: number;
  q?: string | null;
  supplier?: string | null;
  productType?: string | null;
  material?: string | null;
  finish?: string | null;
  model?: string | null;
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
  invite_part: 'default' | 'table_top' | 'table_foot' | 'table_both' | null;
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

// Builds a PostgREST or() expression matching `value` as a case-insensitive
// substring in any of the given columns. Values are double-quoted so commas
// and parentheses in user input don't break the or() syntax.
function ilikeAnyFilter(columns: string[], value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return columns.map((column) => `${column}.ilike."%${escaped}%"`).join(',');
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
  const supplierMatchKeys = uniqueSorted(
    (row.rfq_invites ?? [])
      .flatMap((invite) => {
        if (!invite.supplier_id) return [];
        if (invite.invite_part === 'table_top') return [`table_top:${invite.supplier_id}`];
        if (invite.invite_part === 'table_foot') return [`table_foot:${invite.supplier_id}`];
        if (invite.invite_part === 'table_both') {
          return [`table_top:${invite.supplier_id}`, `table_foot:${invite.supplier_id}`];
        }
        return [`default:${invite.supplier_id}`];
      })
  );
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
    supplierMatchKeys,
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
  const modelFilter = normalizeText(input.model);
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

    // Free-text search matches supplier names, notes and every other field via
    // the search blob, which PostgREST can't express — keep the legacy
    // wide-fetch path for that case only.
    if (q) {
      let query = supabase
        .from('rfqs')
        .select(RFQ_SEARCH_SELECT)
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
        if (!buildSearchBlob(row, supplierNames).includes(q)) return false;
        if (!materialMatches(row, materialFilter)) return false;
        if (!finishMatches(row, finishFilter)) return false;
        if (!textIncludes(row.model, modelFilter)) return false;
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
    }

    // Supplier filter: resolve matching supplier ids, then restrict RFQs to
    // those with an invite for one of them (mirrors the dashboard pattern).
    let rfqIdFilter: string[] | null = null;
    if (supplierFilter) {
      const supplierLookup = supabase.from('suppliers').select('id');
      const { data: supplierRows, error: supplierError } = UUID_PATTERN.test(supplierFilter)
        ? await supplierLookup.eq('id', supplierFilter)
        : await supplierLookup.ilike('name', `%${supplierFilter}%`);

      if (supplierError) {
        console.error('Failed to resolve supplier filter:', supplierError.message);
        return { error: 'RFQ history could not be loaded.' };
      }

      const supplierIds = (supplierRows ?? []).map((row) => row.id);
      let rfqIds: string[] = [];
      if (supplierIds.length > 0) {
        const { data: inviteRows, error: inviteError } = await supabase
          .from('rfq_invites')
          .select('rfq_id')
          .in('supplier_id', supplierIds);

        if (inviteError) {
          console.error('Failed to resolve supplier filter invites:', inviteError.message);
          return { error: 'RFQ history could not be loaded.' };
        }

        rfqIds = [...new Set((inviteRows ?? []).map((row) => row.rfq_id).filter(Boolean))];
      }

      if (rfqIds.length === 0) {
        return {
          data: { results: [], totalCount: 0, totalPages: 1, currentPage: 1, pageSize },
        };
      }

      rfqIdFilter = rfqIds;
    }

    const buildQuery = (options?: { headCount?: boolean }) => {
      const headCount = options?.headCount ?? false;
      let query = supabase
        .from('rfqs')
        .select(headCount ? 'id' : RFQ_SEARCH_SELECT, { count: 'exact', head: headCount });

      if (!headCount) {
        query = query.order('created_at', { ascending: false });
      }
      if (productTypeFilter) {
        query = query.eq('product_type', productTypeFilter);
      }
      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }
      if (shapeFilter) {
        query = query.ilike('shape', `%${shapeFilter}%`);
      }
      if (modelFilter) {
        query = query.ilike('model', `%${modelFilter}%`);
      }
      if (materialFilter) {
        query = query.or(
          ilikeAnyFilter(['material', 'material_table_top', 'material_table_foot'], materialFilter)
        );
      }
      if (finishFilter) {
        query = query.or(
          ilikeAnyFilter(
            ['finish', 'finish_top', 'finish_edge', 'finish_color', 'finish_table_top', 'finish_table_foot'],
            finishFilter
          )
        );
      }
      if (createdFrom) {
        query = query.gte('created_at', `${createdFrom}T00:00:00`);
      }
      if (createdTo) {
        query = query.lte('created_at', `${createdTo}T23:59:59.999`);
      }
      const numericFilters: Array<[string, number | null]> = [
        ['length', lengthFilter],
        ['width', widthFilter],
        ['height', heightFilter],
        ['thickness', thicknessFilter],
      ];
      for (const [column, filterValue] of numericFilters) {
        if (filterValue !== null) {
          query = query
            .gt(column, filterValue - NUMERIC_MATCH_TOLERANCE)
            .lt(column, filterValue + NUMERIC_MATCH_TOLERANCE);
        }
      }
      if (rfqIdFilter) {
        query = query.in('id', rfqIdFilter);
      }

      return query;
    };

    const from = (requestedPage - 1) * pageSize;
    let rows: RfqSearchRow[] = [];
    let totalCount = 0;

    const firstAttempt = await buildQuery().range(from, from + pageSize - 1);

    if (firstAttempt.error && firstAttempt.error.code !== 'PGRST103') {
      console.error('Failed to search RFQs:', firstAttempt.error.message);
      return { error: 'RFQ history could not be loaded.' };
    }

    if (firstAttempt.error) {
      // Requested page is beyond the last row — count separately, clamp below.
      const headResult = await buildQuery({ headCount: true });
      if (headResult.error) {
        console.error('Failed to count RFQs:', headResult.error.message);
        return { error: 'RFQ history could not be loaded.' };
      }
      totalCount = headResult.count ?? 0;
    } else {
      totalCount = firstAttempt.count ?? 0;
      rows = (firstAttempt.data ?? []) as unknown as RfqSearchRow[];
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const currentPage = Math.min(requestedPage, totalPages);

    if (firstAttempt.error || currentPage !== requestedPage) {
      const clampedFrom = (currentPage - 1) * pageSize;
      const retry = await buildQuery().range(clampedFrom, clampedFrom + pageSize - 1);
      if (retry.error) {
        console.error('Failed to search RFQs:', retry.error.message);
        return { error: 'RFQ history could not be loaded.' };
      }
      rows = (retry.data ?? []) as unknown as RfqSearchRow[];
    }

    return {
      data: {
        results: rows.map(rowToResult),
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


export interface FindSimilarRfqsInput {
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
  excludeRfqId?: string | null;
}

export async function findSimilarRfqs(
  input: FindSimilarRfqsInput
): Promise<{ data: RfqDuplicateWarning } | { error: string }> {
  await requireRole('sales');

  const matchInput = buildRfqMatchInput(input);
  if (!hasEnoughRfqMatchInput(matchInput)) {
    return { data: { exact: [], similar: [] } };
  }

  try {
    // One bounded query for candidates; the scoring below narrows further.
    const supabase = await createClient();
    const productTypeFilter = getString(input.product_type);
    const materialFilter = normalizeText(matchInput.materials[0] ?? null);

    let query = supabase
      .from('rfqs')
      .select(RFQ_SEARCH_SELECT)
      .order('created_at', { ascending: false })
      .limit(SIMILAR_RFQS_CANDIDATE_LIMIT);

    if (productTypeFilter) {
      query = query.eq('product_type', productTypeFilter);
    }
    if (materialFilter) {
      query = query.or(
        ilikeAnyFilter(['material', 'material_table_top', 'material_table_foot'], materialFilter)
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('Failed to find similar RFQs:', error.message);
      return { error: 'Duplicate check could not be completed.' };
    }

    const allResults = ((data ?? []) as unknown as RfqSearchRow[]).map(rowToResult);

    const exact: RfqDuplicateMatch[] = [];
    const similar: RfqDuplicateMatch[] = [];

    for (const result of allResults) {
      if (input.excludeRfqId && result.rfq.id === input.excludeRfqId) {
        continue;
      }

      const candidateInput = buildRfqCandidateMatchInput(result.rfq, result.supplierMatchKeys);
      const score = scoreRfqMatch(candidateInput, matchInput);
      if (!score) {
        continue;
      }

      const match: RfqDuplicateMatch = {
        ...result,
        matchScore: score,
        reason: reasonForScore(score),
      };

      if (score === 'exact') {
        exact.push(match);
      } else {
        similar.push(match);
      }
    }

    return {
      data: {
        exact: exact.slice(0, 5),
        similar: similar.slice(0, 5),
      },
    };
  } catch (error) {
    console.error('Failed to find similar RFQs:', error);
    return { error: 'Duplicate check could not be completed.' };
  }
}
