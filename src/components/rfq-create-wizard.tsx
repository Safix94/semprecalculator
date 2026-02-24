'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getActiveMaterials, getSuppliersForMaterial } from '@/actions/materials';
import { getProductTypes } from '@/actions/product-types';
import { createRfq, uploadAttachment } from '@/actions/rfq';
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
import type { Material, ProductType, Supplier } from '@/types';

interface RfqCreateWizardProps {
  children?: React.ReactNode;
}

interface WizardData {
  customer_name: string;
  product_type: string;
  material_id: string;
  material_name: string;
  finish: string;
  material_id_table_top: string;
  material_table_top: string;
  finish_table_top: string;
  material_id_table_foot: string;
  material_table_foot: string;
  finish_table_foot: string;
  supplier_ids: string[];
  diameter: string;
  length: string;
  width: string;
  height: string;
  thickness: string;
  quantity: string;
  shape: string;
  notes: string;
}

const initialData: WizardData = {
  customer_name: '',
  product_type: '',
  material_id: '',
  material_name: '',
  finish: '',
  material_id_table_top: '',
  material_table_top: '',
  finish_table_top: '',
  material_id_table_foot: '',
  material_table_foot: '',
  finish_table_foot: '',
  supplier_ids: [],
  diameter: '',
  length: '',
  width: '',
  height: '',
  thickness: '',
  quantity: '1',
  shape: 'Rectangular',
  notes: '',
};

const attachmentExtensions = new Set(['skp', 'pdf', 'jpg', 'jpeg', 'png', 'dwg']);

function isAllowedAttachment(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension) {
    return false;
  }
  return attachmentExtensions.has(extension);
}

export function RfqCreateWizard({ children }: RfqCreateWizardProps) {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WizardData>(initialData);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);

  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [productTypesLoading, setProductTypesLoading] = useState(false);
  const [productTypesError, setProductTypesError] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliersError, setSuppliersError] = useState<string | null>(null);

  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const isTablesType = data.product_type === 'Tables';

  const selectedMaterial = useMemo(
    () => materials.find((item) => item.id === data.material_id) ?? null,
    [data.material_id, materials]
  );
  const selectedTableTopMaterial = useMemo(
    () => materials.find((item) => item.id === data.material_id_table_top) ?? null,
    [data.material_id_table_top, materials]
  );
  const selectedTableFootMaterial = useMemo(
    () => materials.find((item) => item.id === data.material_id_table_foot) ?? null,
    [data.material_id_table_foot, materials]
  );

  const availableFinishOptions = (selectedMaterial?.finish_options ?? [])
    .map((finish) => finish.trim())
    .filter((finish) => finish.length > 0);
  const tableTopFinishOptions = (selectedTableTopMaterial?.finish_options ?? [])
    .map((finish) => finish.trim())
    .filter((finish) => finish.length > 0);
  const tableFootFinishOptions = (selectedTableFootMaterial?.finish_options ?? [])
    .map((finish) => finish.trim())
    .filter((finish) => finish.length > 0);

  const loadMaterials = useCallback(async () => {
    setMaterialsLoading(true);
    setMaterialsError(null);

    try {
      const result = await getActiveMaterials();
      if ('error' in result) {
        setMaterials([]);
        setMaterialsError(result.error);
        return;
      }

      setMaterials(result.data);
    } catch (error) {
      console.error('Failed to load materials:', error);
      setMaterials([]);
      setMaterialsError('Materialen konden niet geladen worden.');
    } finally {
      setMaterialsLoading(false);
    }
  }, []);

  const loadProductTypeOptions = useCallback(async () => {
    setProductTypesLoading(true);
    setProductTypesError(null);

    try {
      const result = await getProductTypes();
      if ('error' in result) {
        setProductTypes([]);
        setProductTypesError(result.error);
        return;
      }

      setProductTypes(result.data);
    } catch (error) {
      console.error('Failed to load product types:', error);
      setProductTypes([]);
      setProductTypesError('Soorten konden niet geladen worden.');
    } finally {
      setProductTypesLoading(false);
    }
  }, []);

  const loadSuppliers = useCallback(async (materialIds: string[]) => {
    const uniqueIds = [...new Set(materialIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      setSuppliers([]);
      setSuppliersError(null);
      return;
    }

    setSuppliersLoading(true);
    setSuppliersError(null);

    try {
      const results = await Promise.all(uniqueIds.map((materialId) => getSuppliersForMaterial(materialId)));

      const firstError = results.find((result) => 'error' in result);
      if (firstError && 'error' in firstError) {
        setSuppliers([]);
        setSuppliersError(firstError.error);
        return;
      }

      const supplierMap = new Map<string, Supplier>();
      for (const result of results) {
        if ('error' in result) {
          continue;
        }

        for (const supplier of result.data) {
          supplierMap.set(supplier.id, supplier);
        }
      }

      setSuppliers([...supplierMap.values()]);
    } catch (error) {
      console.error('Failed to load suppliers:', error);
      setSuppliers([]);
      setSuppliersError('Leveranciers konden niet geladen worden.');
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    void Promise.all([loadMaterials(), loadProductTypeOptions()]);
  }, [open, loadMaterials, loadProductTypeOptions]);

  useEffect(() => {
    if (isTablesType) {
      void loadSuppliers([data.material_id_table_top, data.material_id_table_foot]);
      return;
    }

    if (data.material_id) {
      void loadSuppliers([data.material_id]);
      return;
    }

    setSuppliers([]);
    setSuppliersError(null);
  }, [
    data.material_id,
    data.material_id_table_top,
    data.material_id_table_foot,
    isTablesType,
    loadSuppliers,
  ]);

  const updateData = <K extends keyof WizardData>(field: K, value: WizardData[K]) => {
    setData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: [] }));
    }
  };

  const handleProductTypeChange = (productType: string) => {
    updateData('product_type', productType);
    updateData('supplier_ids', []);
    setSuppliers([]);
    setSuppliersError(null);

    if (productType === 'Tables') {
      updateData('material_id', '');
      updateData('material_name', '');
      updateData('finish', '');
      return;
    }

    updateData('material_id_table_top', '');
    updateData('material_table_top', '');
    updateData('finish_table_top', '');
    updateData('material_id_table_foot', '');
    updateData('material_table_foot', '');
    updateData('finish_table_foot', '');
  };

  const handleMaterialChange = (materialId: string) => {
    const material = materials.find((item) => item.id === materialId);
    if (!material) return;

    const materialFinishOptions = material.finish_options
      .map((finish) => finish.trim())
      .filter((finish) => finish.length > 0);

    updateData('material_id', materialId);
    updateData('material_name', material.name);
    updateData('finish', materialFinishOptions.length === 0 ? 'N.v.t.' : '');
    updateData('supplier_ids', []);
    setSuppliers([]);
    setSuppliersError(null);
  };

  const handleTableTopMaterialChange = (materialId: string) => {
    const material = materials.find((item) => item.id === materialId);
    if (!material) return;

    const finishOptions = material.finish_options
      .map((finish) => finish.trim())
      .filter((finish) => finish.length > 0);

    updateData('material_id_table_top', materialId);
    updateData('material_table_top', material.name);
    updateData('finish_table_top', finishOptions.length === 0 ? 'N.v.t.' : '');
    updateData('supplier_ids', []);
    setSuppliers([]);
    setSuppliersError(null);
  };

  const handleTableFootMaterialChange = (materialId: string) => {
    const material = materials.find((item) => item.id === materialId);
    if (!material) return;

    const finishOptions = material.finish_options
      .map((finish) => finish.trim())
      .filter((finish) => finish.length > 0);

    updateData('material_id_table_foot', materialId);
    updateData('material_table_foot', material.name);
    updateData('finish_table_foot', finishOptions.length === 0 ? 'N.v.t.' : '');
    updateData('supplier_ids', []);
    setSuppliers([]);
    setSuppliersError(null);
  };

  const handleSupplierToggle = (supplierId: string, checked: boolean) => {
    const updatedSupplierIds = checked
      ? [...data.supplier_ids, supplierId]
      : data.supplier_ids.filter((id) => id !== supplierId);
    updateData('supplier_ids', updatedSupplierIds);
  };

  const handleShapeChange = (shape: string) => {
    updateData('shape', shape);

    if (shape === 'Round') {
      if (!data.diameter && (data.length || data.width)) {
        updateData('diameter', data.length || data.width);
      }
      updateData('length', '');
      updateData('width', '');
      return;
    }

    if (data.diameter) {
      if (!data.length) {
        updateData('length', data.diameter);
      }
      if (!data.width) {
        updateData('width', data.diameter);
      }
    }
    updateData('diameter', '');
  };

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    const invalidFile = selectedFiles.find((file) => !isAllowedAttachment(file));
    if (invalidFile) {
      setErrors({ _form: [`Ongeldig bestandstype voor ${invalidFile.name}. Gebruik SKP, PDF, JPG, PNG of DWG.`] });
      event.target.value = '';
      return;
    }

    setAttachments((prev) => [...prev, ...selectedFiles]);
    if (errors._form) {
      setErrors((prev) => ({ ...prev, _form: [] }));
    }
    event.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  };

  const validateCurrentStep = (): boolean => {
    const stepErrors: Record<string, string[]> = {};

    if (currentStep === 0) {
      if (isTablesType) {
        if (!data.material_id_table_top) {
          stepErrors.material_id_table_top = ['Table top material is required'];
        }

        if (!data.material_id_table_foot) {
          stepErrors.material_id_table_foot = ['Table foot material is required'];
        }

        if (tableTopFinishOptions.length > 0 && !data.finish_table_top) {
          stepErrors.finish_table_top = ['Table top finish is required'];
        }

        if (tableFootFinishOptions.length > 0 && !data.finish_table_foot) {
          stepErrors.finish_table_foot = ['Table foot finish is required'];
        }
      } else {
        if (!data.material_id) {
          stepErrors.material_id = ['Material is required'];
        }
        if (availableFinishOptions.length > 0 && !data.finish) {
          stepErrors.finish = ['Finish is required'];
        }
      }
    } else if (currentStep === 1) {
      if (data.supplier_ids.length === 0) {
        stepErrors.supplier_ids = ['Select at least one supplier'];
      }
    } else if (currentStep === 2) {
      const isRound = data.shape === 'Round';

      if (!data.shape) {
        stepErrors.shape = ['Shape is required'];
      }

      if (isRound) {
        if (!data.diameter || Number(data.diameter) <= 0) {
          stepErrors.diameter = ['Diameter must be positive'];
        }
        if (!data.height || Number(data.height) <= 0) {
          stepErrors.height = ['Height must be positive'];
        }
        if (data.thickness && Number(data.thickness) < 0) {
          stepErrors.thickness = ['Thickness must be zero or positive'];
        }
      } else {
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
      }

      const quantityValue = Number(data.quantity);
      if (!data.quantity || !Number.isInteger(quantityValue) || quantityValue < 1) {
        stepErrors.quantity = ['Quantity must be a whole number of at least 1'];
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

    const isRound = data.shape === 'Round';
    const diameter = Number(data.diameter);
    const thicknessValue = data.thickness === '' ? 0 : Number(data.thickness);

    const materialSummary = isTablesType
      ? [data.material_table_top, data.material_table_foot].filter(Boolean).join(' / ')
      : data.material_name;
    const finishSummary = isTablesType
      ? [data.finish_table_top, data.finish_table_foot].filter(Boolean).join(' / ')
      : data.finish;

    const input = {
      customer_name: data.customer_name || null,
      product_type: data.product_type || null,
      material: materialSummary,
      material_id: isTablesType ? data.material_id_table_top || null : data.material_id,
      material_id_table_top: isTablesType ? data.material_id_table_top || null : null,
      material_id_table_foot: isTablesType ? data.material_id_table_foot || null : null,
      material_table_top: isTablesType ? data.material_table_top || null : null,
      material_table_foot: isTablesType ? data.material_table_foot || null : null,
      finish: finishSummary || 'N.v.t.',
      finish_table_top: isTablesType ? data.finish_table_top || null : null,
      finish_table_foot: isTablesType ? data.finish_table_foot || null : null,
      length: isRound ? diameter : Number(data.length),
      width: isRound ? diameter : Number(data.width),
      height: Number(data.height),
      thickness: isRound ? thicknessValue : Number(data.thickness),
      quantity: Number(data.quantity),
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

      if (result.data) {
        const failedUploads: string[] = [];

        for (const attachment of attachments) {
          const formData = new FormData();
          formData.append('file', attachment);

          const uploadResult = await uploadAttachment(result.data.id, formData);
          if (uploadResult.error) {
            failedUploads.push(attachment.name);
          }
        }

        setOpen(false);
        setCurrentStep(0);
        setData(initialData);
        setSuppliers([]);
        setSuppliersError(null);
        setAttachments([]);

        if (failedUploads.length > 0) {
          console.error('Some attachments failed to upload:', failedUploads);
        }

        router.push(`/dashboard?rfq=${result.data.id}`);
        router.refresh();
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
    setSuppliers([]);
    setSuppliersError(null);
    setMaterialsError(null);
    setProductTypesError(null);
    setAttachments([]);
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
                <Label htmlFor="product_type">Type</Label>
                <Select
                  value={data.product_type || undefined}
                  onValueChange={handleProductTypeChange}
                  disabled={productTypesLoading || productTypes.length === 0}
                >
                  <SelectTrigger id="product_type" className="w-full">
                    <SelectValue
                      placeholder={
                        productTypesLoading
                          ? 'Loading types...'
                          : productTypes.length === 0
                            ? 'No types available'
                            : 'Select type (optional)'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="z-[70]">
                    {productTypes.map((type) => (
                      <SelectItem key={type.id} value={type.name}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {productTypesError && <p className="text-destructive text-xs">{productTypesError}</p>}
              </div>

              {!isTablesType && (
                <>
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

                  {selectedMaterial && availableFinishOptions.length > 0 && (
                    <div className="space-y-1.5">
                      <Label htmlFor="finish">Finish *</Label>
                      <Select value={data.finish} onValueChange={(value) => updateData('finish', value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a finish" />
                        </SelectTrigger>
                        <SelectContent className="z-[70]">
                          {availableFinishOptions.map((finish) => (
                            <SelectItem key={finish} value={finish}>
                              {finish}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.finish && <p className="text-destructive text-xs">{errors.finish[0]}</p>}
                    </div>
                  )}

                  {selectedMaterial && availableFinishOptions.length === 0 && (
                    <p className="text-muted-foreground text-xs">
                      No finishes are configured for this material.
                    </p>
                  )}
                </>
              )}

              {isTablesType && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="material-table-top">Material (Table top) *</Label>
                    <Select
                      value={data.material_id_table_top}
                      onValueChange={handleTableTopMaterialChange}
                      disabled={materialsLoading || materials.length === 0}
                    >
                      <SelectTrigger className="w-full" id="material-table-top">
                        <SelectValue
                          placeholder={
                            materialsLoading
                              ? 'Loading materials...'
                              : materials.length === 0
                                ? 'No materials available'
                                : 'Select table top material'
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
                    {errors.material_id_table_top && (
                      <p className="text-destructive text-xs">{errors.material_id_table_top[0]}</p>
                    )}
                  </div>

                  {selectedTableTopMaterial && tableTopFinishOptions.length > 0 && (
                    <div className="space-y-1.5">
                      <Label htmlFor="finish-table-top">Finish (Table top) *</Label>
                      <Select
                        value={data.finish_table_top}
                        onValueChange={(value) => updateData('finish_table_top', value)}
                      >
                        <SelectTrigger className="w-full" id="finish-table-top">
                          <SelectValue placeholder="Select a finish" />
                        </SelectTrigger>
                        <SelectContent className="z-[70]">
                          {tableTopFinishOptions.map((finish) => (
                            <SelectItem key={finish} value={finish}>
                              {finish}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.finish_table_top && (
                        <p className="text-destructive text-xs">{errors.finish_table_top[0]}</p>
                      )}
                    </div>
                  )}

                  {selectedTableTopMaterial && tableTopFinishOptions.length === 0 && (
                    <p className="text-muted-foreground text-xs">
                      No finishes are configured for the table top material.
                    </p>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="material-table-foot">Material (Table foot) *</Label>
                    <Select
                      value={data.material_id_table_foot}
                      onValueChange={handleTableFootMaterialChange}
                      disabled={materialsLoading || materials.length === 0}
                    >
                      <SelectTrigger className="w-full" id="material-table-foot">
                        <SelectValue
                          placeholder={
                            materialsLoading
                              ? 'Loading materials...'
                              : materials.length === 0
                                ? 'No materials available'
                                : 'Select table foot material'
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
                    {errors.material_id_table_foot && (
                      <p className="text-destructive text-xs">{errors.material_id_table_foot[0]}</p>
                    )}
                  </div>

                  {selectedTableFootMaterial && tableFootFinishOptions.length > 0 && (
                    <div className="space-y-1.5">
                      <Label htmlFor="finish-table-foot">Finish (Table foot) *</Label>
                      <Select
                        value={data.finish_table_foot}
                        onValueChange={(value) => updateData('finish_table_foot', value)}
                      >
                        <SelectTrigger className="w-full" id="finish-table-foot">
                          <SelectValue placeholder="Select a finish" />
                        </SelectTrigger>
                        <SelectContent className="z-[70]">
                          {tableFootFinishOptions.map((finish) => (
                            <SelectItem key={finish} value={finish}>
                              {finish}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.finish_table_foot && (
                        <p className="text-destructive text-xs">{errors.finish_table_foot[0]}</p>
                      )}
                    </div>
                  )}

                  {selectedTableFootMaterial && tableFootFinishOptions.length === 0 && (
                    <p className="text-muted-foreground text-xs">
                      No finishes are configured for the table foot material.
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <Label>Select suppliers *</Label>
                <p className="mb-3 text-sm text-muted-foreground">
                  {isTablesType
                    ? 'Choose one or more suppliers for the selected table materials.'
                    : `Choose one or more suppliers for ${data.material_name || 'this material'}.`}
                </p>
              </div>

              {suppliersLoading ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">Loading suppliers...</p>
                  </CardContent>
                </Card>
              ) : suppliersError ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-destructive">{suppliersError}</p>
                  </CardContent>
                </Card>
              ) : suppliers.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                      No suppliers available for the selected material(s).
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
                <Select value={data.shape} onValueChange={handleShapeChange}>
                  <SelectTrigger id="shape" className="w-full" aria-invalid={Boolean(errors.shape)}>
                    <SelectValue placeholder="Select a shape" />
                  </SelectTrigger>
                  <SelectContent className="z-[70]">
                    <SelectItem value="Rectangular">Rectangular</SelectItem>
                    <SelectItem value="Round">Round</SelectItem>
                  </SelectContent>
                </Select>
                {errors.shape && <p className="text-destructive text-xs">{errors.shape[0]}</p>}
              </div>

              {data.shape === 'Round' ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="diameter">Diameter (cm) *</Label>
                      <Input
                        id="diameter"
                        type="number"
                        step="any"
                        min="0"
                        value={data.diameter}
                        onChange={(e) => updateData('diameter', e.target.value)}
                        aria-invalid={Boolean(errors.diameter)}
                      />
                      {errors.diameter && <p className="text-destructive text-xs">{errors.diameter[0]}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="height">Height (cm) *</Label>
                      <Input
                        id="height"
                        type="number"
                        step="any"
                        min="0"
                        value={data.height}
                        onChange={(e) => updateData('height', e.target.value)}
                        aria-invalid={Boolean(errors.height)}
                      />
                      {errors.height && <p className="text-destructive text-xs">{errors.height[0]}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="thickness">Thickness (cm) (optional)</Label>
                      <Input
                        id="thickness"
                        type="number"
                        step="any"
                        min="0"
                        value={data.thickness}
                        onChange={(e) => updateData('thickness', e.target.value)}
                        aria-invalid={Boolean(errors.thickness)}
                      />
                      {errors.thickness && <p className="text-destructive text-xs">{errors.thickness[0]}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="quantity">Aantal stuks *</Label>
                      <Input
                        id="quantity"
                        type="number"
                        step="1"
                        min="1"
                        value={data.quantity}
                        onChange={(e) => updateData('quantity', e.target.value)}
                        aria-invalid={Boolean(errors.quantity)}
                      />
                      {errors.quantity && <p className="text-destructive text-xs">{errors.quantity[0]}</p>}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="length">Length (cm) *</Label>
                      <Input
                        id="length"
                        type="number"
                        step="any"
                        min="0"
                        value={data.length}
                        onChange={(e) => updateData('length', e.target.value)}
                        aria-invalid={Boolean(errors.length)}
                      />
                      {errors.length && <p className="text-destructive text-xs">{errors.length[0]}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="width">Width (cm) *</Label>
                      <Input
                        id="width"
                        type="number"
                        step="any"
                        min="0"
                        value={data.width}
                        onChange={(e) => updateData('width', e.target.value)}
                        aria-invalid={Boolean(errors.width)}
                      />
                      {errors.width && <p className="text-destructive text-xs">{errors.width[0]}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="height">Height (cm) *</Label>
                      <Input
                        id="height"
                        type="number"
                        step="any"
                        min="0"
                        value={data.height}
                        onChange={(e) => updateData('height', e.target.value)}
                        aria-invalid={Boolean(errors.height)}
                      />
                      {errors.height && <p className="text-destructive text-xs">{errors.height[0]}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="thickness">Thickness (cm) *</Label>
                      <Input
                        id="thickness"
                        type="number"
                        step="any"
                        min="0"
                        value={data.thickness}
                        onChange={(e) => updateData('thickness', e.target.value)}
                        aria-invalid={Boolean(errors.thickness)}
                      />
                      {errors.thickness && <p className="text-destructive text-xs">{errors.thickness[0]}</p>}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="quantity">Aantal stuks *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      step="1"
                      min="1"
                      value={data.quantity}
                      onChange={(e) => updateData('quantity', e.target.value)}
                      aria-invalid={Boolean(errors.quantity)}
                    />
                    {errors.quantity && <p className="text-destructive text-xs">{errors.quantity[0]}</p>}
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={data.notes}
                  onChange={(e) => updateData('notes', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Bijlagen (optioneel)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".skp,.pdf,.jpg,.jpeg,.png,.dwg"
                  multiple
                  onChange={handleAttachmentChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Bestanden toevoegen
                </Button>
                {attachments.length > 0 && (
                  <div className="space-y-1">
                    {attachments.map((attachment, index) => (
                      <div key={`${attachment.name}-${attachment.size}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{attachment.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAttachment(index)}
                        >
                          Verwijderen
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
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
