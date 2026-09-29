const DASHBOARD_QUERY_KEYS = ['search', 'product_type', 'supplier', 'status', 'page'] as const;

/**
 * Builds the "Back to requests" link from the `from` query the dashboard table
 * passes along when a request is opened, so the active filters survive the
 * round trip. Only known dashboard filter keys are kept, so the value cannot
 * be used to redirect anywhere else.
 */
export function buildDashboardBackHref(from: string | string[] | null | undefined): string {
  const raw = Array.isArray(from) ? from[0] : from;
  if (!raw) {
    return '/dashboard';
  }

  const incoming = new URLSearchParams(raw);
  const kept = new URLSearchParams();
  for (const key of DASHBOARD_QUERY_KEYS) {
    const value = incoming.get(key)?.trim();
    if (value) {
      kept.set(key, value);
    }
  }

  const query = kept.toString();
  return query ? `/dashboard?${query}` : '/dashboard';
}
