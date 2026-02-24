'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createProductType, deleteProductType } from '@/actions/product-types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProductType } from '@/types';

interface ProductTypeManagementProps {
  productTypes: ProductType[];
}

interface ProductTypeFormState {
  name: string;
  sort_order: string;
}

const initialFormState: ProductTypeFormState = {
  name: '',
  sort_order: '',
};

export function ProductTypeManagement({ productTypes: initialProductTypes }: ProductTypeManagementProps) {
  const [productTypes, setProductTypes] = useState<ProductType[]>(initialProductTypes);
  const [formState, setFormState] = useState<ProductTypeFormState>(initialFormState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedProductTypes = useMemo(
    () =>
      [...productTypes].sort((a, b) => {
        if (a.sort_order !== b.sort_order) {
          return a.sort_order - b.sort_order;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }),
    [productTypes]
  );

  const updateFormState = <K extends keyof ProductTypeFormState>(field: K, value: ProductTypeFormState[K]) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const sortOrder = formState.sort_order.trim() === '' ? 0 : Number.parseInt(formState.sort_order, 10);
    const result = await createProductType({
      name: formState.name,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    });

    if (result.error) {
      setError(result.error._form?.[0] ?? 'Er ging iets mis.');
      setLoading(false);
      return;
    }

    setProductTypes((prev) => [...prev, result.data]);
    setFormState(initialFormState);
    setLoading(false);
  };

  const handleDelete = async (productTypeId: string) => {
    if (!confirm('Weet je zeker dat je deze soort wilt verwijderen?')) {
      return;
    }

    setLoading(true);
    setError(null);

    const result = await deleteProductType(productTypeId);
    if (result.error) {
      setError(result.error._form?.[0] ?? 'Verwijderen mislukt.');
      setLoading(false);
      return;
    }

    setProductTypes((prev) => prev.filter((productType) => productType.id !== productTypeId));
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Soorten</h2>
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="product-type-name">Naam *</Label>
              <Input
                id="product-type-name"
                value={formState.name}
                onChange={(event) => updateFormState('name', event.target.value)}
                placeholder="Bijv. Tables"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="product-type-sort-order">Volgorde</Label>
              <Input
                id="product-type-sort-order"
                type="number"
                step="1"
                value={formState.sort_order}
                onChange={(event) => updateFormState('sort_order', event.target.value)}
                placeholder="0"
              />
            </div>

            <Button type="submit" disabled={loading}>
              <Plus className="mr-2 h-4 w-4" />
              {loading ? 'Opslaan...' : 'Toevoegen'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Naam</TableHead>
                <TableHead>Volgorde</TableHead>
                <TableHead>Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedProductTypes.map((productType) => (
                <TableRow key={productType.id}>
                  <TableCell className="font-medium">{productType.name}</TableCell>
                  <TableCell className="text-muted-foreground">{productType.sort_order}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(productType.id)}
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {sortedProductTypes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    Nog geen soorten gevonden.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
