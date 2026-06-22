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

function buildSettingsByProductTypeId(productTypes: ProductType[]): DetailSettingsByProductTypeId {
  return Object.fromEntries(
    productTypes.map((productType) => [
      productType.id,
      normalizeDetailFieldSettings(productType.detail_fields, productType.name),
    ])
  );
}

export function ProductTypeManagement({ productTypes: initialProductTypes }: ProductTypeManagementProps) {
  const [productTypes, setProductTypes] = useState<ProductType[]>(initialProductTypes);
  const [detailSettingsById, setDetailSettingsById] = useState<DetailSettingsByProductTypeId>(() =>
    buildSettingsByProductTypeId(initialProductTypes)
  );
  const [formState, setFormState] = useState<ProductTypeFormState>(initialFormState);
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

  const updateFormState = <K extends keyof ProductTypeFormState>(field: K, value: ProductTypeFormState[K]) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
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

    setProductTypes((prev) => prev.filter((productType) => productType.id !== productTypeId));
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
      [productType.id]: normalizeDetailFieldSettings(result.data.detail_fields, result.data.name),
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
          Configure which Details & dimensions fields appear per product type, and whether each field is required.
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

      <div className="space-y-4">
        {sortedProductTypes.map((productType) => {
          const detailSettings = detailSettingsById[productType.id] ?? normalizeDetailFieldSettings(
            productType.detail_fields,
            productType.name
          );
          const settingByKey = new Map(detailSettings.map((setting) => [setting.key, setting]));

          return (
            <Card key={productType.id}>
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{productType.name}</h3>
                    <p className="text-sm text-muted-foreground">Sort order: {productType.sort_order}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(productType.id)}
                    disabled={loading || savingSettingsId === productType.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
                        const setting = settingByKey.get(fieldKey) ?? {
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
                                  handleDetailFieldToggle(productType, fieldKey, 'enabled', checked === true)
                                }
                                aria-label={`Show ${PRODUCT_TYPE_DETAIL_FIELD_LABELS[fieldKey]}`}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={setting.required}
                                disabled={!setting.enabled}
                                onCheckedChange={(checked) =>
                                  handleDetailFieldToggle(productType, fieldKey, 'required', checked === true)
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

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() => handleSaveDetailFields(productType)}
                    disabled={savingSettingsId === productType.id || loading}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {savingSettingsId === productType.id ? 'Saving...' : 'Save detail fields'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {sortedProductTypes.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No product types yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
