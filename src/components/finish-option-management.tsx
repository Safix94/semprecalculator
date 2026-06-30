'use client';

import { useMemo, useState } from 'react';
import { move } from '@dnd-kit/helpers';
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { Edit, GripVertical, Plus, Trash2, X } from 'lucide-react';
import {
  createFinishOption,
  deleteFinishOption,
  reorderFinishOptions,
  updateFinishOption,
} from '@/actions/finish-options';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FinishOption } from '@/types';

interface FinishOptionManagementProps {
  finishOptions: FinishOption[];
}

interface FinishOptionFormState {
  name: string;
  abbreviation: string;
}

interface SortableFinishOptionItemProps {
  finishOption: FinishOption;
  index: number;
  isEditing: boolean;
  disabled: boolean;
  onEdit: (finishOption: FinishOption) => void;
  onDelete: (finishOptionId: string) => void;
}

const initialFormState: FinishOptionFormState = {
  name: '',
  abbreviation: '',
};

function sortFinishOptions(finishOptions: FinishOption[]): FinishOption[] {
  return [...finishOptions].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }

    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

function haveSameOrder(first: FinishOption[], second: FinishOption[]) {
  return first.length === second.length && first.every((item, index) => item.id === second[index]?.id);
}

function SortableFinishOptionItem({
  finishOption,
  index,
  isEditing,
  disabled,
  onEdit,
  onDelete,
}: SortableFinishOptionItemProps) {
  const { handleRef, isDragging, isDropTarget, ref } = useSortable({
    id: finishOption.id,
    index,
    group: 'finish-options',
    disabled,
  });

  return (
    <div
      ref={ref}
      className={`flex items-center gap-2 border-b px-4 py-3 transition last:border-b-0 ${
        isEditing ? 'bg-primary/5' : 'bg-background'
      } ${isDragging ? 'opacity-60' : ''} ${isDropTarget ? 'ring-2 ring-primary/30' : ''}`}
    >
      <button
        ref={handleRef}
        type="button"
        className="cursor-grab text-muted-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        aria-label={`Sleep ${finishOption.name} om te herschikken`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {finishOption.abbreviation && (
            <span className="shrink-0 rounded bg-secondary px-2 py-0.5 font-mono text-xs font-semibold text-secondary-foreground">
              {finishOption.abbreviation}
            </span>
          )}
          <div className="truncate font-medium">{finishOption.name}</div>
        </div>
        <div className="text-xs text-muted-foreground">Sleep om de volgorde van suggesties te bepalen</div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(finishOption)}
          disabled={disabled}
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(finishOption.id)}
          disabled={disabled}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function FinishOptionManagement({ finishOptions: initialFinishOptions }: FinishOptionManagementProps) {
  const [finishOptions, setFinishOptions] = useState<FinishOption[]>(initialFinishOptions);
  const [formState, setFormState] = useState<FinishOptionFormState>(initialFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sortedFinishOptions = useMemo(() => sortFinishOptions(finishOptions), [finishOptions]);

  const updateFormState = <K extends keyof FinishOptionFormState>(field: K, value: FinishOptionFormState[K]) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormState(initialFormState);
    setEditingId(null);
  };

  const startEdit = (finishOption: FinishOption) => {
    setFormState({ name: finishOption.name, abbreviation: finishOption.abbreviation ?? '' });
    setEditingId(finishOption.id);
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
      abbreviation: formState.abbreviation,
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
    setSuccess(editingId ? 'Finish updated.' : 'Finish added.');
    resetForm();
    setLoading(false);
  };

  const handleDelete = async (finishOptionId: string) => {
    if (!confirm('Are you sure you want to remove this finish from the master list?')) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

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
    setSuccess('Finish removed.');
    setLoading(false);
  };

  const handleReorder = async (event: DragEndEvent) => {
    if (event.canceled || !event.operation.target || reordering) {
      return;
    }

    const previousFinishOptions = sortedFinishOptions;
    const nextFinishOptions = move(previousFinishOptions, event) as FinishOption[];
    if (haveSameOrder(previousFinishOptions, nextFinishOptions)) {
      return;
    }

    setFinishOptions(nextFinishOptions);
    setReordering(true);
    setError(null);
    setSuccess(null);

    const result = await reorderFinishOptions({ orderedIds: nextFinishOptions.map((finishOption) => finishOption.id) });
    if ('error' in result) {
      setFinishOptions(previousFinishOptions);
      setError(result.error._form?.[0] ?? 'Reorder failed.');
      setReordering(false);
      return;
    }

    setFinishOptions(result.data);
    setSuccess('Finish order saved.');
    setReordering(false);
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
        <h2 className="text-xl font-semibold">Finishes</h2>
        <p className="text-sm text-muted-foreground">
          Master list used as suggestions when configuring material finish options. Drag finishes to control suggestion order.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_140px_auto_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="finish-option-name">Name *</Label>
              <Input
                id="finish-option-name"
                value={formState.name}
                onChange={(event) => updateFormState('name', event.target.value)}
                placeholder="e.g. Antique fumé"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="finish-option-abbreviation">Code</Label>
              <Input
                id="finish-option-abbreviation"
                value={formState.abbreviation}
                onChange={(event) => updateFormState('abbreviation', event.target.value.toUpperCase())}
                placeholder="AF"
                className="font-mono uppercase"
              />
            </div>

            <Button type="submit" disabled={loading || reordering}>
              {editingId ? <Edit className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
              {loading ? 'Saving...' : editingId ? 'Update' : 'Add'}
            </Button>

            {editingId && (
              <Button type="button" variant="secondary" onClick={resetForm} disabled={loading || reordering}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
            <div>
              <h3 className="font-medium">Finish order</h3>
              <p className="text-sm text-muted-foreground">Sleep om de volgorde van suggesties te bepalen.</p>
            </div>
            {reordering && (
              <div className="rounded-full bg-background px-2 py-1 text-xs text-muted-foreground">
                Saving...
              </div>
            )}
          </div>

          {sortedFinishOptions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No finishes yet.</div>
          ) : (
            <DragDropProvider onDragEnd={handleReorder}>
              <div>
                {sortedFinishOptions.map((finishOption, index) => (
                  <SortableFinishOptionItem
                    key={finishOption.id}
                    finishOption={finishOption}
                    index={index}
                    isEditing={editingId === finishOption.id}
                    disabled={loading || reordering}
                    onEdit={startEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </DragDropProvider>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
