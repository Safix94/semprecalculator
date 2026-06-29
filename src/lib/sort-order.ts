export const SORT_ORDER_STEP = 10;

export function buildSortOrderUpdates(ids: string[], step = SORT_ORDER_STEP) {
  const normalizedIds = ids.map((id) => id.trim()).filter(Boolean);
  const uniqueIds = new Set(normalizedIds);

  if (uniqueIds.size !== normalizedIds.length) {
    throw new Error('Duplicate IDs are not allowed when reordering.');
  }

  return normalizedIds.map((id, index) => ({
    id,
    sort_order: (index + 1) * step,
  }));
}
