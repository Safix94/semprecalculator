import { describe, expect, it } from 'vitest';
import { normalizeDetailFieldSettings } from '@/lib/product-type-detail-fields';

describe('normalizeDetailFieldSettings', () => {
  it('preserves saved show and required settings instead of falling back to defaults', () => {
    const settings = normalizeDetailFieldSettings([
      { key: 'shape', enabled: false, required: false },
      { key: 'length', enabled: true, required: false },
      { key: 'width', enabled: true, required: true },
      { key: 'thickness', enabled: false, required: false },
    ], 'Tables');

    expect(settings.find((setting) => setting.key === 'shape')).toMatchObject({
      enabled: false,
      required: false,
    });
    expect(settings.find((setting) => setting.key === 'length')).toMatchObject({
      enabled: true,
      required: false,
    });
    expect(settings.find((setting) => setting.key === 'width')).toMatchObject({
      enabled: true,
      required: true,
    });
    expect(settings.find((setting) => setting.key === 'thickness')).toMatchObject({
      enabled: false,
      required: false,
    });
  });

  it('normalizes legacy is_enabled and is_required keys', () => {
    const settings = normalizeDetailFieldSettings([
      { key: 'notes', is_enabled: false, is_required: false },
      { key: 'attachments', is_enabled: true, is_required: true },
    ], 'Tables');

    expect(settings.find((setting) => setting.key === 'notes')).toMatchObject({
      enabled: false,
      required: false,
    });
    expect(settings.find((setting) => setting.key === 'attachments')).toMatchObject({
      enabled: true,
      required: true,
    });
  });
});
