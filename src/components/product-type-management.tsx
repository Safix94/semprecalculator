'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import {
  createProductType,
  deleteProductType,
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
  sort_order: string;
}

type ProductTypeSettingField = 'enabled' | 'required';
type DetailSettingsByProductTypeId = Record<string, ProductTypeDetailFieldSetting[]>;

const initialFormState: ProductTypeFormState = {
  name: '',
  sort_order: '',
};

const PRODUCT_TYPES_PER_PAGE = 20;

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

export function ProductTypeManagement({ productTypes: initialProductTypes }: ProductTypeManagementProps) {
  const [productTypes, setProductTypes] = useState<ProductType[]>(initialProductTypes);
  const [detailSettingsById, setDetailSettingsById] = useState<DetailSettingsByProductTypeId>(() =>
    buildSettingsByProductTypeId(initialProductTypes)
  );
  const [formState, setFormState] = useState<ProductTypeFormState>(initialFormState);
  const [selectedProductTypeId, setSelectedProductTypeId] = useState<string | null>(
    initialProductTypes[0]?.id ?? null
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [savingSettingsId, setSavingSettingsId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const totalPages = Math.max(1, Math.ceil(sortedProductTypes.length / PRODUCT_TYPES_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * PRODUCT_TYPES_PER_PAGE;
  const visibleProductTypes = sortedProductTypes.slice(
    pageStartIndex,
    pageStartIndex + PRODUCT_TYPES_PER_PAGE
  );

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
    setSelectedProductTypeId(productTypeId);
    setError(null);
    setSuccess(null);
  };

  const goToPage = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    setCurrentPage(nextPage);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const sortOrder = formState.sort_order.trim() === '' ? 0 : Number.parseInt(formState.sort_order, 10);
    const result = await createProductType({
      name: formState.name,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    });

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
      const nextSorted = [...remainingProductTypes].sort((a, b) => {
        if (a.sort_order !== b.sort_order) {
          return a.sort_order - b.sort_order;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      setSelectedProductTypeId(nextSorted[0]?.id ?? null);
    }
    setDetailSettingsById((prev) => {
      const next = { ...prev };
      delete next[productTypeId];
      return next;
    });
    setSuccess('Product type deleted.');
    setLoading(false);
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
          Select a product type on the left and configure its Details & dimensions fields on the right.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-end">
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

            <div className="space-y-1.5">
              <Label htmlFor="product-type-sort-order">Sort order</Label>
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
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
          <Card className="lg:sticky lg:top-4 lg:self-start">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">All product types</h3>
                  <p className="text-sm text-muted-foreground">
                    {sortedProductTypes.length} total · max {PRODUCT_TYPES_PER_PAGE} per page
                  </p>
                </div>
                <div className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {safeCurrentPage}/{totalPages}
                </div>
              </div>

              <div className="space-y-2">
                {visibleProductTypes.map((productType) => {
                  const settings = detailSettingsById[productType.id] ?? normalizeDetailFieldSettings(
                    productType.detail_fields,
                    productType.name
                  );
                  const counts = getDetailFieldCounts(settings);
                  const isSelected = selectedProductType?.id === productType.id;

                  return (
                    <button
                      key={productType.id}
                      type="button"
                      onClick={() => selectProductType(productType.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition hover:border-primary/60 hover:bg-muted/50 ${
                        isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-background'
                      }`}
                      aria-pressed={isSelected}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{productType.name}</div>
                          <div className="text-xs text-muted-foreground">Sort order: {productType.sort_order}</div>
                        </div>
                        <div className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                          {counts.enabled}/{PRODUCT_TYPE_DETAIL_FIELD_KEYS.length}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {counts.required} required fields
                      </div>
                    </button>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(safeCurrentPage - 1)}
                    disabled={safeCurrentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {pageStartIndex + 1}-{Math.min(pageStartIndex + PRODUCT_TYPES_PER_PAGE, sortedProductTypes.length)} of {sortedProductTypes.length}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(safeCurrentPage + 1)}
                    disabled={safeCurrentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-4">
              {selectedProductType ? (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{selectedProductType.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedFieldCounts.enabled} shown · {selectedFieldCounts.required} required · Sort order {selectedProductType.sort_order}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => handleSaveDetailFields(selectedProductType)}
                        disabled={savingSettingsId === selectedProductType.id || loading}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        {savingSettingsId === selectedProductType.id ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDelete(selectedProductType.id)}
                        disabled={loading || savingSettingsId === selectedProductType.id}
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
                      disabled={savingSettingsId === selectedProductType.id || loading}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {savingSettingsId === selectedProductType.id ? 'Saving...' : 'Save detail fields'}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  Select a product type to edit its fields.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
