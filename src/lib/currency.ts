export type QuotePriceCurrency = 'EUR' | 'USD' | 'IDR';

// Fallback rates, used when pricing_settings can't be read. The live values
// are admin-configurable in Management → Pricing (see src/lib/fx-rates.ts).
export const USD_PER_EUR_RATE = 1.1401;
export const IDR_PER_EUR_RATE = 20361.16;
export const FX_RATE_SOURCE = 'ECB daily reference rate, 2026-06-29';
export const IDR_RATE_SOURCE = FX_RATE_SOURCE;

export interface FxRates {
  /** Units of USD per 1 EUR. */
  usdPerEur: number;
  /** Units of IDR per 1 EUR. */
  idrPerEur: number;
}

export const DEFAULT_FX_RATES: FxRates = {
  usdPerEur: USD_PER_EUR_RATE,
  idrPerEur: IDR_PER_EUR_RATE,
};

export interface SupplierBasePriceConversion {
  basePriceEur: number;
  supplierInputPrice: number;
  supplierInputCurrency: QuotePriceCurrency;
  /** Units of supplier input currency per 1 EUR. */
  supplierInputExchangeRatePerEur: number | null;
  /** Legacy IDR-specific snapshot column kept for backwards compatibility. */
  supplierInputExchangeRateIdrPerEur: number | null;
  supplierInputConvertedAt: string | null;
}

export const QUOTE_PRICE_CURRENCY_LABELS: Record<QuotePriceCurrency, string> = {
  EUR: 'Euro (EUR)',
  USD: 'US dollar (USD)',
  IDR: 'Indonesische rupiah (IDR / Rp)',
};

export function normalizeQuotePriceCurrency(value: unknown): QuotePriceCurrency {
  if (value === 'USD' || value === 'IDR') {
    return value;
  }

  return 'EUR';
}

export function getSupplierInputCurrencyPerEur(
  currency: QuotePriceCurrency,
  rates: FxRates = DEFAULT_FX_RATES
): number | null {
  if (currency === 'USD') {
    return rates.usdPerEur;
  }

  if (currency === 'IDR') {
    return rates.idrPerEur;
  }

  return null;
}

export function formatUsdAmount(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return '-';
  }

  return `$${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatIdrAmount(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return '-';
  }

  return `Rp ${Number(value).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
}

export function formatSupplierInputAmount(
  value: number | string | null | undefined,
  currency: QuotePriceCurrency | null | undefined
): string {
  if (currency === 'IDR') {
    return formatIdrAmount(value);
  }

  if (currency === 'USD') {
    return formatUsdAmount(value);
  }

  if (value === null || value === undefined) {
    return '-';
  }

  return `€${Number(value).toFixed(2)}`;
}

export function convertSupplierBasePriceToEur(
  amount: number,
  currency: QuotePriceCurrency,
  rates: FxRates = DEFAULT_FX_RATES
): SupplierBasePriceConversion {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Supplier base price must be positive.');
  }

  const rate = getSupplierInputCurrencyPerEur(currency, rates);
  if (rate) {
    return {
      basePriceEur: Math.round((amount / rate) * 100) / 100,
      supplierInputPrice: amount,
      supplierInputCurrency: currency,
      supplierInputExchangeRatePerEur: rate,
      supplierInputExchangeRateIdrPerEur: currency === 'IDR' ? rate : null,
      supplierInputConvertedAt: new Date().toISOString(),
    };
  }

  return {
    basePriceEur: Math.round(amount * 100) / 100,
    supplierInputPrice: amount,
    supplierInputCurrency: 'EUR',
    supplierInputExchangeRatePerEur: null,
    supplierInputExchangeRateIdrPerEur: null,
    supplierInputConvertedAt: null,
  };
}
