'use client';

import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { updatePricingSettings, type PricingSettingsWithMeta } from '@/actions/pricing-settings';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PricingSettingsManagementProps {
  settings: PricingSettingsWithMeta;
}

type FormState = {
  containerPriceEur: string;
  containerVolumeM3: string;
  productMarginFactor: string;
  shippingMarginFactor: string;
};

function toFormState(settings: PricingSettingsWithMeta): FormState {
  return {
    containerPriceEur: String(settings.containerPriceEur),
    containerVolumeM3: String(settings.containerVolumeM3),
    productMarginFactor: String(settings.productMarginFactor),
    shippingMarginFactor: String(settings.shippingMarginFactor),
  };
}

function parsePositiveNumber(value: string): number {
  return Number(value.replace(',', '.'));
}

export function PricingSettingsManagement({ settings }: PricingSettingsManagementProps) {
  const [formData, setFormData] = useState<FormState>(() => toFormState(settings));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const preview = useMemo(() => {
    const containerPrice = parsePositiveNumber(formData.containerPriceEur);
    const containerVolume = parsePositiveNumber(formData.containerVolumeM3);
    const productMargin = parsePositiveNumber(formData.productMarginFactor);
    const shippingMargin = parsePositiveNumber(formData.shippingMarginFactor);

    if (
      !Number.isFinite(containerPrice) ||
      !Number.isFinite(containerVolume) ||
      !Number.isFinite(productMargin) ||
      !Number.isFinite(shippingMargin) ||
      containerPrice <= 0 ||
      containerVolume <= 0 ||
      productMargin <= 0 ||
      shippingMargin <= 0
    ) {
      return null;
    }

    const supplierPrice = 100;
    const supplierVolumeM3 = 10;
    const shippingCost = (containerPrice / containerVolume) * supplierVolumeM3;
    const finalPrice = supplierPrice * productMargin + shippingCost * shippingMargin;

    return {
      shippingCost,
      finalPrice,
      shippingCostWithMargin: shippingCost * shippingMargin,
      productPriceWithMargin: supplierPrice * productMargin,
    };
  }, [formData]);

  const updateField = (field: keyof FormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const input = {
      containerPriceEur: parsePositiveNumber(formData.containerPriceEur),
      containerVolumeM3: parsePositiveNumber(formData.containerVolumeM3),
      productMarginFactor: parsePositiveNumber(formData.productMarginFactor),
      shippingMarginFactor: parsePositiveNumber(formData.shippingMarginFactor),
    };

    const result = await updatePricingSettings(input);
    if (result.error) {
      setError(result.error._form?.[0] || 'Pricing settings could not be saved.');
    } else if (result.data) {
      setFormData(toFormState(result.data));
      setSuccess('Pricing settings saved. New supplier quotes will use these values.');
    }

    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pricing settings</CardTitle>
          <CardDescription>
            Configure the container cost, container capacity, and pricing margins used for supplier quotes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="container-price">Container price (€)</Label>
                <Input
                  id="container-price"
                  inputMode="decimal"
                  value={formData.containerPriceEur}
                  onChange={(event) => updateField('containerPriceEur', event.target.value)}
                  placeholder="7500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="container-volume">Container volume (m³)</Label>
                <Input
                  id="container-volume"
                  inputMode="decimal"
                  value={formData.containerVolumeM3}
                  onChange={(event) => updateField('containerVolumeM3', event.target.value)}
                  placeholder="67"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="product-margin">Product margin factor</Label>
                <Input
                  id="product-margin"
                  inputMode="decimal"
                  value={formData.productMarginFactor}
                  onChange={(event) => updateField('productMarginFactor', event.target.value)}
                  placeholder="2.1"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shipping-margin">Shipping margin factor</Label>
                <Input
                  id="shipping-margin"
                  inputMode="decimal"
                  value={formData.shippingMarginFactor}
                  onChange={(event) => updateField('shippingMarginFactor', event.target.value)}
                  placeholder="2.4"
                  required
                />
              </div>
            </div>

            <Card className="bg-muted/40">
              <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">Formula</p>
                <p>
                  Final price = supplier price × product margin + ((container price / container m³) × supplier m³ × shipping margin)
                </p>
                {preview && (
                  <p>
                    Example with supplier price €100 and 10 m³: product €{preview.productPriceWithMargin.toFixed(2)} + shipping €{preview.shippingCostWithMargin.toFixed(2)} = €{preview.finalPrice.toFixed(2)}
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" disabled={loading}>
                <Save className="w-4 h-4 mr-2" />
                {loading ? 'Saving...' : 'Save pricing settings'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
