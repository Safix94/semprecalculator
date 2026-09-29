'use client';

import { useMemo, useState } from 'react';
import { Edit, Plus, Trash2, X } from 'lucide-react';
import { createOwnFabric, deleteOwnFabric, updateOwnFabric } from '@/actions/own-fabrics';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { OwnFabric } from '@/types';

interface OwnFabricManagementProps {
  fabrics: OwnFabric[];
}

interface OwnFabricFormState {
  name: string;
  pricePerMeter: string;
  isActive: boolean;
}

const initialFormState: OwnFabricFormState = {
  name: '',
  pricePerMeter: '',
  isActive: true,
};

function formatPricePerMeter(value: number) {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(value);
}

export function OwnFabricManagement({ fabrics: initialFabrics }: OwnFabricManagementProps) {
  const [fabrics, setFabrics] = useState<OwnFabric[]>(initialFabrics);
  const [formState, setFormState] = useState<OwnFabricFormState>(initialFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sortedFabrics = useMemo(
    () => [...fabrics].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [fabrics]
  );

  const resetForm = () => {
    setFormState(initialFormState);
    setEditingId(null);
  };

  const startEdit = (fabric: OwnFabric) => {
    setFormState({
      name: fabric.name,
      pricePerMeter: fabric.price_per_meter_eur.toFixed(2),
      isActive: fabric.is_active,
    });
    setEditingId(fabric.id);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const payload = {
      name: formState.name,
      price_per_meter_eur: Number(formState.pricePerMeter.replace(',', '.')),
      is_active: formState.isActive,
    };

    const result = editingId ? await updateOwnFabric(editingId, payload) : await createOwnFabric(payload);

    if ('error' in result) {
      setError(result.error._form?.[0] ?? 'Saving failed.');
      setLoading(false);
      return;
    }

    setFabrics((prev) =>
      editingId ? prev.map((fabric) => (fabric.id === editingId ? result.data : fabric)) : [...prev, result.data]
    );
    setSuccess(editingId ? 'Fabric updated.' : 'Fabric added.');
    resetForm();
    setLoading(false);
  };

  const handleDelete = async (fabric: OwnFabric) => {
    if (!confirm(`Remove "${fabric.name}" from the own-fabric list? Existing requests keep the fabric name.`)) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await deleteOwnFabric(fabric.id);
    if ('error' in result) {
      setError(result.error._form?.[0] ?? 'Delete failed.');
      setLoading(false);
      return;
    }

    setFabrics((prev) => prev.filter((item) => item.id !== fabric.id));
    if (editingId === fabric.id) {
      resetForm();
    }
    setSuccess('Fabric removed.');
    setLoading(false);
  };

  return (
    <div className="space-y-6">
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

      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Own fabrics</h2>
        <p className="text-sm text-muted-foreground">
          Sempre fabrics the cushion supplier does not stock. When a request has the finish “Own fabric”, the
          supplier enters the running meters needed and this price per meter is added to their purchase price
          before margin and multiplier.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(360px,520px)_minmax(0,1fr)]">
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="own-fabric-name">Name *</Label>
                <Input
                  id="own-fabric-name"
                  value={formState.name}
                  onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="own-fabric-price">Price per running meter (EUR) *</Label>
                <Input
                  id="own-fabric-price"
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  value={formState.pricePerMeter}
                  onChange={(event) => setFormState((prev) => ({ ...prev, pricePerMeter: event.target.value }))}
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="own-fabric-active"
                  checked={formState.isActive}
                  onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, isActive: checked === true }))}
                />
                <Label htmlFor="own-fabric-active" className="font-normal">
                  Available in the request wizard
                </Label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={loading}>
                  {editingId ? <Edit className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {loading ? 'Saving...' : editingId ? 'Update' : 'Add'}
                </Button>
                {editingId && (
                  <Button type="button" variant="secondary" onClick={resetForm} disabled={loading}>
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {sortedFabrics.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">No fabrics yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fabric</TableHead>
                    <TableHead className="text-right">Price / meter</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[110px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedFabrics.map((fabric) => (
                    <TableRow key={fabric.id} className={editingId === fabric.id ? 'bg-primary/5' : undefined}>
                      <TableCell className="font-medium">{fabric.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPricePerMeter(fabric.price_per_meter_eur)}</TableCell>
                      <TableCell>
                        {fabric.is_active ? (
                          <span className="text-xs font-semibold text-foreground/80">Active</span>
                        ) : (
                          <span className="text-xs font-semibold text-muted-foreground">Inactive</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => startEdit(fabric)} disabled={loading}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(fabric)} disabled={loading}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
