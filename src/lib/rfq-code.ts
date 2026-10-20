/**
 * Requests are shown to users as `RFQ-` + the first 8 characters of the
 * request's UUID (see the RFQ detail header). This helper turns what a user
 * types into a filter on the `id` column, without needing a separate code
 * column: a hex prefix maps onto a contiguous UUID range, so the primary-key
 * index can serve the lookup.
 */
export type RfqCodeFilter =
  | { kind: 'match'; lower: string; upper: string }
  | { kind: 'no-match' };

const CODE_PREFIX_PATTERN = /^rfq[\s-]*/i;
const FULL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CODE_PATTERN = /^[0-9a-f]{1,8}$/;

export function parseRfqCodeFilter(raw: string | null | undefined): RfqCodeFilter | null {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(CODE_PREFIX_PATTERN, '').toLowerCase();

  if (FULL_UUID_PATTERN.test(normalized)) {
    return { kind: 'match', lower: normalized, upper: normalized };
  }

  if (!CODE_PATTERN.test(normalized)) {
    return { kind: 'no-match' };
  }

  return {
    kind: 'match',
    lower: `${normalized.padEnd(8, '0')}-0000-0000-0000-000000000000`,
    upper: `${normalized.padEnd(8, 'f')}-ffff-ffff-ffff-ffffffffffff`,
  };
}
