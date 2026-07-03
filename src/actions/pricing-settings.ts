'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { DEFAULT_FX_RATES } from '@/lib/currency';
import { FX_RATES_CACHE_TAG } from '@/lib/fx-rates';
import { DEFAULT_PRICING_SETTINGS, type PricingSettings } from '@/lib/pricing';
import { logAuditEvent } from './audit';

interface PricingSettingsRow {
  id: number;
  container_price_eur: number | string;
  container_volume_m3: number | string;
  product_margin_factor: number | string;
  shipping_margin_factor: number | string;
  usd_per_eur_rate?: number | string | null;
  idr_per_eur_rate?: number | string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PricingSettingsWithMeta extends PricingSettings {
  usdPerEurRate: number;
  idrPerEurRate: number;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface UpdatePricingSettingsInput {
  containerPriceEur: number;
  containerVolumeM3: number;
  productMarginFactor: number;
  shippingMarginFactor: number;
  usdPerEurRate: number;
  idrPerEurRate: number;
}

function normalizeNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

function normalizeRate(value: number | string | null | undefined, fallback: number): number {
  const parsed = normalizeNumber((value ?? Number.NaN) as number | string);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function mapPricingSettings(row: PricingSettingsRow | null): PricingSettingsWithMeta {
  if (!row) {
    return {
      ...DEFAULT_PRICING_SETTINGS,
      usdPerEurRate: DEFAULT_FX_RATES.usdPerEur,
      idrPerEurRate: DEFAULT_FX_RATES.idrPerEur,
      updatedBy: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  return {
    containerPriceEur: normalizeNumber(row.container_price_eur),
    containerVolumeM3: normalizeNumber(row.container_volume_m3),
    productMarginFactor: normalizeNumber(row.product_margin_factor),
    shippingMarginFactor: normalizeNumber(row.shipping_margin_factor),
    usdPerEurRate: normalizeRate(row.usd_per_eur_rate, DEFAULT_FX_RATES.usdPerEur),
    idrPerEurRate: normalizeRate(row.idr_per_eur_rate, DEFAULT_FX_RATES.idrPerEur),
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validatePricingSettings(input: UpdatePricingSettingsInput): string | null {
  const entries: Array<[keyof UpdatePricingSettingsInput, string]> = [
    ['containerPriceEur', 'Container price'],
    ['containerVolumeM3', 'Container volume'],
    ['productMarginFactor', 'Product margin'],
    ['shippingMarginFactor', 'Multiplier'],
    ['usdPerEurRate', 'USD per EUR rate'],
    ['idrPerEurRate', 'IDR per EUR rate'],
  ];

  for (const [key, label] of entries) {
    const value = input[key];
    if (!Number.isFinite(value) || value <= 0) {
      return `${label} must be a positive number.`;
    }
  }

  return null;
}

export async function getPricingSettings(): Promise<PricingSettingsWithMeta> {
  await requireRole('sales');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('pricing_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch pricing settings:', error.message);
    return mapPricingSettings(null);
  }

  return mapPricingSettings(data as PricingSettingsRow | null);
}

export async function updatePricingSettings(input: UpdatePricingSettingsInput) {
  const user = await requireRole('sales');
  const validationError = validatePricingSettings(input);
  if (validationError) {
    return { error: { _form: [validationError] } };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('pricing_settings')
    .upsert(
      {
        id: 1,
        container_price_eur: input.containerPriceEur,
        container_volume_m3: input.containerVolumeM3,
        product_margin_factor: input.productMarginFactor,
        shipping_margin_factor: input.shippingMarginFactor,
        usd_per_eur_rate: input.usdPerEurRate,
        idr_per_eur_rate: input.idrPerEurRate,
        updated_by: user.id,
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single();

  if (error || !data) {
    return { error: { _form: [error?.message ?? 'Pricing settings could not be saved.'] } };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'PRICING_SETTINGS_UPDATED',
    entityType: 'pricing_settings',
    entityId: '1',
    metadata: {
      containerPriceEur: input.containerPriceEur,
      containerVolumeM3: input.containerVolumeM3,
      productMarginFactor: input.productMarginFactor,
      shippingMarginFactor: input.shippingMarginFactor,
      usdPerEurRate: input.usdPerEurRate,
      idrPerEurRate: input.idrPerEurRate,
    },
  });

  revalidatePath('/admin/management');
  updateTag(FX_RATES_CACHE_TAG);
  return { data: mapPricingSettings(data as PricingSettingsRow) };
}
