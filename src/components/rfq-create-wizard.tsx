'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createRfq } from '@/actions/rfq';
import { getActiveMaterials, getSuppliersForMaterial } from '@/actions/materials';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  
  // Data for dropdowns
  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  
  const router = useRouter();

  // Load materials when dialog opens
  useEffect(() => {
    if (open) {
      loadMaterials();
    }
  }, [open]);

  // Load suppliers when material changes
  useEffect(() => {
    if (data.material_id) {
      loadSuppliers(data.material_id);
    }
  }, [data.material_id]);

  const loadMaterials = async () => {
    try {
      const materialsData = await getActiveMaterials();
      setMaterials(materialsData);
    } catch (error) {
      console.error('Failed to load materials:', error);
    }
  };

  const loadSuppliers = async (materialId: string) => {
    try {
      const suppliersData = await getSuppliersForMaterial(materialId);
      setSuppliers(suppliersData);
    } catch (error) {
      console.error('Failed to load suppliers:', error);
      setSuppliers([]);
    }
  };

  const updateData = (field: keyof WizardData, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
    // Clear errors for the field being updated
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: [] }));
    }
  };

  const handleMaterialChange = (materialId: string) => {
    const material = materials.find(m => m.id === materialId);
    if (material) {
      updateData('material_id', materialId);
      updateData('material_name', material.name);
      updateData('finish', ''); // Reset finish when material changes
      updateData('supplier_ids', []); // Reset suppliers when material changes
      setSelectedMaterial(material);
    }
  };

  const handleSupplierToggle = (supplierId: string, checked: boolean) => {
    const updatedSupplierIds = checked
      ? [...data.supplier_ids, supplierId]
      : data.supplier_ids.filter(id => id !== supplierId);
    updateData('supplier_ids', updatedSupplierIds);
  };

  const validateCurrentStep = (): boolean => {
    const stepErrors: Record<string, string[]> = {};

    if (currentStep === 0) {
      // Step 1: Material & Finish
      if (!data.material_id) {
        stepErrors.material_id = ['Materiaal is verplicht'];
      }
      if (!data.finish) {
        stepErrors.finish = ['Afwerking is verplicht'];
      }
    } else if (currentStep === 1) {
      // Step 2: Suppliers
      if (data.supplier_ids.length === 0) {
        stepErrors.supplier_ids = ['Selecteer minimaal één leverancier'];
      }
    } else if (currentStep === 2) {
      // Step 3: Details
      if (!data.length || Number(data.length) <= 0) {
        stepErrors.length = ['Lengte moet positief zijn'];
      }
      if (!data.width || Number(data.width) <= 0) {
        stepErrors.width = ['Breedte moet positief zijn'];
      }
      if (!data.height || Number(data.height) <= 0) {
        stepErrors.height = ['Hoogte moet positief zijn'];
      }
      if (!data.thickness || Number(data.thickness) <= 0) {
        stepErrors.thickness = ['Dikte moet positief zijn'];
      }
      if (!data.shape.trim()) {
        stepErrors.shape = ['Vorm is verplicht'];
      }
    }

    setErrors(stepErrors);
    return Object.keys(stepErrors).length === 0;
  };

  const nextStep = () => {
    if (validateCurrentStep()) {
      setCurrentStep(prev => Math.min(prev + 1, 2));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
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

    const result = await createRfq(input);

    if (result.error) {
      setErrors(result.error as Record<string, string[]>);
      setLoading(false);
      return;
    }

    // Reset and close
    setOpen(false);
    setCurrentStep(0);
    setData(initialData);
    setSelectedMaterial(null);
    setLoading(false);
    
    if (result.data) {
      router.push(`/dashboard/rfqs/${result.data.id}`);
    }
    router.refresh();
  };

  const resetDialog = () => {
    setCurrentStep(0);
    setData(initialData);
    setSelectedMaterial(null);
    setErrors({});
  };

  const stepTitles = [
    'Materiaal & Afwerking',
    'Leveranciers',
    'Details & Afmetingen'
  ];

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) {
        resetDialog();
      }
    }}>
      <DialogTrigger asChild>
        {children || <Button>Nieuwe aanvraag</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Nieuwe prijsaanvraag - {stepTitles[currentStep]}
          </DialogTitle>
          <div className="flex items-center space-x-2 mt-2">
            {stepTitles.map((_, index) => (
              <div
                key={index}
                className={`h-2 flex-1 rounded-full ${
                  index <= currentStep ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="space-y-4 min-h-[400px]">
          {/* Step 1: Material & Finish */}
          {currentStep === 0 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="customer_name">Klantnaam (optioneel)</Label>
                <Input
                  id="customer_name"
                  value={data.customer_name}
                  onChange={(e) => updateData('customer_name', e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="material">Materiaal *</Label>
                <Select value={data.material_id} onValueChange={handleMaterialChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer een materiaal" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((material) => (
                      <SelectItem key={material.id} value={material.id}>
                        {material.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.material_id && <p className="text-destructive text-xs">{errors.material_id[0]}</p>}
              </div>

              {selectedMaterial && selectedMaterial.finish_options.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="finish">Afwerking *</Label>
                  <Select value={data.finish} onValueChange={(value) => updateData('finish', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecteer een afwerking" />
                    </SelectTrigger>
                    <SelectContent>
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
            </>
          )}

          {/* Step 2: Suppliers */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <Label>Leveranciers selecteren *</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Kies één of meerdere leveranciers voor dit materiaal ({data.material_name})
                </p>
              </div>

              {suppliers.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                      Geen leveranciers beschikbaar voor dit materiaal
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
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
                          <Label 
                            htmlFor={`supplier-${supplier.id}`}
                            className="font-medium cursor-pointer"
                          >
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

          {/* Step 3: Details */}
          {currentStep === 2 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="shape">Vorm *</Label>
                <Input
                  id="shape"
                  value={data.shape}
                  onChange={(e) => updateData('shape', e.target.value)}
                  placeholder="bijv. plank, blok"
                  aria-invalid={Boolean(errors.shape)}
                />
                {errors.shape && <p className="text-destructive text-xs">{errors.shape[0]}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="length">Lengte (mm) *</Label>
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
                  <Label htmlFor="width">Breedte (mm) *</Label>
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
                  <Label htmlFor="height">Hoogte (mm) *</Label>
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
                  <Label htmlFor="thickness">Dikte (mm) *</Label>
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
                <Label htmlFor="notes">Opmerkingen</Label>
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
                Vorige
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Annuleren
            </Button>
            {currentStep < 2 ? (
              <Button type="button" onClick={nextStep}>
                Volgende
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Bezig...' : 'Aanmaken'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}