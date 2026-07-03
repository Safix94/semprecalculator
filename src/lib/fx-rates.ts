import 'server-only';

import { unstable_cache } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { DEFAULT_FX_RATES, type FxRates } from '@/lib/currency';

export const FX_RATES_CACHE_TAG = 'fx-rates';

/**
 * Admin-configured FX rates from pricing_settings, cached across requests.
 * Falls back to the pinned defaults when the row/columns are unreadable so a
 * DB blip never breaks supplier quote conversion.
 */
export const getFxRates = unstable_cache(
  async (): Promise<FxRates> => {
    try {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase
        .from('pricing_settings')
        .select('usd_per_eur_rate, idr_per_eur_rate')
        .eq('id', 1)
        .maybeSingle();

      if (error || !data) {
        if (error) {
          console.error('Failed to load FX rates; falling back to defaults:', error.message);
        }
        return DEFAULT_FX_RATES;
      }

      const usdPerEur = Number(data.usd_per_eur_rate);
      const idrPerEur = Number(data.idr_per_eur_rate);

      return {
        usdPerEur: Number.isFinite(usdPerEur) && usdPerEur > 0 ? usdPerEur : DEFAULT_FX_RATES.usdPerEur,
        idrPerEur: Number.isFinite(idrPerEur) && idrPerEur > 0 ? idrPerEur : DEFAULT_FX_RATES.idrPerEur,
      };
    } catch (error) {
      console.error('Failed to load FX rates; falling back to defaults:', error);
      return DEFAULT_FX_RATES;
    }
  },
  ['fx-rates'],
  { revalidate: 300, tags: [FX_RATES_CACHE_TAG] }
);
