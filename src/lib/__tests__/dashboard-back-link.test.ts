import { describe, expect, it } from 'vitest';
import { buildDashboardBackHref } from '@/lib/dashboard-back-link';

describe('buildDashboardBackHref', () => {
  it('returns the plain dashboard without a remembered query', () => {
    expect(buildDashboardBackHref(undefined)).toBe('/dashboard');
    expect(buildDashboardBackHref('')).toBe('/dashboard');
  });

  it('restores the dashboard filters', () => {
    expect(buildDashboardBackHref('status=sent_to_supplier&page=2')).toBe('/dashboard?status=sent_to_supplier&page=2');
  });

  it('accepts the first value when the param is repeated', () => {
    expect(buildDashboardBackHref(['status=draft', 'status=closed'])).toBe('/dashboard?status=draft');
  });

  it('drops unknown keys and the selected-rfq key', () => {
    expect(buildDashboardBackHref('status=draft&rfq=abc&redirect=https://evil.example')).toBe('/dashboard?status=draft');
  });

  it('keeps a search term with special characters encoded', () => {
    expect(buildDashboardBackHref('search=oak%20%26%20stone')).toBe('/dashboard?search=oak+%26+stone');
  });
});
