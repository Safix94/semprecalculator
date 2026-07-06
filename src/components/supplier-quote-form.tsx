'use client';

import { useMemo, useState } from 'react';
import { submitQuote } from '@/actions/quote';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getSupplierTranslations, normalizeSupplierLanguage } from '@/lib/supplier-language';
import { IDR_PER_EUR_RATE, USD_PER_EUR_RATE } from '@/lib/currency';
import { calculateVolumeM3FromCm } from '@/lib/pricing';
import type { QuotePriceCurrency, SupplierLanguage } from '@/types';

interface SupplierQuoteFormProps {
  rfqId: string;
  token: string;
  initialValues?: {
    basePrice: number;
    volumeM3: number;
    leadTimeDays: number | null;
    comment: string | null;
  } | null;
  isUpdate?: boolean;
  language: SupplierLanguage;
  quotePriceCurrency: QuotePriceCurrency;
  /** Current admin-configured rates; fall back to the pinned defaults. */
  usdPerEurRate?: number;
  idrPerEurRate?: number;
}

function parseDimension(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatVolume(value: number) {
  return value.toLocaleString('nl-BE', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 6,
  });
}

export function SupplierQuoteForm({
  rfqId,
  token,
  initialValues = null,
  isUpdate = false,
  language,
  quotePriceCurrency,
  usdPerEurRate = USD_PER_EUR_RATE,
  idrPerEurRate = IDR_PER_EUR_RATE,
}: SupplierQuoteFormProps) {
  const t = getSupplierTranslations(normalizeSupplierLanguage(language));
  const idrRateLabel = idrPerEurRate.toLocaleString('nl-BE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const usdRateLabel = usdPerEurRate.toLocaleString('nl-BE', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
  const basePriceLabel = quotePriceCurrency === 'IDR'
    ? t.basePriceIdr
    : quotePriceCurrency === 'USD'
      ? t.basePriceUsd
      : t.basePriceEur;
  const basePriceStep = quotePriceCurrency === 'IDR' ? '1' : '0.01';
  const basePricePlaceholder = quotePriceCurrency === 'IDR'
    ? '1000000'
    : quotePriceCurrency === 'USD'
      ? '100.00'
      : '0.00';
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]> | string | null>(null);
  const [success, setSuccess] = useState(false);
  const [lengthCm, setLengthCm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');

  const calculatedVolumeM3 = useMemo(() => {
    const length = parseDimension(lengthCm);
    const width = parseDimension(widthCm);
    const height = parseDimension(heightCm);

    if (length === null || width === null || height === null) return null;
    return calculateVolumeM3FromCm(length, width, height);
  }, [heightCm, lengthCm, widthCm]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrors(null);

    const form = new FormData(e.currentTarget);
    const input = {
      basePrice: Number(form.get('basePrice')),
      lengthCm: Number(form.get('lengthCm')),
      widthCm: Number(form.get('widthCm')),
      heightCm: Number(form.get('heightCm')),
      leadTimeDays: form.get('leadTimeDays') ? Number(form.get('leadTimeDays')) : null,
      comment: (form.get('comment') as string) || null,
    };

    const result = await submitQuote(rfqId, token, input);

    if (result.error) {
      setErrors(result.error);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <Card className="border-chart-2/50">
        <CardContent className="py-8 text-center">
          <div className="text-chart-2 mb-4 text-4xl">✓</div>
          <h2 className="text-chart-2 mb-2 text-lg font-semibold">
            {isUpdate ? t.quoteUpdated : t.quoteSubmitted}
          </h2>
          <p className="text-muted-foreground">
            {isUpdate
              ? t.quoteUpdatedThanks
              : t.quoteSubmittedThanks}
          </p>
        </CardContent>
      </Card>
    );
  }

  const errorMessage =
    typeof errors === 'string'
      ? errors
      : errors && '_form' in errors
        ? errors._form?.[0]
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isUpdate ? t.updateQuote : t.submitQuote}</CardTitle>
        <p className="text-sm text-muted-foreground">{t.dimensionsHelp}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="basePrice" className="sempre-label">{basePriceLabel}</Label>
              <Input
                id="basePrice"
                name="basePrice"
                type="number"
                step={basePriceStep}
                min="0.01"
                required
                placeholder={basePricePlaceholder}
                defaultValue={initialValues?.basePrice ?? ''}
                aria-invalid={Boolean(typeof errors === 'object' && errors?.basePrice)}
              />
              {quotePriceCurrency === 'IDR' && (
                <p className="text-xs text-muted-foreground">
                  {t.basePriceIdrHelp} 1 EUR = {idrRateLabel} IDR.
                </p>
              )}
              {quotePriceCurrency === 'USD' && (
                <p className="text-xs text-muted-foreground">
                  {t.basePriceUsdHelp} 1 EUR = {usdRateLabel} USD.
                </p>
              )}
              {typeof errors === 'object' && errors?.basePrice && (
                <p className="text-destructive text-xs">{errors.basePrice[0]}</p>
              )}
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="sempre-label">{t.calculatedVolumeM3}</div>
              <div className="mt-1 text-xl font-bold tracking-[-0.01em]">
                {calculatedVolumeM3 === null ? '—' : `${formatVolume(calculatedVolumeM3)} m³`}
              </div>
              {initialValues?.volumeM3 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.yourSubmittedQuote}: {formatVolume(initialValues.volumeM3)} m³
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="lengthCm" className="sempre-label">{t.lengthCmRequired}</Label>
              <Input
                id="lengthCm"
                name="lengthCm"
                type="number"
                step="0.1"
                min="0.1"
                required
                value={lengthCm}
                onChange={(event) => setLengthCm(event.target.value)}
                aria-invalid={Boolean(typeof errors === 'object' && errors?.lengthCm)}
              />
              {typeof errors === 'object' && errors?.lengthCm && (
                <p className="text-destructive text-xs">{errors.lengthCm[0]}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="widthCm" className="sempre-label">{t.widthCmRequired}</Label>
              <Input
                id="widthCm"
                name="widthCm"
                type="number"
                step="0.1"
                min="0.1"
                required
                value={widthCm}
                onChange={(event) => setWidthCm(event.target.value)}
                aria-invalid={Boolean(typeof errors === 'object' && errors?.widthCm)}
              />
              {typeof errors === 'object' && errors?.widthCm && (
                <p className="text-destructive text-xs">{errors.widthCm[0]}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="heightCm" className="sempre-label">{t.heightCmRequired}</Label>
              <Input
                id="heightCm"
                name="heightCm"
                type="number"
                step="0.1"
                min="0.1"
                required
                value={heightCm}
                onChange={(event) => setHeightCm(event.target.value)}
                aria-invalid={Boolean(typeof errors === 'object' && errors?.heightCm)}
              />
              {typeof errors === 'object' && errors?.heightCm && (
                <p className="text-destructive text-xs">{errors.heightCm[0]}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leadTimeDays" className="sempre-label">{t.leadTimeOptional}</Label>
            <Input
              id="leadTimeDays"
              name="leadTimeDays"
              type="number"
              min="1"
              defaultValue={initialValues?.leadTimeDays ?? ''}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comment" className="sempre-label">{t.commentOptional}</Label>
            <Textarea
              id="comment"
              name="comment"
              rows={3}
              maxLength={2000}
              defaultValue={initialValues?.comment ?? ''}
            />
          </div>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between gap-4 border-t pt-4">
            <span className="text-xs text-muted-foreground">{t.calculatedVolumeM3}: {calculatedVolumeM3 === null ? '—' : `${formatVolume(calculatedVolumeM3)} m³`}</span>
            <Button type="submit" disabled={loading} className="min-w-[180px]">
              {loading ? t.submitting : isUpdate ? t.updateQuote : t.submitQuote}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
