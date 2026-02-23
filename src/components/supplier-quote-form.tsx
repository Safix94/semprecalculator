'use client';

import { useState } from 'react';
import { submitQuote } from '@/actions/quote';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SupplierQuoteFormProps {
  rfqId: string;
  token: string;
}

export function SupplierQuoteForm({ rfqId, token }: SupplierQuoteFormProps) {
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
          <h2 className="text-lg font-semibold text-chart-2 mb-2">Offerte ingediend</h2>
          <p className="text-muted-foreground">Bedankt voor uw offerte. U kunt deze pagina sluiten.</p>
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
        <CardTitle>Offerte indienen</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="basePrice">Basisprijs (EUR) *</Label>
              <Input
                id="basePrice"
                name="basePrice"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                aria-invalid={Boolean(typeof errors === 'object' && errors?.basePrice)}
              />
              {typeof errors === 'object' && errors?.basePrice && (
                <p className="text-destructive text-xs">{errors.basePrice[0]}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="volumeM3">Volume (m³) *</Label>
              <Input
                id="volumeM3"
                name="volumeM3"
                type="number"
                step="0.001"
                min="0.001"
                required
                placeholder="0.000"
                aria-invalid={Boolean(typeof errors === 'object' && errors?.volumeM3)}
              />
              {typeof errors === 'object' && errors?.volumeM3 && (
                <p className="text-destructive text-xs">{errors.volumeM3[0]}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leadTimeDays">Levertijd (dagen, optioneel)</Label>
            <Input id="leadTimeDays" name="leadTimeDays" type="number" min="1" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comment">Opmerking (optioneel)</Label>
            <Textarea id="comment" name="comment" rows={3} maxLength={2000} />
          </div>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Bezig met indienen...' : 'Offerte indienen'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
