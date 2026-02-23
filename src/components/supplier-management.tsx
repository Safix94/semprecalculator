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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '@/actions/suppliers';
import type { Supplier } from '@/types';

interface SupplierManagementProps {
  suppliers: Supplier[];
}

interface SupplierFormData {
  name: string;
  email: string;
}

const initialFormData: SupplierFormData = {
  name: '',
  email: '',
};

export function SupplierManagement({ suppliers: initialSuppliers }: SupplierManagementProps) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const updateFormData = (field: keyof SupplierFormData, value: string) => {
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

  const openEditDialog = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      email: supplier.email,
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
      });
    } else {
      result = await createSupplier({
        name: formData.name,
        email: formData.email,
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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell className="text-muted-foreground">{supplier.email}</TableCell>
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
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
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
