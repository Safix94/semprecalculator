import { describe, expect, it } from 'vitest';
import { parseRfqCodeFilter } from '@/lib/rfq-code';

describe('parseRfqCodeFilter', () => {
  it('returns null when no code was entered', () => {
    expect(parseRfqCodeFilter(null)).toBeNull();
    expect(parseRfqCodeFilter(undefined)).toBeNull();
    expect(parseRfqCodeFilter('')).toBeNull();
    expect(parseRfqCodeFilter('   ')).toBeNull();
  });

  it('turns the displayed RFQ code into the id range it covers', () => {
    expect(parseRfqCodeFilter('RFQ-1a2b3c4d')).toEqual({
      kind: 'match',
      lower: '1a2b3c4d-0000-0000-0000-000000000000',
      upper: '1a2b3c4d-ffff-ffff-ffff-ffffffffffff',
    });
  });

  it('ignores case, surrounding whitespace and a missing prefix', () => {
    expect(parseRfqCodeFilter('  1A2B3C4D ')).toEqual({
      kind: 'match',
      lower: '1a2b3c4d-0000-0000-0000-000000000000',
      upper: '1a2b3c4d-ffff-ffff-ffff-ffffffffffff',
    });
    expect(parseRfqCodeFilter('rfq 1a2b3c4d')).toEqual(parseRfqCodeFilter('RFQ-1a2b3c4d'));
  });

  it('matches every id that starts with a partial code', () => {
    expect(parseRfqCodeFilter('RFQ-1a2b')).toEqual({
      kind: 'match',
      lower: '1a2b0000-0000-0000-0000-000000000000',
      upper: '1a2bffff-ffff-ffff-ffff-ffffffffffff',
    });
  });

  it('matches exactly one request when a full id is pasted', () => {
    expect(parseRfqCodeFilter('1A2B3C4D-1111-2222-3333-444455556666')).toEqual({
      kind: 'match',
      lower: '1a2b3c4d-1111-2222-3333-444455556666',
      upper: '1a2b3c4d-1111-2222-3333-444455556666',
    });
  });

  it('reports that nothing can match when the input is not a code', () => {
    expect(parseRfqCodeFilter('Oak table')).toEqual({ kind: 'no-match' });
    expect(parseRfqCodeFilter('RFQ-1a2b3c4d9')).toEqual({ kind: 'no-match' });
    expect(parseRfqCodeFilter('RFQ-')).toEqual({ kind: 'no-match' });
  });
});
