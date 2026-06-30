'use client';

import { useState } from 'react';
import { submitAutomaticSanneVosQuote } from '@/actions/quote';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getSupplierTranslations, normalizeSupplierLanguage } from '@/lib/supplier-language';
import type { SupplierLanguage } from '@/types';

interface SupplierAutomaticQuoteFormProps {
  rfqId: string;
  token: string;
  initialValues?: {
    leadTimeDays: number | null;
    comment: string | null;
  } | null;
  isUpdate?: boolean;
  language: SupplierLanguage;
}

export function SupplierAutomaticQuoteForm({
  rfqId,
  token,
  initialValues = null,
  isUpdate = false,
  language,
}: SupplierAutomaticQuoteFormProps) {
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
      leadTimeDays: form.get('leadTimeDays') ? Number(form.get('leadTimeDays')) : null,
      comment: (form.get('comment') as string) || null,
    };

    const result = await submitAutomaticSanneVosQuote(rfqId, token, input);

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
            {isUpdate ? t.quoteUpdatedThanks : t.quoteSubmittedThanks}
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
        <p className="text-sm text-muted-foreground">
          Sempre will calculate this Bluestone quote automatically. You only need to add lead time or a comment if relevant.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Alert>
            <AlertDescription>
              No base price or volume is required for this request.
            </AlertDescription>
          </Alert>

          <div className="space-y-1.5">
            <Label htmlFor="leadTimeDays">{t.leadTimeOptional}</Label>
            <Input
              id="leadTimeDays"
              name="leadTimeDays"
              type="number"
              min="1"
              defaultValue={initialValues?.leadTimeDays ?? ''}
            />
            {typeof errors === 'object' && errors?.leadTimeDays && (
              <p className="text-xs text-destructive">{errors.leadTimeDays[0]}</p>
            )}
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
            {typeof errors === 'object' && errors?.comment && (
              <p className="text-xs text-destructive">{errors.comment[0]}</p>
            )}
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
