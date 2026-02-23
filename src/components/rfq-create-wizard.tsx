'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createRfq } from '@/actions/rfq';
import { getActiveMaterials, getSuppliersForMaterial } from '@/actions/materials';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import type { Material, Supplier } from '@/types';

interface RfqCreateWizardProps {
  children?: React.ReactNode;
}

interface WizardData {
  customer_name: string;
  material_id: string;
  material_name: string;
  finish: string;
  supplier_ids: string[];
  length: string;
  width: string;
  height: string;
  thickness: string;
  shape: string;
  notes: string;
}

const initialData: WizardData = {
  customer_name: '',
  material_id: '',
  material_name: '',
  finish: '',
  supplier_ids: [],
  length: '',
  width: '',
  height: '',
  thickness: '',
  shape: '',
  notes: '',
};

export function RfqCreateWizard({ children }: RfqCreateWizardProps) {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WizardData>(initialData);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  const router = useRouter();

  const loadMaterials = useCallback(async () => {
    setMaterialsLoading(true);
    setMaterialsError(null);
    try {
      const materialsData = await getActiveMaterials();
      setMaterials(materialsData);
    } catch (error) {
      console.error('Failed to load materials:', error);
      setMaterials([]);
      setMaterialsError('Materialen konden niet geladen worden.');
    } finally {
      setMaterialsLoading(false);
    }
  }, []);

  const loadSuppliers = useCallback(async (materialId: string) => {
    setSuppliersLoading(true);
    try {
      const suppliersData = await getSuppliersForMaterial(materialId);
      setSuppliers(suppliersData);
    } catch (error) {
      console.error('Failed to load suppliers:', error);
      setSuppliers([]);
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadMaterials();
    }
  }, [open, loadMaterials]);

  useEffect(() => {
    if (data.material_id) {
      loadSuppliers(data.material_id);
      return;
    }
    setSuppliers([]);
  }, [data.material_id, loadSuppliers]);

  const updateData = <K extends keyof WizardData>(field: K, value: WizardData[K]) => {
    setData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: [] }));
    }
  };

  const handleMaterialChange = (materialId: string) => {
    const material = materials.find((item) => item.id === materialId);
    if (!material) return;

    updateData('material_id', materialId);
    updateData('material_name', material.name);
    updateData('finish', material.finish_options.length === 0 ? 'N.v.t.' : '');
    updateData('supplier_ids', []);
    setSelectedMaterial(material);
    setSuppliers([]);
  };

  const handleSupplierToggle = (supplierId: string, checked: boolean) => {
    const updatedSupplierIds = checked
      ? [...data.supplier_ids, supplierId]
      : data.supplier_ids.filter((id) => id !== supplierId);
    updateData('supplier_ids', updatedSupplierIds);
  };

  const validateCurrentStep = (): boolean => {
    const stepErrors: Record<string, string[]> = {};

    if (currentStep === 0) {
      if (!data.material_id) {
        stepErrors.material_id = ['Material is required'];
      }
      if (selectedMaterial?.finish_options.length && !data.finish) {
        stepErrors.finish = ['Finish is required'];
      }
    } else if (currentStep === 1) {
      if (data.supplier_ids.length === 0) {
        stepErrors.supplier_ids = ['Select at least one supplier'];
      }
    } else if (currentStep === 2) {
      if (!data.length || Number(data.length) <= 0) {
        stepErrors.length = ['Length must be positive'];
      }
      if (!data.width || Number(data.width) <= 0) {
        stepErrors.width = ['Width must be positive'];
      }
      if (!data.height || Number(data.height) <= 0) {
        stepErrors.height = ['Height must be positive'];
      }
      if (!data.thickness || Number(data.thickness) <= 0) {
        stepErrors.thickness = ['Thickness must be positive'];
      }
      if (!data.shape.trim()) {
        stepErrors.shape = ['Shape is required'];
      }
    }

    setErrors(stepErrors);
    return Object.keys(stepErrors).length === 0;
  };

  const nextStep = () => {
    if (validateCurrentStep()) {
      setCurrentStep((prev) => Math.min(prev + 1, 2));
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    if (!validateCurrentStep()) return;

    setLoading(true);
    setErrors({});

    const input = {
      customer_name: data.customer_name || null,
      material: data.material_name,
      material_id: data.material_id,
      finish: data.finish,
      length: Number(data.length),
      width: Number(data.width),
      height: Number(data.height),
      thickness: Number(data.thickness),
      shape: data.shape,
      notes: data.notes || null,
      supplier_ids: data.supplier_ids,
    };

    try {
      const result = await createRfq(input);

      if (result.error) {
        setErrors(result.error as Record<string, string[]>);
        return;
      }

      setOpen(false);
      setCurrentStep(0);
      setData(initialData);
      setSelectedMaterial(null);

      if (result.data) {
        router.push(`/dashboard/rfqs/${result.data.id}`);
      }
    } catch (error) {
      console.error('Failed to create RFQ:', error);
      setErrors({ _form: ['Could not create request. Please try again.'] });
    } finally {
      setLoading(false);
    }
  };

  const resetDialog = () => {
    setCurrentStep(0);
    setData(initialData);
    setErrors({});
    setSelectedMaterial(null);
    setSuppliers([]);
    setMaterialsError(null);
  };

  const stepTitles = ['Material & finish', 'Suppliers', 'Details & dimensions'];

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        setOpen(newOpen);
        if (!newOpen) {
          resetDialog();
        }
      }}
    >
      <DialogTrigger asChild>{children || <Button>New request</Button>}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New request for quotation - {stepTitles[currentStep]}</DialogTitle>
          <DialogDescription className="sr-only">
            Complete the steps to create a new request for quotation.
          </DialogDescription>
          <div className="mt-2 flex items-center space-x-2">
            {stepTitles.map((_, index) => (
              <div
                key={index}
                className={`h-2 flex-1 rounded-full ${index <= currentStep ? 'bg-primary' : 'bg-muted'}`}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="min-h-[400px] space-y-4">
          {currentStep === 0 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="customer_name">Customer name (optional)</Label>
                <Input
                  id="customer_name"
                  value={data.customer_name}
                  onChange={(e) => updateData('customer_name', e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="material">Material *</Label>
                <Select
                  value={data.material_id}
                  onValueChange={handleMaterialChange}
                  disabled={materialsLoading || materials.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        materialsLoading
                          ? 'Loading materials...'
                          : materials.length === 0
                            ? 'No materials available'
                            : 'Select a material'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="z-[70]">
                    {materials.map((material) => (
                      <SelectItem key={material.id} value={material.id}>
                        {material.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {materialsError && <p className="text-destructive text-xs">{materialsError}</p>}
                {!materialsLoading && !materialsError && materials.length === 0 && (
                  <p className="text-muted-foreground text-xs">
                    Add materials first via Admin &gt; Materials.
                  </p>
                )}
                {errors.material_id && <p className="text-destructive text-xs">{errors.material_id[0]}</p>}
              </div>

              {selectedMaterial && selectedMaterial.finish_options.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="finish">Finish *</Label>
                  <Select value={data.finish} onValueChange={(value) => updateData('finish', value)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a finish" />
                    </SelectTrigger>
                    <SelectContent className="z-[70]">
                      {selectedMaterial.finish_options.map((finish) => (
                        <SelectItem key={finish} value={finish}>
                          {finish}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.finish && <p className="text-destructive text-xs">{errors.finish[0]}</p>}
                </div>
              )}

              {selectedMaterial && selectedMaterial.finish_options.length === 0 && (
                <p className="text-muted-foreground text-xs">
                  No finishes are configured for this material.
                </p>
              )}
            </>
          )}

          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <Label>Select suppliers *</Label>
                <p className="mb-3 text-sm text-muted-foreground">
                  Choose one or more suppliers for {data.material_name || 'this material'}.
                </p>
              </div>

              {suppliersLoading ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">Loading suppliers...</p>
                  </CardContent>
                </Card>
              ) : suppliers.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                      No suppliers available for this material.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="max-h-[300px] space-y-2 overflow-y-auto">
                  {suppliers.map((supplier) => (
                    <Card key={supplier.id} className="p-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`supplier-${supplier.id}`}
                          checked={data.supplier_ids.includes(supplier.id)}
                          onCheckedChange={(checked) =>
                            handleSupplierToggle(supplier.id, checked as boolean)
                          }
                        />
                        <div className="flex-1">
                          <Label htmlFor={`supplier-${supplier.id}`} className="cursor-pointer font-medium">
                            {supplier.name}
                          </Label>
                          <p className="text-xs text-muted-foreground">{supplier.email}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {errors.supplier_ids && <p className="text-destructive text-xs">{errors.supplier_ids[0]}</p>}
            </div>
          )}

          {currentStep === 2 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="shape">Shape *</Label>
                <Input
                  id="shape"
                  value={data.shape}
                  onChange={(e) => updateData('shape', e.target.value)}
                  placeholder="e.g. plank, block"
                  aria-invalid={Boolean(errors.shape)}
                />
                {errors.shape && <p className="text-destructive text-xs">{errors.shape[0]}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="length">Length (mm) *</Label>
                  <Input
                    id="length"
                    type="number"
                    step="any"
                    value={data.length}
                    onChange={(e) => updateData('length', e.target.value)}
                    aria-invalid={Boolean(errors.length)}
                  />
                  {errors.length && <p className="text-destructive text-xs">{errors.length[0]}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="width">Width (mm) *</Label>
                  <Input
                    id="width"
                    type="number"
                    step="any"
                    value={data.width}
                    onChange={(e) => updateData('width', e.target.value)}
                    aria-invalid={Boolean(errors.width)}
                  />
                  {errors.width && <p className="text-destructive text-xs">{errors.width[0]}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="height">Height (mm) *</Label>
                  <Input
                    id="height"
                    type="number"
                    step="any"
                    value={data.height}
                    onChange={(e) => updateData('height', e.target.value)}
                    aria-invalid={Boolean(errors.height)}
                  />
                  {errors.height && <p className="text-destructive text-xs">{errors.height[0]}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="thickness">Thickness (mm) *</Label>
                  <Input
                    id="thickness"
                    type="number"
                    step="any"
                    value={data.thickness}
                    onChange={(e) => updateData('thickness', e.target.value)}
                    aria-invalid={Boolean(errors.thickness)}
                  />
                  {errors.thickness && <p className="text-destructive text-xs">{errors.thickness[0]}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={data.notes}
                  onChange={(e) => updateData('notes', e.target.value)}
                />
              </div>
            </>
          )}

          {errors._form && <p className="text-destructive text-sm">{errors._form[0]}</p>}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {currentStep > 0 && (
              <Button type="button" variant="outline" onClick={prevStep}>
                Previous
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {currentStep < 2 ? (
              <Button type="button" onClick={nextStep}>
                Next
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Loading...' : 'Create'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
