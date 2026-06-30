'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateRfqDetails } from '@/actions/rfq';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RfqDetailsOverview } from '@/components/rfq-details-overview';
import { Input } from '@/components/ui/input';
import {
  isRoundShape,
  isTablesProductType,
} from '@/lib/rfq-format';
import type { Rfq, RfqInvite, Supplier, UserRole } from '@/types';

interface RfqDirectDetailsCardProps {
  rfq: Rfq;
  userRole: UserRole;
  invites?: (RfqInvite & { supplier: Supplier | null })[];
}

function parseActionError(actionError: unknown): string {
  if (typeof actionError === 'string') {
    return actionError;
  }

  if (actionError && typeof actionError === 'object') {
    const firstFieldError = Object.values(actionError as Record<string, unknown>)
      .flatMap((value) => (Array.isArray(value) ? value : []))
      .find((value): value is string => typeof value === 'string');

    if (firstFieldError) {
      return firstFieldError;
    }
  }

  return 'Could not update RFQ details';
}

export function RfqDirectDetailsCard({ rfq, userRole, invites = [] }: RfqDirectDetailsCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [form, setForm] = useState({
    model: rfq.model || '',
    length: String(rfq.length),
    width: String(rfq.width),
    height: String(rfq.height),
    thickness: String(rfq.thickness),
  });

  const isRound = isRoundShape(rfq.shape);
  const isTablesType = isTablesProductType(rfq.product_type);
  const canManageRfq = userRole === 'admin' || userRole === 'sales';
  const canEditRfqDetails = canManageRfq && (rfq.status === 'draft' || rfq.status === 'sent_to_pricing');

  const resetForm = useCallback(() => {
    setForm({
      model: rfq.model || '',
      length: String(rfq.length),
      width: String(rfq.width),
      height: String(rfq.height),
      thickness: String(rfq.thickness),
    });
  }, [rfq.height, rfq.length, rfq.model, rfq.thickness, rfq.width]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const startEdit = () => {
    resetForm();
    setError(null);
    setResult(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    resetForm();
    setError(null);
    setEditing(false);
  };

  const saveDetails = useCallback(async () => {
    const parsedLength = Number.parseFloat(form.length);
    const parsedWidth = Number.parseFloat(form.width);
    const parsedHeight = Number.parseFloat(form.height);
    const parsedThickness = Number.parseFloat(form.thickness);
    const normalizedModel = form.model.trim();
    const currentModel = (rfq.model ?? '').trim();

    const updateInput: {
      model?: string | null;
      length?: number;
      width?: number;
      height?: number;
      thickness?: number;
    } = {};

    if (isTablesType && normalizedModel !== currentModel) {
      updateInput.model = normalizedModel.length > 0 ? normalizedModel : null;
    }
    if (!Number.isNaN(parsedLength) && parsedLength !== rfq.length) {
      updateInput.length = parsedLength;
    }
    if (!isRound && !Number.isNaN(parsedWidth) && parsedWidth !== rfq.width) {
      updateInput.width = parsedWidth;
    }
    if (!Number.isNaN(parsedHeight) && parsedHeight !== rfq.height) {
      updateInput.height = parsedHeight;
    }
    if (!Number.isNaN(parsedThickness) && parsedThickness !== rfq.thickness) {
      updateInput.thickness = parsedThickness;
    }

    if (Object.keys(updateInput).length === 0) {
      setResult('No changes to save.');
      setError(null);
      setEditing(false);
      return;
    }

    setSaving(true);
    setError(null);
    setResult(null);

    try {
      const response = await updateRfqDetails(rfq.id, updateInput);
      if ('error' in response) {
        setError(parseActionError(response.error));
        return;
      }

      setEditing(false);
      setResult('Details saved.');
      router.refresh();
    } catch (saveError) {
      console.error('Failed to update RFQ details:', saveError);
      setError('Could not update RFQ details.');
    } finally {
      setSaving(false);
    }
  }, [form.height, form.length, form.model, form.thickness, form.width, isRound, isTablesType, rfq.height, rfq.id, rfq.length, rfq.model, rfq.thickness, rfq.width, router]);

  return (
    <div className="space-y-4">
      <RfqDetailsOverview rfq={rfq} invites={invites} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Edit details</CardTitle>
            {canEditRfqDetails && !editing && (
              <Button type="button" variant="outline" size="sm" onClick={startEdit}>
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editing && canEditRfqDetails ? (
            <div className="rounded-md border p-3">
              <div className={`grid gap-3 ${isRound ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
                {isTablesType && (
                  <label className="space-y-1 text-xs uppercase text-muted-foreground md:col-span-full">
                    Model
                    <Input value={form.model} onChange={(event) => updateField('model', event.target.value)} />
                  </label>
                )}
                <label className="space-y-1 text-xs uppercase text-muted-foreground">
                  {isRound ? 'Diameter (cm)' : 'Length (cm)'}
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={form.length}
                    onChange={(event) => updateField('length', event.target.value)}
                  />
                </label>
                {!isRound && (
                  <label className="space-y-1 text-xs uppercase text-muted-foreground">
                    Width (cm)
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={form.width}
                      onChange={(event) => updateField('width', event.target.value)}
                    />
                  </label>
                )}
                <label className="space-y-1 text-xs uppercase text-muted-foreground">
                  Height (cm)
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={form.height}
                    onChange={(event) => updateField('height', event.target.value)}
                  />
                </label>
                <label className="space-y-1 text-xs uppercase text-muted-foreground">
                  Thickness top (cm)
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={form.thickness}
                    onChange={(event) => updateField('thickness', event.target.value)}
                  />
                </label>
              </div>
              {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
              <div className="mt-4 flex gap-2">
                <Button type="button" size="sm" onClick={saveDetails} disabled={saving}>
                  {saving ? 'Saving...' : 'Save changes'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Open edit mode to adjust dimensions or model before sending to suppliers.</p>
          )}

          {result && <p className="mt-3 text-sm text-chart-2">{result}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
