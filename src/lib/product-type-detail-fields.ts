import { isTableTopsProductType, isTablesProductType } from '@/lib/rfq-format';

export const PRODUCT_TYPE_DETAIL_FIELD_KEYS = [
  'model',
  'shape',
  'usage_environment',
  'length',
  'width',
  'diameter',
  'height',
  'thickness',
  'quantity',
  'notes',
  'attachments',
] as const;

export type ProductTypeDetailFieldKey = (typeof PRODUCT_TYPE_DETAIL_FIELD_KEYS)[number];

export interface ProductTypeDetailFieldSetting {
  key: ProductTypeDetailFieldKey;
  enabled: boolean;
  required: boolean;
}

export const PRODUCT_TYPE_DETAIL_FIELD_LABELS: Record<ProductTypeDetailFieldKey, string> = {
  model: 'Model',
  shape: 'Shape',
  usage_environment: 'Use',
  length: 'Length',
  width: 'Width',
  diameter: 'Diameter',
  height: 'Height',
  thickness: 'Thickness',
  quantity: 'Number of pieces',
  notes: 'Notes',
  attachments: 'Attachments',
};

export const PRODUCT_TYPE_DETAIL_FIELD_HELP: Record<ProductTypeDetailFieldKey, string> = {
  model: 'Shown for table-style requests by default.',
  shape: 'Controls rectangular/round/oval/square input.',
  usage_environment: 'Indoor/outdoor use. Still hidden automatically for Glass.',
  length: 'Used for non-round shapes.',
  width: 'Used for non-round shapes.',
  diameter: 'Used for round shapes.',
  height: 'Disabled by default for table tops.',
  thickness: 'Required by default except round non-table-top requests stay optional.',
  quantity: 'Number of pieces.',
  notes: 'Free-text internal/supplier notes.',
  attachments: 'SKP/PDF/JPG/PNG/DWG upload field.',
};

export function getDefaultDetailFieldSettings(productTypeName: string | null | undefined): ProductTypeDetailFieldSetting[] {
  const isTablesType = isTablesProductType(productTypeName);
  const isTableTopsType = isTableTopsProductType(productTypeName);

  return [
    { key: 'model', enabled: isTablesType, required: false },
    { key: 'shape', enabled: true, required: true },
    { key: 'usage_environment', enabled: true, required: false },
    { key: 'length', enabled: true, required: true },
    { key: 'width', enabled: true, required: true },
    { key: 'diameter', enabled: true, required: true },
    { key: 'height', enabled: !isTableTopsType, required: !isTableTopsType },
    { key: 'thickness', enabled: true, required: true },
    { key: 'quantity', enabled: true, required: true },
    { key: 'notes', enabled: true, required: false },
    { key: 'attachments', enabled: true, required: false },
  ];
}

function isDetailFieldKey(value: string): value is ProductTypeDetailFieldKey {
  return (PRODUCT_TYPE_DETAIL_FIELD_KEYS as readonly string[]).includes(value);
}

export function normalizeDetailFieldSettings(
  value: unknown,
  productTypeName: string | null | undefined
): ProductTypeDetailFieldSetting[] {
  const defaults = getDefaultDetailFieldSettings(productTypeName);
  const defaultByKey = new Map(defaults.map((setting) => [setting.key, setting]));

  if (!Array.isArray(value)) {
    return defaults;
  }

  const providedByKey = new Map<ProductTypeDetailFieldKey, ProductTypeDetailFieldSetting>();
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const raw = item as { key?: unknown; enabled?: unknown; required?: unknown; is_enabled?: unknown; is_required?: unknown };
    if (typeof raw.key !== 'string' || !isDetailFieldKey(raw.key)) {
      continue;
    }

    const fallback = defaultByKey.get(raw.key);
    providedByKey.set(raw.key, {
      key: raw.key,
      enabled: typeof raw.enabled === 'boolean'
        ? raw.enabled
        : typeof raw.is_enabled === 'boolean'
          ? raw.is_enabled
          : fallback?.enabled ?? false,
      required: typeof raw.required === 'boolean'
        ? raw.required
        : typeof raw.is_required === 'boolean'
          ? raw.is_required
          : fallback?.required ?? false,
    });
  }

  return defaults.map((fallback) => providedByKey.get(fallback.key) ?? fallback);
}

export function isDetailFieldEnabled(
  settings: ProductTypeDetailFieldSetting[],
  key: ProductTypeDetailFieldKey
): boolean {
  return settings.find((setting) => setting.key === key)?.enabled ?? false;
}

export function isDetailFieldRequired(
  settings: ProductTypeDetailFieldSetting[],
  key: ProductTypeDetailFieldKey
): boolean {
  const setting = settings.find((item) => item.key === key);
  return Boolean(setting?.enabled && setting.required);
}
