import { describe, expect, it } from 'vitest';
import { getGeneralFinishOptions } from '@/lib/material-finishes';

describe('getGeneralFinishOptions', () => {
  it('returns the general finish options when the material has them', () => {
    expect(
      getGeneralFinishOptions({
        finish_options: ['Natural', 'Fumé', 'Natural weathered', 'Coco brown'],
        finish_options_color: ['Natural', 'Fumé'],
      })
    ).toEqual(['Natural', 'Fumé', 'Natural weathered', 'Coco brown']);
  });

  it('falls back to the colour finish options when no general finishes are set', () => {
    expect(
      getGeneralFinishOptions({
        finish_options: [],
        finish_options_color: ['Fumé', 'Original', 'Natural weathered', 'Coco brown', 'Regular'],
      })
    ).toEqual(['Fumé', 'Original', 'Natural weathered', 'Coco brown', 'Regular']);
  });

  it('returns an empty list when neither general nor colour finishes are set', () => {
    expect(getGeneralFinishOptions({ finish_options: [], finish_options_color: [] })).toEqual([]);
  });

  it('trims entries and drops blank ones', () => {
    expect(getGeneralFinishOptions({ finish_options: [' Sayerlack ', '', '  '] })).toEqual(['Sayerlack']);
    expect(getGeneralFinishOptions({ finish_options: ['  '], finish_options_color: [' Fumé'] })).toEqual(['Fumé']);
  });

  it('returns an empty list for a missing material', () => {
    expect(getGeneralFinishOptions(null)).toEqual([]);
    expect(getGeneralFinishOptions(undefined)).toEqual([]);
  });
});
