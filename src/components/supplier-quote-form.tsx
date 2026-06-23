'use client';

import { useState } from 'react';
import { submitQuote } from '@/actions/quote';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getSupplierTranslations, normalizeSupplierLanguage } from '@/lib/supplier-language';
import type { SupplierLanguage } from '@/types';

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
}

export function SupplierQuoteForm({
  rfqId,
  token,
  initialValues = null,
  isUpdate = false,
  language,
}: SupplierQuoteFormProps) {
  const t = getSupplierTranslations(normalizeSupplierLanguage(language));
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]> | string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrors(null);

    const form = new FormData(e.currentTarget);
    const input = {
      basePrice: Number(form.get('basePrice')),
      volumeM3: Number(form.get('volumeM3')),
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
          <div className="text-chart-2 text-4xl mb-4">✓</div>
          <h2 className="text-lg font-semibold text-chart-2 mb-2">
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
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="basePrice">{t.basePriceEur}</Label>
              <Input
                id="basePrice"
                name="basePrice"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                defaultValue={initialValues?.basePrice ?? ''}
                aria-invalid={Boolean(typeof errors === 'object' && errors?.basePrice)}
              />
              {typeof errors === 'object' && errors?.basePrice && (
                <p className="text-destructive text-xs">{errors.basePrice[0]}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="volumeM3">{t.volumeM3Required}</Label>
              <Input
                id="volumeM3"
                name="volumeM3"
                type="number"
                step="0.001"
                min="0.001"
                required
                placeholder="0.000"
                defaultValue={initialValues?.volumeM3 ?? ''}
                aria-invalid={Boolean(typeof errors === 'object' && errors?.volumeM3)}
              />
              {typeof errors === 'object' && errors?.volumeM3 && (
                <p className="text-destructive text-xs">{errors.volumeM3[0]}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leadTimeDays">{t.leadTimeOptional}</Label>
            <Input
              id="leadTimeDays"
              name="leadTimeDays"
              type="number"
              min="1"
              defaultValue={initialValues?.leadTimeDays ?? ''}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comment">{t.commentOptional}</Label>
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

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t.submitting : isUpdate ? t.updateQuote : t.submitQuote}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
