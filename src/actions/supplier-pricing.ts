'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { DEFAULT_PRICING_SETTINGS, type SupplierPricingProfile } from '@/lib/pricing';

interface SupplierPricingProfileRow {
  id: string;
  supplier_id: string;
  transport_mode: 'none' | 'container' | 'truck';
  formula_version: string;
  container_price_eur: number | string | null;
  container_volume_m3: number | string | null;
  product_margin_factor: number | string;
  retail_multiplier_factor: number | string;
  truck_multiplier_factor: number | string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return typeof value === 'number' ? value : Number(value);
}

function mapSupplierPricingProfile(
  row: SupplierPricingProfileRow | null,
  supplierId?: string
): SupplierPricingProfile {
  if (!row) {
    return {
      supplierId: supplierId ?? '',
      transportMode: 'container',
      formulaVersion: 'supplier_transport_v1',
      containerPriceEur: DEFAULT_PRICING_SETTINGS.containerPriceEur,
      containerVolumeM3: DEFAULT_PRICING_SETTINGS.containerVolumeM3,
      productMarginFactor: DEFAULT_PRICING_SETTINGS.productMarginFactor,
      retailMultiplierFactor: DEFAULT_PRICING_SETTINGS.shippingMarginFactor,
      truckMultiplierFactor: null,
    };
  }

  return {
    supplierId: row.supplier_id,
    transportMode: row.transport_mode,
    formulaVersion: row.formula_version,
    containerPriceEur: normalizeNullableNumber(row.container_price_eur),
    containerVolumeM3: normalizeNullableNumber(row.container_volume_m3),
    productMarginFactor: Number(row.product_margin_factor),
    retailMultiplierFactor: Number(row.retail_multiplier_factor),
    truckMultiplierFactor: normalizeNullableNumber(row.truck_multiplier_factor),
  };
}

async function getGlobalPricingFallback(supplierId: string): Promise<SupplierPricingProfile> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('pricing_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error('Failed to fetch global pricing fallback:', error.message);
    }
    return mapSupplierPricingProfile(null, supplierId);
  }

  return {
    supplierId,
    transportMode: 'container',
    formulaVersion: 'supplier_transport_v1',
    containerPriceEur: Number(data.container_price_eur),
    containerVolumeM3: Number(data.container_volume_m3),
    productMarginFactor: Number(data.product_margin_factor),
    retailMultiplierFactor: Number(data.shipping_margin_factor),
    truckMultiplierFactor: null,
  };
}

/**
 * Supplier quote submissions run without an authenticated user, so this uses service role.
 */
export async function getEffectiveSupplierPricingProfile(supplierId: string): Promise<SupplierPricingProfile> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('supplier_pricing_profiles')
    .select('*')
    .eq('supplier_id', supplierId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch supplier pricing profile; falling back to global settings:', error.message);
    return getGlobalPricingFallback(supplierId);
  }

  if (!data) {
    return getGlobalPricingFallback(supplierId);
  }

  return mapSupplierPricingProfile(data as SupplierPricingProfileRow, supplierId);
}
