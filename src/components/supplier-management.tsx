'use client';

import { useState } from 'react';
import { Plus, Edit, Trash2, X } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '@/actions/suppliers';
import { SUPPLIER_LANGUAGE_LABELS, SUPPLIER_LANGUAGES, normalizeSupplierLanguage } from '@/lib/supplier-language';
import { MAX_SUPPLIER_ADDITIONAL_EMAILS, parseEmailList } from '@/lib/email-recipients';
import { DEFAULT_TRUCK_MULTIPLIER_FACTOR } from '@/lib/pricing';
import type { Material, SupplierLanguage, SupplierPricingProfile, SupplierWithMaterials, TransportMode } from '@/types';

interface SupplierManagementProps {
  suppliers: SupplierWithMaterials[];
  materials: Material[];
}

interface SupplierPricingProfileFormData {
  transport_mode: TransportMode;
  container_price_eur: string;
  container_volume_m3: string;
  product_margin_factor: string;
  retail_multiplier_factor: string;
  truck_multiplier_factor: string;
}

interface SupplierFormData {
  name: string;
  email: string;
  additional_emails: string[];
  material_ids: string[];
  preferred_language: SupplierLanguage;
  pricing_profile: SupplierPricingProfileFormData;
}

const defaultPricingProfileFormData: SupplierPricingProfileFormData = {
  transport_mode: 'container',
  container_price_eur: '7500',
  container_volume_m3: '67',
  product_margin_factor: '2.1',
  retail_multiplier_factor: '2.4',
  truck_multiplier_factor: DEFAULT_TRUCK_MULTIPLIER_FACTOR.toString(),
};

const initialFormData: SupplierFormData = {
  name: '',
  email: '',
  additional_emails: [],
  material_ids: [],
  preferred_language: 'en',
  pricing_profile: defaultPricingProfileFormData,
};

function formatTransportMode(mode: TransportMode) {
  if (mode === 'none') return 'Geen transport';
  if (mode === 'container') return 'Container';
  return 'Camion';
}

function toPricingProfileFormData(profile?: SupplierPricingProfile | null): SupplierPricingProfileFormData {
  if (!profile) {
    return defaultPricingProfileFormData;
  }

  return {
    transport_mode: profile.transport_mode,
    container_price_eur: profile.container_price_eur?.toString() ?? '',
    container_volume_m3: profile.container_volume_m3?.toString() ?? '',
    product_margin_factor: profile.product_margin_factor.toString(),
    retail_multiplier_factor: profile.retail_multiplier_factor.toString(),
    truck_multiplier_factor: profile.truck_multiplier_factor?.toString() ?? DEFAULT_TRUCK_MULTIPLIER_FACTOR.toString(),
  };
}

function parseDecimal(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pricingFormToInput(profile: SupplierPricingProfileFormData) {
  return {
    transport_mode: profile.transport_mode,
    container_price_eur: profile.transport_mode === 'container' ? parseDecimal(profile.container_price_eur) : null,
    container_volume_m3: profile.transport_mode === 'container' ? parseDecimal(profile.container_volume_m3) : null,
    product_margin_factor: parseDecimal(profile.product_margin_factor) ?? 0,
    retail_multiplier_factor: parseDecimal(profile.retail_multiplier_factor) ?? 0,
    truck_multiplier_factor: profile.transport_mode === 'truck' ? parseDecimal(profile.truck_multiplier_factor) ?? DEFAULT_TRUCK_MULTIPLIER_FACTOR : null,
  };
}

export function SupplierManagement({ suppliers: initialSuppliers, materials }: SupplierManagementProps) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [editingSupplier, setEditingSupplier] = useState<SupplierWithMaterials | null>(null);
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData);
  const [additionalEmailInput, setAdditionalEmailInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const updateFormData = <K extends keyof SupplierFormData>(field: K, value: SupplierFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updatePricingProfile = <K extends keyof SupplierPricingProfileFormData>(
    field: K,
    value: SupplierPricingProfileFormData[K]
  ) => {
    setFormData(prev => ({
      ...prev,
      pricing_profile: { ...prev.pricing_profile, [field]: value },
    }));
  };

  const handleTransportModeChange = (transportMode: TransportMode) => {
    setFormData(prev => ({
      ...prev,
      pricing_profile: {
        ...prev.pricing_profile,
        transport_mode: transportMode,
        container_price_eur:
          transportMode === 'container' && !prev.pricing_profile.container_price_eur
            ? defaultPricingProfileFormData.container_price_eur
            : prev.pricing_profile.container_price_eur,
        container_volume_m3:
          transportMode === 'container' && !prev.pricing_profile.container_volume_m3
            ? defaultPricingProfileFormData.container_volume_m3
            : prev.pricing_profile.container_volume_m3,
        truck_multiplier_factor:
          transportMode === 'truck' && !prev.pricing_profile.truck_multiplier_factor
            ? DEFAULT_TRUCK_MULTIPLIER_FACTOR.toString()
            : prev.pricing_profile.truck_multiplier_factor,
      },
    }));
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setEditingSupplier(null);
    setAdditionalEmailInput('');
    setError(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (supplier: SupplierWithMaterials) => {
    setAdditionalEmailInput('');
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      email: supplier.email,
      additional_emails: supplier.additional_emails ?? [],
      material_ids: supplier.available_materials?.map(material => material.id) ?? [],
      preferred_language: normalizeSupplierLanguage(supplier.preferred_language),
      pricing_profile: toPricingProfileFormData(supplier.pricing_profile),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const pendingAdditionalEmails = parseEmailList(additionalEmailInput);
    const submittedAdditionalEmails = Array.from(
      new Set([...formData.additional_emails, ...pendingAdditionalEmails])
    )
      .filter((email) => email !== formData.email.trim().toLowerCase())
      .slice(0, MAX_SUPPLIER_ADDITIONAL_EMAILS);

    let result;
    const pricingProfileInput = pricingFormToInput(formData.pricing_profile);
    if (editingSupplier) {
      result = await updateSupplier(editingSupplier.id, {
        name: formData.name,
        email: formData.email,
        additional_emails: submittedAdditionalEmails,
        material_ids: formData.material_ids,
        preferred_language: formData.preferred_language,
        pricing_profile: pricingProfileInput,
      });
    } else {
      result = await createSupplier({
        name: formData.name,
        email: formData.email,
        additional_emails: submittedAdditionalEmails,
        material_ids: formData.material_ids,
        preferred_language: formData.preferred_language,
        pricing_profile: pricingProfileInput,
      });
    }

    if (result.error) {
      setError(result.error._form?.[0] || 'An error occurred');
    } else {
      window.location.reload();
    }

    setLoading(false);
  };

  const handleDelete = async (supplierId: string) => {
    if (!confirm('Are you sure you want to delete this supplier?')) {
      return;
    }

    setLoading(true);
    const result = await deleteSupplier(supplierId);

    if (result.error) {
      setError(result.error._form?.[0] || 'An error occurred');
    } else {
      setSuppliers(prev => prev.filter(s => s.id !== supplierId));
    }

    setLoading(false);
  };

  const handleMaterialToggle = (materialId: string, checked: boolean) => {
    const updatedMaterialIds = checked
      ? [...formData.material_ids, materialId]
      : formData.material_ids.filter(id => id !== materialId);

    updateFormData('material_ids', updatedMaterialIds);
  };


  const addAdditionalEmails = (rawInput: string) => {
    const parsedEmails = parseEmailList(rawInput);
    if (parsedEmails.length === 0) {
      return;
    }

    const primaryEmail = formData.email.trim().toLowerCase();
    const uniqueEmails = Array.from(new Set([...formData.additional_emails, ...parsedEmails]))
      .filter((email) => email !== primaryEmail);

    if (uniqueEmails.length > MAX_SUPPLIER_ADDITIONAL_EMAILS) {
      setError(`Maximum ${MAX_SUPPLIER_ADDITIONAL_EMAILS} additional emails per supplier.`);
      return;
    }

    updateFormData('additional_emails', uniqueEmails);
    setAdditionalEmailInput('');
  };

  const removeAdditionalEmail = (email: string) => {
    updateFormData(
      'additional_emails',
      formData.additional_emails.filter((additionalEmail) => additionalEmail !== email)
    );
  };

  const handleSupplierLanguageChange = async (supplierId: string, value: string) => {
    const preferredLanguage = normalizeSupplierLanguage(value);
    const previousSuppliers = suppliers;

    setError(null);
    setSuppliers(prev =>
      prev.map(supplier =>
        supplier.id === supplierId
          ? { ...supplier, preferred_language: preferredLanguage }
          : supplier
      )
    );

    const result = await updateSupplier(supplierId, { preferred_language: preferredLanguage });

    if (result.error) {
      setSuppliers(previousSuppliers);
      setError(result.error._form?.[0] || 'Supplier language could not be updated');
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Suppliers</h2>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          New supplier
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Pricing</TableHead>
                <TableHead className="w-[34%]">Materials</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">{supplier.name}</span>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(supplier)}
                          disabled={loading}
                          aria-label={`Edit ${supplier.name}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(supplier.id)}
                          disabled={loading}
                          aria-label={`Delete ${supplier.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <div className="space-y-0.5">
                      <div>{supplier.email}</div>
                      {(supplier.additional_emails?.length ?? 0) > 0 && (
                        <div
                          className="text-xs"
                          title={supplier.additional_emails.join(', ')}
                        >
                          +{supplier.additional_emails.length} extra
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={normalizeSupplierLanguage(supplier.preferred_language)}
                      onValueChange={(value) => handleSupplierLanguageChange(supplier.id, value)}
                    >
                      <SelectTrigger
                        aria-label={`Preferred language for ${supplier.name}`}
                        className="w-[170px]"
                        size="sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPLIER_LANGUAGES.map((language) => (
                          <SelectItem key={language} value={language}>
                            {SUPPLIER_LANGUAGE_LABELS[language]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.pricing_profile ? (
                      <div className="space-y-0.5 text-sm">
                        <div className="font-medium text-foreground">
                          {formatTransportMode(supplier.pricing_profile.transport_mode)}
                        </div>
                        <div className="text-xs">
                          Margin {Number(supplier.pricing_profile.product_margin_factor).toFixed(3)} · Retail ×{Number(supplier.pricing_profile.retail_multiplier_factor).toFixed(3)}
                        </div>
                      </div>
                    ) : (
                      'Default container'
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-md">
                    <span className="line-clamp-2">
                      {supplier.available_materials && supplier.available_materials.length > 0
                        ? supplier.available_materials.map((material) => material.name).join(', ')
                        : 'No materials'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {suppliers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No suppliers created yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Supplier Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSupplier ? 'Edit supplier' : 'New supplier'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Create or edit a supplier and optionally link materials.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="supplier-name">Name *</Label>
              <Input
                id="supplier-name"
                value={formData.name}
                onChange={(e) => updateFormData('name', e.target.value)}
                placeholder="e.g. Acme Glass Co."
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supplier-email">Email *</Label>
              <Input
                id="supplier-email"
                type="email"
                value={formData.email}
                onChange={(e) => updateFormData('email', e.target.value)}
                placeholder="e.g. info@supplier.com"
                required
              />
            </div>


            <div className="space-y-2">
              <Label htmlFor="supplier-additional-email">Additional emails</Label>
              <div className="flex gap-2">
                <Input
                  id="supplier-additional-email"
                  type="text"
                  value={additionalEmailInput}
                  onChange={(e) => setAdditionalEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addAdditionalEmails(additionalEmailInput);
                    }
                  }}
                  onPaste={(e) => {
                    const pastedText = e.clipboardData.getData('text');
                    if (parseEmailList(pastedText).length > 1) {
                      e.preventDefault();
                      addAdditionalEmails(pastedText);
                    }
                  }}
                  placeholder="e.g. estimating@supplier.com"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => addAdditionalEmails(additionalEmailInput)}
                  disabled={formData.additional_emails.length >= MAX_SUPPLIER_ADDITIONAL_EMAILS}
                >
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Optional. RFQ invites and supplier thread notifications are sent to the primary email plus these addresses.
              </p>
              {formData.additional_emails.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.additional_emails.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-xs"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => removeAdditionalEmail(email)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Remove ${email}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supplier-language">Preferred language *</Label>
              <Select
                value={formData.preferred_language}
                onValueChange={(value) =>
                  updateFormData('preferred_language', normalizeSupplierLanguage(value))
                }
              >
                <SelectTrigger id="supplier-language" className="w-full">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPLIER_LANGUAGES.map((language) => (
                    <SelectItem key={language} value={language}>
                      {SUPPLIER_LANGUAGE_LABELS[language]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Supplier emails and their magic-link page use this language.
              </p>
            </div>

              </div>
              <div className="space-y-4">
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <h3 className="text-sm font-medium">Pricing profile</h3>
                <p className="text-xs text-muted-foreground">
                  Supplier-specific transport and retail calculation settings. New quotes use these values.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="supplier-transport-mode">Transport calculation *</Label>
                <Select
                  value={formData.pricing_profile.transport_mode}
                  onValueChange={(value) => handleTransportModeChange(value as TransportMode)}
                >
                  <SelectTrigger id="supplier-transport-mode" className="w-full">
                    <SelectValue placeholder="Select transport calculation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Geen transport</SelectItem>
                    <SelectItem value="container">Container</SelectItem>
                    <SelectItem value="truck">Camion / vrachtwagen</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.pricing_profile.transport_mode === 'container' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="container-price">Container price (€)</Label>
                    <Input
                      id="container-price"
                      inputMode="decimal"
                      value={formData.pricing_profile.container_price_eur}
                      onChange={(event) => updatePricingProfile('container_price_eur', event.target.value)}
                      placeholder="7500"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="container-volume">Container volume (m³)</Label>
                    <Input
                      id="container-volume"
                      inputMode="decimal"
                      value={formData.pricing_profile.container_volume_m3}
                      onChange={(event) => updatePricingProfile('container_volume_m3', event.target.value)}
                      placeholder="67"
                      required
                    />
                  </div>
                </div>
              )}

              {formData.pricing_profile.transport_mode === 'truck' && (
                <div className="space-y-1.5">
                  <Label htmlFor="truck-multiplier">Truck multiplier</Label>
                  <Input
                    id="truck-multiplier"
                    inputMode="decimal"
                    value={formData.pricing_profile.truck_multiplier_factor}
                    onChange={(event) => updatePricingProfile('truck_multiplier_factor', event.target.value)}
                    placeholder="1.5"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Used to calculate the transport-adjusted base price: supplier base price × truck multiplier.
                  </p>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="product-margin">Product margin</Label>
                  <Input
                    id="product-margin"
                    inputMode="decimal"
                    value={formData.pricing_profile.product_margin_factor}
                    onChange={(event) => updatePricingProfile('product_margin_factor', event.target.value)}
                    placeholder="2.1"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="retail-multiplier">Retail multiplier</Label>
                  <Input
                    id="retail-multiplier"
                    inputMode="decimal"
                    value={formData.pricing_profile.retail_multiplier_factor}
                    onChange={(event) => updatePricingProfile('retail_multiplier_factor', event.target.value)}
                    placeholder="2.4"
                    required
                  />
                </div>
              </div>

              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                {formData.pricing_profile.transport_mode === 'container' && (
                  <>
                    <p className="font-medium text-foreground">Container formula</p>
                    <p>Transport cost = (container price / container volume) × supplier volume</p>
                    <p>Cost incl. transport = supplier base price × product margin + transport cost</p>
                    <p>Retail price = cost incl. transport × retail multiplier</p>
                  </>
                )}
                {formData.pricing_profile.transport_mode === 'truck' && (
                  <>
                    <p className="font-medium text-foreground">Truck formula</p>
                    <p>Transport-adjusted base price = supplier base price × truck multiplier</p>
                    <p>Retail price = transport-adjusted base price × product margin × retail multiplier</p>
                  </>
                )}
                {formData.pricing_profile.transport_mode === 'none' && (
                  <>
                    <p className="font-medium text-foreground">No transport formula</p>
                    <p>Retail price = supplier base price × product margin × retail multiplier</p>
                  </>
                )}
              </div>
            </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Link materials (optional)</Label>
              {materials.length === 0 ? (
                <p className="text-sm text-muted-foreground">No materials created yet.</p>
              ) : (
                <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                  {materials.map((material) => (
                    <div key={material.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`material-${material.id}`}
                        checked={formData.material_ids.includes(material.id)}
                        onCheckedChange={(checked) =>
                          handleMaterialToggle(material.id, checked === true)
                        }
                      />
                      <Label htmlFor={`material-${material.id}`} className="text-sm">
                        {material.name}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => { setDialogOpen(false); setAdditionalEmailInput(''); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Loading...' : (editingSupplier ? 'Update' : 'Create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
