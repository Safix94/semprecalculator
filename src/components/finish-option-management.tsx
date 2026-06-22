'use client';

import { useMemo, useState } from 'react';
import { Edit, Plus, Trash2, X } from 'lucide-react';
import {
  createFinishOption,
  deleteFinishOption,
  updateFinishOption,
} from '@/actions/finish-options';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { FinishOption } from '@/types';

interface FinishOptionManagementProps {
  finishOptions: FinishOption[];
}

interface FinishOptionFormState {
  name: string;
  sort_order: string;
}

const initialFormState: FinishOptionFormState = {
  name: '',
  sort_order: '',
};

export function FinishOptionManagement({ finishOptions: initialFinishOptions }: FinishOptionManagementProps) {
  const [finishOptions, setFinishOptions] = useState<FinishOption[]>(initialFinishOptions);
  const [formState, setFormState] = useState<FinishOptionFormState>(initialFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedFinishOptions = useMemo(
    () =>
      [...finishOptions].sort((a, b) => {
        if (a.sort_order !== b.sort_order) {
          return a.sort_order - b.sort_order;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }),
    [finishOptions]
  );

  const updateFormState = <K extends keyof FinishOptionFormState>(field: K, value: FinishOptionFormState[K]) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormState(initialFormState);
    setEditingId(null);
  };

  const startEdit = (finishOption: FinishOption) => {
    setFormState({
      name: finishOption.name,
      sort_order: String(finishOption.sort_order ?? 0),
    });
    setEditingId(finishOption.id);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const sortOrder = formState.sort_order.trim() === '' ? 0 : Number.parseInt(formState.sort_order, 10);
    const payload = {
      name: formState.name,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    };

    const result = editingId
      ? await updateFinishOption(editingId, payload)
      : await createFinishOption(payload);

    if ('error' in result) {
      setError(result.error._form?.[0] ?? 'Saving failed.');
      setLoading(false);
      return;
    }

    setFinishOptions((prev) => {
      if (editingId) {
        return prev.map((finishOption) =>
          finishOption.id === editingId ? result.data : finishOption
        );
      }

      const existingIndex = prev.findIndex((finishOption) => finishOption.id === result.data.id);
      if (existingIndex >= 0) {
        return prev.map((finishOption) =>
          finishOption.id === result.data.id ? result.data : finishOption
        );
      }

      return [...prev, result.data];
    });
    resetForm();
    setLoading(false);
  };

  const handleDelete = async (finishOptionId: string) => {
    if (!confirm('Are you sure you want to remove this finish from the master list?')) {
      return;
    }

    setLoading(true);
    setError(null);

    const result = await deleteFinishOption(finishOptionId);
    if ('error' in result) {
      setError(result.error._form?.[0] ?? 'Delete failed.');
      setLoading(false);
      return;
    }

    setFinishOptions((prev) => prev.filter((finishOption) => finishOption.id !== finishOptionId));
    if (editingId === finishOptionId) {
      resetForm();
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Finishes</h2>
        <p className="text-sm text-muted-foreground">
          Master list used as suggestions when configuring material finish options. Existing material finishes are seeded here by the database migration.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-[2fr_1fr_auto_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="finish-option-name">Name *</Label>
              <Input
                id="finish-option-name"
                value={formState.name}
                onChange={(event) => updateFormState('name', event.target.value)}
                placeholder="e.g. Polished, Brushed, Black"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="finish-option-sort-order">Sort order</Label>
              <Input
                id="finish-option-sort-order"
                type="number"
                step="1"
                value={formState.sort_order}
                onChange={(event) => updateFormState('sort_order', event.target.value)}
                placeholder="0"
              />
            </div>

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
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Name</TableHead>
                <TableHead>Sort order</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedFinishOptions.map((finishOption) => (
                <TableRow key={finishOption.id}>
                  <TableCell className="font-medium">{finishOption.name}</TableCell>
                  <TableCell className="text-muted-foreground">{finishOption.sort_order}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(finishOption)}
                        disabled={loading}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(finishOption.id)}
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {sortedFinishOptions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No finishes yet.
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
