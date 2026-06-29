'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { move } from '@dnd-kit/helpers';
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import {
  createProductType,
  deleteProductType,
  reorderProductTypes,
  updateProductType,
  updateProductTypeDetailFields,
} from '@/actions/product-types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  PRODUCT_TYPE_DETAIL_FIELD_HELP,
  PRODUCT_TYPE_DETAIL_FIELD_KEYS,
  PRODUCT_TYPE_DETAIL_FIELD_LABELS,
  normalizeDetailFieldSettings,
  type ProductTypeDetailFieldKey,
  type ProductTypeDetailFieldSetting,
} from '@/lib/product-type-detail-fields';
import type { ProductType } from '@/types';

interface ProductTypeManagementProps {
  productTypes: ProductType[];
}

interface ProductTypeFormState {
  name: string;
}

interface SortableProductTypeItemProps {
  productType: ProductType;
  index: number;
  isSelected: boolean;
  counts: ReturnType<typeof getDetailFieldCounts>;
  disabled: boolean;
  onSelect: (productTypeId: string) => void;
}

type ProductTypeSettingField = 'enabled' | 'required';
type DetailSettingsByProductTypeId = Record<string, ProductTypeDetailFieldSetting[]>;

const initialFormState: ProductTypeFormState = {
  name: '',
};

function buildSettingsByProductTypeId(productTypes: ProductType[]): DetailSettingsByProductTypeId {
  return Object.fromEntries(
    productTypes.map((productType) => [
      productType.id,
      normalizeDetailFieldSettings(productType.detail_fields, productType.name),
    ])
  );
}

function getDetailFieldCounts(settings: ProductTypeDetailFieldSetting[]) {
  return {
    enabled: settings.filter((setting) => setting.enabled).length,
    required: settings.filter((setting) => setting.enabled && setting.required).length,
  };
}

function sortProductTypes(productTypes: ProductType[]): ProductType[] {
  return [...productTypes].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }

    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

function haveSameOrder(first: ProductType[], second: ProductType[]) {
  return first.length === second.length && first.every((item, index) => item.id === second[index]?.id);
}

function SortableProductTypeItem({
  productType,
  index,
  isSelected,
  counts,
  disabled,
  onSelect,
}: SortableProductTypeItemProps) {
  const { handleRef, isDragging, isDropTarget, ref } = useSortable({
    id: productType.id,
    index,
    group: 'product-types',
    disabled,
  });

  return (
    <div
      ref={ref}
      className={`flex items-stretch gap-2 rounded-lg border bg-background transition ${
        isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border'
      } ${isDragging ? 'opacity-60' : ''} ${isDropTarget ? 'ring-2 ring-primary/30' : ''}`}
    >
      <button
        ref={handleRef}
        type="button"
        className="flex cursor-grab items-center px-2 text-muted-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        aria-label={`Sleep ${productType.name} om te herschikken`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onSelect(productType.id)}
        className="min-w-0 flex-1 rounded-r-lg px-2 py-2 text-left transition hover:bg-muted/50"
        aria-pressed={isSelected}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium">{productType.name}</div>
            <div className="text-xs text-muted-foreground">Sleep om te herschikken</div>
          </div>
          <div className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
            {counts.enabled}/{PRODUCT_TYPE_DETAIL_FIELD_KEYS.length}
          </div>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {counts.required} required fields
        </div>
      </button>
    </div>
  );
}

export function ProductTypeManagement({ productTypes: initialProductTypes }: ProductTypeManagementProps) {
  const [productTypes, setProductTypes] = useState<ProductType[]>(initialProductTypes);
  const [detailSettingsById, setDetailSettingsById] = useState<DetailSettingsByProductTypeId>(() =>
    buildSettingsByProductTypeId(initialProductTypes)
  );
  const [formState, setFormState] = useState<ProductTypeFormState>(initialFormState);
  const [selectedProductTypeId, setSelectedProductTypeId] = useState<string | null>(
    initialProductTypes[0]?.id ?? null
  );
  const [editName, setEditName] = useState(initialProductTypes[0]?.name ?? '');
  const [loading, setLoading] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [savingSettingsId, setSavingSettingsId] = useState<string | null>(null);
  const [savingProductTypeId, setSavingProductTypeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sortedProductTypes = useMemo(() => sortProductTypes(productTypes), [productTypes]);

  const selectedProductType = useMemo(
    () =>
      sortedProductTypes.find((productType) => productType.id === selectedProductTypeId) ??
      sortedProductTypes[0] ??
      null,
    [selectedProductTypeId, sortedProductTypes]
  );

  const selectedDetailSettings = selectedProductType
    ? detailSettingsById[selectedProductType.id] ??
      normalizeDetailFieldSettings(selectedProductType.detail_fields, selectedProductType.name)
    : [];
  const selectedSettingByKey = new Map(selectedDetailSettings.map((setting) => [setting.key, setting]));
  const selectedFieldCounts = getDetailFieldCounts(selectedDetailSettings);

  const updateFormState = <K extends keyof ProductTypeFormState>(field: K, value: ProductTypeFormState[K]) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const selectProductType = (productTypeId: string) => {
    const productType = productTypes.find((item) => item.id === productTypeId);
    setSelectedProductTypeId(productTypeId);
    setEditName(productType?.name ?? '');
    setError(null);
    setSuccess(null);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await createProductType({ name: formState.name });

    if (result.error) {
      setError(result.error._form?.[0] ?? 'Something went wrong.');
      setLoading(false);
      return;
    }

    setProductTypes((prev) => [...prev, result.data]);
    setDetailSettingsById((prev) => ({
      ...prev,
      [result.data.id]: normalizeDetailFieldSettings(result.data.detail_fields, result.data.name),
    }));
    setSelectedProductTypeId(result.data.id);
    setEditName(result.data.name);
    setFormState(initialFormState);
    setSuccess('Product type added.');
    setLoading(false);
  };

  const handleDelete = async (productTypeId: string) => {
    if (!confirm('Are you sure you want to delete this product type?')) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await deleteProductType(productTypeId);
    if (result.error) {
      setError(result.error._form?.[0] ?? 'Delete failed.');
      setLoading(false);
      return;
    }

    const remainingProductTypes = productTypes.filter((productType) => productType.id !== productTypeId);
    setProductTypes(remainingProductTypes);
    if (selectedProductTypeId === productTypeId) {
      const nextSelectedProductType = sortProductTypes(remainingProductTypes)[0] ?? null;
      setSelectedProductTypeId(nextSelectedProductType?.id ?? null);
      setEditName(nextSelectedProductType?.name ?? '');
    }
    setDetailSettingsById((prev) => {
      const next = { ...prev };
      delete next[productTypeId];
      return next;
    });
    setSuccess('Product type deleted.');
    setLoading(false);
  };

  const handleSaveProductType = async (productType: ProductType) => {
    setSavingProductTypeId(productType.id);
    setError(null);
    setSuccess(null);

    const result = await updateProductType(productType.id, { name: editName });
    if (result.error) {
      setError(result.error._form?.[0] ?? 'Product type could not be saved.');
      setSavingProductTypeId(null);
      return;
    }

    setProductTypes((prev) => prev.map((item) => (item.id === result.data.id ? result.data : item)));
    setEditName(result.data.name);
    setDetailSettingsById((prev) => ({
      ...prev,
      [result.data.id]: normalizeDetailFieldSettings(result.data.detail_fields, result.data.name),
    }));
    setSuccess(`Product type saved: ${result.data.name}.`);
    setSavingProductTypeId(null);
  };

  const handleReorder = async (event: DragEndEvent) => {
    if (event.canceled || !event.operation.target || reordering) {
      return;
    }

    const previousProductTypes = sortedProductTypes;
    const nextProductTypes = move(previousProductTypes, event) as ProductType[];
    if (haveSameOrder(previousProductTypes, nextProductTypes)) {
      return;
    }

    setProductTypes(nextProductTypes);
    setReordering(true);
    setError(null);
    setSuccess(null);

    const result = await reorderProductTypes({ orderedIds: nextProductTypes.map((productType) => productType.id) });
    if (result.error) {
      setProductTypes(previousProductTypes);
      setError(result.error._form?.[0] ?? 'Reorder failed.');
      setReordering(false);
      return;
    }

    setProductTypes(result.data);
    setSuccess('Product type order saved.');
    setReordering(false);
  };

  const handleDetailFieldToggle = (
    productType: ProductType,
    fieldKey: ProductTypeDetailFieldKey,
    settingField: ProductTypeSettingField,
    checked: boolean
  ) => {
    setDetailSettingsById((prev) => {
      const currentSettings = prev[productType.id] ?? normalizeDetailFieldSettings(productType.detail_fields, productType.name);
      const nextSettings = currentSettings.map((setting) => {
        if (setting.key !== fieldKey) {
          return setting;
        }

        if (settingField === 'enabled') {
          return {
            ...setting,
            enabled: checked,
            required: checked ? setting.required : false,
          };
        }

        return {
          ...setting,
          enabled: checked ? true : setting.enabled,
          required: checked,
        };
      });

      return { ...prev, [productType.id]: nextSettings };
    });
  };

  const handleSaveDetailFields = async (productType: ProductType) => {
    setSavingSettingsId(productType.id);
    setError(null);
    setSuccess(null);

    const detailFields = normalizeDetailFieldSettings(
      detailSettingsById[productType.id],
      productType.name
    );
    const result = await updateProductTypeDetailFields(productType.id, { detail_fields: detailFields });

    if (result.error) {
      setError(result.error._form?.[0] ?? 'Could not save detail fields.');
      setSavingSettingsId(null);
      return;
    }

    setProductTypes((prev) =>
      prev.map((item) => item.id === productType.id ? result.data : item)
    );
    setDetailSettingsById((prev) => ({
      ...prev,
      [result.data.id]: normalizeDetailFieldSettings(result.data.detail_fields, result.data.name),
    }));
    setSuccess(`Details & dimensions saved for ${result.data.name}.`);
    setSavingSettingsId(null);
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
        <h2 className="text-xl font-semibold">Product types</h2>
        <p className="text-sm text-muted-foreground">
          Add product types, rename them, drag them into the right order, and configure Details & dimensions fields.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="product-type-name">Name *</Label>
              <Input
                id="product-type-name"
                value={formState.name}
                onChange={(event) => updateFormState('name', event.target.value)}
                placeholder="e.g. Tables"
                required
              />
            </div>

            <Button type="submit" disabled={loading || reordering}>
              <Plus className="mr-2 h-4 w-4" />
              {loading ? 'Saving...' : 'Add'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {sortedProductTypes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No product types yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(300px,420px)_minmax(0,1fr)]">
          <Card className="xl:sticky xl:top-4 xl:self-start">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">All product types</h3>
                  <p className="text-sm text-muted-foreground">
                    {sortedProductTypes.length} total · sleep aan het handvat om te herschikken
                  </p>
                </div>
                {reordering && (
                  <div className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                    Saving...
                  </div>
                )}
              </div>

              <DragDropProvider onDragEnd={handleReorder}>
                <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                  {sortedProductTypes.map((productType, index) => {
                    const settings = detailSettingsById[productType.id] ?? normalizeDetailFieldSettings(
                      productType.detail_fields,
                      productType.name
                    );
                    const counts = getDetailFieldCounts(settings);
                    const isSelected = selectedProductType?.id === productType.id;

                    return (
                      <SortableProductTypeItem
                        key={productType.id}
                        productType={productType}
                        index={index}
                        isSelected={isSelected}
                        counts={counts}
                        disabled={loading || reordering || savingSettingsId !== null || savingProductTypeId !== null}
                        onSelect={selectProductType}
                      />
                    );
                  })}
                </div>
              </DragDropProvider>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-5 p-4">
              {selectedProductType ? (
                <>
                  <div className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="selected-product-type-name">Product type name</Label>
                      <Input
                        id="selected-product-type-name"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        disabled={savingProductTypeId === selectedProductType.id || loading || reordering}
                      />
                      <p className="text-sm text-muted-foreground">
                        {selectedFieldCounts.enabled} shown · {selectedFieldCounts.required} required
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => handleSaveProductType(selectedProductType)}
                        disabled={savingProductTypeId === selectedProductType.id || loading || reordering}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        {savingProductTypeId === selectedProductType.id ? 'Saving...' : 'Save name'}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDelete(selectedProductType.id)}
                        disabled={loading || reordering || savingSettingsId === selectedProductType.id || savingProductTypeId === selectedProductType.id}
                        aria-label={`Delete ${selectedProductType.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead>Field</TableHead>
                          <TableHead className="w-28 text-center">Show</TableHead>
                          <TableHead className="w-32 text-center">Required</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {PRODUCT_TYPE_DETAIL_FIELD_KEYS.map((fieldKey) => {
                          const setting = selectedSettingByKey.get(fieldKey) ?? {
                            key: fieldKey,
                            enabled: false,
                            required: false,
                          };

                          return (
                            <TableRow key={fieldKey}>
                              <TableCell>
                                <div className="font-medium">{PRODUCT_TYPE_DETAIL_FIELD_LABELS[fieldKey]}</div>
                                <div className="text-xs text-muted-foreground">{PRODUCT_TYPE_DETAIL_FIELD_HELP[fieldKey]}</div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={setting.enabled}
                                  onCheckedChange={(checked) =>
                                    handleDetailFieldToggle(selectedProductType, fieldKey, 'enabled', checked === true)
                                  }
                                  aria-label={`Show ${PRODUCT_TYPE_DETAIL_FIELD_LABELS[fieldKey]}`}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={setting.required}
                                  disabled={!setting.enabled}
                                  onCheckedChange={(checked) =>
                                    handleDetailFieldToggle(selectedProductType, fieldKey, 'required', checked === true)
                                  }
                                  aria-label={`Require ${PRODUCT_TYPE_DETAIL_FIELD_LABELS[fieldKey]}`}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-end border-t pt-4">
                    <Button
                      type="button"
                      onClick={() => handleSaveDetailFields(selectedProductType)}
                      disabled={savingSettingsId === selectedProductType.id || loading || reordering}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {savingSettingsId === selectedProductType.id ? 'Saving...' : 'Save detail fields'}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  Select a product type to edit it.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
