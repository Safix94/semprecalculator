export type QuotePriceCurrency = 'EUR' | 'IDR';

export const IDR_PER_EUR_RATE = 20361.16;
export const IDR_RATE_SOURCE = 'ECB daily reference rate, 2026-06-29';

export interface SupplierBasePriceConversion {
  basePriceEur: number;
  supplierInputPrice: number;
  supplierInputCurrency: QuotePriceCurrency;
  supplierInputExchangeRateIdrPerEur: number | null;
  supplierInputConvertedAt: string | null;
}

export function normalizeQuotePriceCurrency(value: unknown): QuotePriceCurrency {
  return value === 'IDR' ? 'IDR' : 'EUR';
}

export function formatIdrAmount(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return '-';
  }

  return `Rp ${Number(value).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
}

export function convertSupplierBasePriceToEur(
  amount: number,
  currency: QuotePriceCurrency
): SupplierBasePriceConversion {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Supplier base price must be positive.');
  }

  if (currency === 'IDR') {
    return {
      basePriceEur: Math.round((amount / IDR_PER_EUR_RATE) * 100) / 100,
      supplierInputPrice: amount,
      supplierInputCurrency: 'IDR',
      supplierInputExchangeRateIdrPerEur: IDR_PER_EUR_RATE,
      supplierInputConvertedAt: new Date().toISOString(),
    };
  }

  return {
    basePriceEur: Math.round(amount * 100) / 100,
    supplierInputPrice: amount,
    supplierInputCurrency: 'EUR',
    supplierInputExchangeRateIdrPerEur: null,
    supplierInputConvertedAt: null,
  };
}
