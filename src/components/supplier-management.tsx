'use client';

import { useState } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
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
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '@/actions/suppliers';
import type { Material, SupplierWithMaterials } from '@/types';

interface SupplierManagementProps {
  suppliers: SupplierWithMaterials[];
  materials: Material[];
}

interface SupplierFormData {
  name: string;
  email: string;
  material_ids: string[];
}

const initialFormData: SupplierFormData = {
  name: '',
  email: '',
  material_ids: [],
};

export function SupplierManagement({ suppliers: initialSuppliers, materials }: SupplierManagementProps) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [editingSupplier, setEditingSupplier] = useState<SupplierWithMaterials | null>(null);
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const updateFormData = <K extends keyof SupplierFormData>(field: K, value: SupplierFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setEditingSupplier(null);
    setError(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (supplier: SupplierWithMaterials) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      email: supplier.email,
      material_ids: supplier.available_materials?.map(material => material.id) ?? [],
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let result;
    if (editingSupplier) {
      result = await updateSupplier(editingSupplier.id, {
        name: formData.name,
        email: formData.email,
        material_ids: formData.material_ids,
      });
    } else {
      result = await createSupplier({
        name: formData.name,
        email: formData.email,
        material_ids: formData.material_ids,
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
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Materials</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell className="text-muted-foreground">{supplier.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.available_materials && supplier.available_materials.length > 0
                      ? supplier.available_materials.map((material) => material.name).join(', ')
                      : 'No materials'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(supplier)}
                        disabled={loading}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(supplier.id)}
                        disabled={loading}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {suppliers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No suppliers created yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Supplier Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSupplier ? 'Edit supplier' : 'New supplier'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Create or edit a supplier and optionally link materials.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
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
              <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
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
