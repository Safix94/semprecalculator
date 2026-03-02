'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, Link, Unlink } from 'lucide-react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  createMaterial,
  updateMaterial,
  deleteMaterial,
  linkSupplierToMaterial,
  unlinkSupplierFromMaterial,
} from '@/actions/materials';
import type { MaterialWithSuppliers, Supplier } from '@/types';

interface MaterialManagementProps {
  materials: MaterialWithSuppliers[];
  suppliers: Supplier[];
}

interface MaterialFormData {
  name: string;
  finish_options: string;
  finish_options_edge: string;
  finish_options_color: string;
  supplier_ids: string[];
}

const initialFormData: MaterialFormData = {
  name: '',
  finish_options: '',
  finish_options_edge: '',
  finish_options_color: '',
  supplier_ids: [],
};

const MATERIALS_PER_PAGE = 5;

export function MaterialManagement({ materials: initialMaterials, suppliers }: MaterialManagementProps) {
  const router = useRouter();
  const [materials, setMaterials] = useState(initialMaterials);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialWithSuppliers | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<MaterialWithSuppliers | null>(null);
  const [formData, setFormData] = useState<MaterialFormData>(initialFormData);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const getErrorMessage = (value: unknown, fallback: string) => {
    if (value instanceof Error && value.message) {
      return value.message;
    }

    if (typeof value === 'object' && value !== null && 'message' in value) {
      const message = (value as { message?: unknown }).message;
      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }

    return fallback;
  };

  const updateFormData = <K extends keyof MaterialFormData>(field: K, value: MaterialFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setEditingMaterial(null);
    setError(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (material: MaterialWithSuppliers) => {
    setEditingMaterial(material);
    setFormData({
      name: material.name,
      finish_options: material.finish_options.join(', '),
      finish_options_edge: material.finish_options_edge?.join(', ') ?? '',
      finish_options_color: material.finish_options_color?.join(', ') ?? '',
      supplier_ids: material.suppliers?.map(s => s.id) || [],
    });
    setDialogOpen(true);
  };

  const openLinkDialog = (material: MaterialWithSuppliers) => {
    setSelectedMaterial(material);
    setLinkDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const parseFinishOptions = (s: string) =>
      s.split(',').map((x) => x.trim()).filter((x) => x.length > 0);

    const finishOptions = parseFinishOptions(formData.finish_options);
    const finishOptionsEdge = parseFinishOptions(formData.finish_options_edge);
    const finishOptionsColor = parseFinishOptions(formData.finish_options_color);

    const input = {
      name: formData.name,
      finish_options: finishOptions,
      finish_options_top: [] as string[],
      finish_options_edge: finishOptionsEdge,
      finish_options_color: finishOptionsColor,
      supplier_ids: formData.supplier_ids,
    };

    try {
      let result;
      if (editingMaterial) {
        result = await updateMaterial(editingMaterial.id, {
          name: input.name,
          finish_options: input.finish_options,
          finish_options_top: input.finish_options_top,
          finish_options_edge: input.finish_options_edge,
          finish_options_color: input.finish_options_color,
          supplier_ids: input.supplier_ids,
        });
      } else {
        result = await createMaterial(input);
      }

      if (result.error) {
        setError(result.error._form?.[0] || 'An error occurred');
        return;
      }

      const selectedSuppliers = suppliers.filter((supplier) => input.supplier_ids.includes(supplier.id));

      if (editingMaterial && result.data) {
        setMaterials((prev) =>
          prev.map((material) =>
            material.id === editingMaterial.id
              ? {
                  ...material,
                  ...result.data,
                  finish_options_top: result.data.finish_options_top ?? [],
                  finish_options_edge: result.data.finish_options_edge ?? [],
                  finish_options_color: result.data.finish_options_color ?? [],
                  suppliers: selectedSuppliers,
                }
              : material
          )
        );
      } else if (result.data) {
        setMaterials((prev) => [
          {
            ...result.data,
            finish_options_top: result.data.finish_options_top ?? [],
            finish_options_edge: result.data.finish_options_edge ?? [],
            finish_options_color: result.data.finish_options_color ?? [],
            suppliers: selectedSuppliers,
          },
          ...prev,
        ]);
      }

      setDialogOpen(false);
      resetForm();
      router.refresh();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Saving material failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (materialId: string) => {
    if (!confirm('Are you sure you want to delete this material?')) {
      return;
    }

    setLoading(true);
    try {
      const result = await deleteMaterial(materialId);
      if (result.error) {
        setError(result.error._form?.[0] || 'An error occurred');
      } else {
        // Remove from local state
        setMaterials(prev => prev.filter(m => m.id !== materialId));
        router.refresh();
      }
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Deleting material failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSupplierToggle = (supplierId: string, checked: boolean) => {
    const updatedSupplierIds = checked
      ? [...formData.supplier_ids, supplierId]
      : formData.supplier_ids.filter(id => id !== supplierId);
    updateFormData('supplier_ids', updatedSupplierIds);
  };

  const handleLinkSupplier = async (supplierId: string) => {
    if (!selectedMaterial) return;

    setLoading(true);
    try {
      const result = await linkSupplierToMaterial(selectedMaterial.id, supplierId);
      if (result.error) {
        setError(result.error._form?.[0] || 'An error occurred');
      } else {
        const supplier = suppliers.find((item) => item.id === supplierId);
        if (supplier) {
          setMaterials((prev) =>
            prev.map((material) =>
              material.id === selectedMaterial.id
                ? { ...material, suppliers: [...(material.suppliers ?? []), supplier] }
                : material
            )
          );
        }
        setLinkDialogOpen(false);
        setSelectedMaterial(null);
        router.refresh();
      }
    } catch (linkError) {
      setError(getErrorMessage(linkError, 'Linking supplier failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleUnlinkSupplier = async (materialId: string, supplierId: string) => {
    if (!confirm('Are you sure you want to unlink this supplier?')) {
      return;
    }

    setLoading(true);
    try {
      const result = await unlinkSupplierFromMaterial(materialId, supplierId);
      if (result.error) {
        setError(result.error._form?.[0] || 'An error occurred');
      } else {
        // Update local state
        setMaterials(prev => prev.map(material =>
          material.id === materialId
            ? {
                ...material,
                suppliers: material.suppliers?.filter(s => s.id !== supplierId) || []
              }
            : material
        ));
        router.refresh();
      }
    } catch (unlinkError) {
      setError(getErrorMessage(unlinkError, 'Unlinking supplier failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const availableSuppliers = selectedMaterial
    ? suppliers.filter(s => !selectedMaterial.suppliers?.some(ms => ms.id === s.id))
    : [];

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredMaterials = materials.filter((material) => {
    if (!normalizedQuery) {
      return true;
    }

    const supplierNames = (material.suppliers ?? []).map((supplier) => supplier.name).join(' ');
    const searchableText = `${material.name} ${material.finish_options.join(' ')} ${supplierNames}`.toLowerCase();
    return searchableText.includes(normalizedQuery);
  });

  const totalPages = Math.max(1, Math.ceil(filteredMaterials.length / MATERIALS_PER_PAGE));
  const effectiveCurrentPage = Math.min(currentPage, totalPages);
  const paginatedMaterials = filteredMaterials.slice(
    (effectiveCurrentPage - 1) * MATERIALS_PER_PAGE,
    effectiveCurrentPage * MATERIALS_PER_PAGE
  );

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Materials</h2>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          New material
        </Button>
      </div>

      <div className="max-w-sm">
        <Input
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by material, finish, or supplier"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Name</TableHead>
                <TableHead>Finish options</TableHead>
                <TableHead>Suppliers</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedMaterials.map((material) => (
                <TableRow key={material.id}>
                  <TableCell className="font-medium">{material.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {material.finish_options.length > 0 ? material.finish_options.join(', ') : 'No finishes'}
                  </TableCell>
                  <TableCell>
                    {material.suppliers && material.suppliers.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {material.suppliers.map((supplier) => (
                          <div
                            key={supplier.id}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1"
                          >
                            <span className="text-xs">{supplier.name}</span>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="h-5 w-5"
                              onClick={() => handleUnlinkSupplier(material.id, supplier.id)}
                              disabled={loading}
                            >
                              <Unlink className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">No suppliers</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap w-[140px]">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(material)}
                        disabled={loading}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openLinkDialog(material)}
                        disabled={loading}
                      >
                        <Link className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(material.id)}
                        disabled={loading}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredMaterials.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {materials.length === 0 ? 'No materials created yet.' : 'No materials match your search.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {filteredMaterials.length > 0 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-sm text-muted-foreground">
                Page {effectiveCurrentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={effectiveCurrentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={effectiveCurrentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Material Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingMaterial ? 'Edit material' : 'New material'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Create or edit a material, its finish options, and linked suppliers.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="material-name">Name *</Label>
              <Input
                id="material-name"
                value={formData.name}
                onChange={(e) => updateFormData('name', e.target.value)}
                placeholder="e.g. Glass, Teak"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="finish-options">
                  Finish options (comma-separated) (optional)
                </Label>
                <p className="text-muted-foreground text-xs">
                  Used for the Finish (Table top) field and for the Top finish dropdown in the wizard.
                </p>
                <Input
                  id="finish-options"
                  value={formData.finish_options}
                  onChange={(e) => updateFormData('finish_options', e.target.value)}
                  placeholder="e.g. Polished, Matte, Frosted"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="finish-options-edge">
                  Edge finish options (comma-separated) (optional)
                </Label>
                <p className="text-muted-foreground text-xs">
                  Used for the Edge finish dropdown when this material is selected as table top.
                </p>
                <Input
                  id="finish-options-edge"
                  value={formData.finish_options_edge}
                  onChange={(e) => updateFormData('finish_options_edge', e.target.value)}
                  placeholder="e.g. Straight, Beveled"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="finish-options-color">
                  Color finish options (comma-separated) (optional)
                </Label>
                <p className="text-muted-foreground text-xs">
                  Used for the Color finish dropdown when this material is selected as table top.
                </p>
                <Input
                  id="finish-options-color"
                  value={formData.finish_options_color}
                  onChange={(e) => updateFormData('finish_options_color', e.target.value)}
                  placeholder="e.g. White, Black"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Link suppliers (optional)</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                {suppliers.map((supplier) => (
                  <div key={supplier.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`supplier-${supplier.id}`}
                      checked={formData.supplier_ids.includes(supplier.id)}
                      onCheckedChange={(checked) => 
                        handleSupplierToggle(supplier.id, checked === true)
                      }
                    />
                    <Label htmlFor={`supplier-${supplier.id}`} className="text-sm">
                      {supplier.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Loading...' : (editingMaterial ? 'Update' : 'Create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Link Supplier Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Link supplier to {selectedMaterial?.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Link an additional supplier to the selected material.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {availableSuppliers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                All suppliers are already linked to this material.
              </p>
            ) : (
              <>
                <Label>Available suppliers</Label>
                <div className="space-y-2">
                  {availableSuppliers.map((supplier) => (
                    <div key={supplier.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <p className="font-medium">{supplier.name}</p>
                        <p className="text-xs text-muted-foreground">{supplier.email}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLinkSupplier(supplier.id)}
                        disabled={loading}
                      >
                        <Link className="w-4 h-4 mr-1" />
                        Link
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setLinkDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
