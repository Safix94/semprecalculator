import { describe, expect, it } from 'vitest';
import {
  convertSupplierBasePriceToEur,
  formatSupplierInputAmount,
  IDR_PER_EUR_RATE,
  normalizeQuotePriceCurrency,
  USD_PER_EUR_RATE,
} from '@/lib/currency';

describe('normalizeQuotePriceCurrency', () => {
  it('accepts USD and IDR, defaults everything else to EUR', () => {
    expect(normalizeQuotePriceCurrency('USD')).toBe('USD');
    expect(normalizeQuotePriceCurrency('IDR')).toBe('IDR');
    expect(normalizeQuotePriceCurrency('EUR')).toBe('EUR');
    expect(normalizeQuotePriceCurrency('GBP')).toBe('EUR');
    expect(normalizeQuotePriceCurrency(null)).toBe('EUR');
    expect(normalizeQuotePriceCurrency(undefined)).toBe('EUR');
  });
});

describe('convertSupplierBasePriceToEur', () => {
  it('passes EUR through with 2-decimal rounding and no rate snapshot', () => {
    const result = convertSupplierBasePriceToEur(123.456, 'EUR');

    expect(result.basePriceEur).toBe(123.46);
    expect(result.supplierInputCurrency).toBe('EUR');
    expect(result.supplierInputExchangeRatePerEur).toBeNull();
    expect(result.supplierInputConvertedAt).toBeNull();
  });

  it('converts USD using the pinned rate', () => {
    const result = convertSupplierBasePriceToEur(USD_PER_EUR_RATE * 100, 'USD');

    expect(result.basePriceEur).toBe(100);
    expect(result.supplierInputCurrency).toBe('USD');
    expect(result.supplierInputExchangeRatePerEur).toBe(USD_PER_EUR_RATE);
    expect(result.supplierInputExchangeRateIdrPerEur).toBeNull();
    expect(result.supplierInputConvertedAt).not.toBeNull();
  });

  it('converts IDR using the pinned rate and snapshots the legacy IDR column', () => {
    const result = convertSupplierBasePriceToEur(IDR_PER_EUR_RATE, 'IDR');

    expect(result.basePriceEur).toBe(1);
    expect(result.supplierInputExchangeRateIdrPerEur).toBe(IDR_PER_EUR_RATE);
  });

  it('rejects non-positive and non-finite amounts', () => {
    expect(() => convertSupplierBasePriceToEur(0, 'EUR')).toThrow();
    expect(() => convertSupplierBasePriceToEur(-10, 'USD')).toThrow();
    expect(() => convertSupplierBasePriceToEur(Number.NaN, 'IDR')).toThrow();
  });
});

describe('formatSupplierInputAmount', () => {
  it('formats EUR with two decimals', () => {
    expect(formatSupplierInputAmount(12.5, 'EUR')).toBe('€12.50');
    expect(formatSupplierInputAmount(12.5, null)).toBe('€12.50');
  });

  it('formats USD and IDR with their currency markers', () => {
    expect(formatSupplierInputAmount(1234.5, 'USD')).toContain('$');
    expect(formatSupplierInputAmount(20361, 'IDR')).toContain('Rp');
  });

  it('renders a dash for missing values', () => {
    expect(formatSupplierInputAmount(null, 'EUR')).toBe('-');
    expect(formatSupplierInputAmount(undefined, 'USD')).toBe('-');
  });
});
