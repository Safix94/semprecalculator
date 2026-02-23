'use client';

import { useState } from 'react';
import { Plus, Edit, Trash2, Link, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  supplier_ids: string[];
}

const initialFormData: MaterialFormData = {
  name: '',
  finish_options: '',
  supplier_ids: [],
};

export function MaterialManagement({ materials: initialMaterials, suppliers }: MaterialManagementProps) {
  const [materials, setMaterials] = useState(initialMaterials);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialWithSuppliers | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<MaterialWithSuppliers | null>(null);
  const [formData, setFormData] = useState<MaterialFormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const updateFormData = (field: keyof MaterialFormData, value: any) => {
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

    const finishOptions = formData.finish_options
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (finishOptions.length === 0) {
      setError('Voeg minimaal één afwerkingsoptie toe');
      setLoading(false);
      return;
    }

    const input = {
      name: formData.name,
      finish_options: finishOptions,
      supplier_ids: formData.supplier_ids,
    };

    let result;
    if (editingMaterial) {
      result = await updateMaterial(editingMaterial.id, {
        name: input.name,
        finish_options: input.finish_options,
      });
    } else {
      result = await createMaterial(input);
    }

    if (result.error) {
      setError(result.error._form?.[0] || 'Er is een fout opgetreden');
    } else {
      // Refresh materials list
      window.location.reload();
    }

    setLoading(false);
  };

  const handleDelete = async (materialId: string) => {
    if (!confirm('Weet je zeker dat je dit materiaal wilt verwijderen?')) {
      return;
    }

    setLoading(true);
    const result = await deleteMaterial(materialId);
    
    if (result.error) {
      setError(result.error._form?.[0] || 'Er is een fout opgetreden');
    } else {
      // Remove from local state
      setMaterials(prev => prev.filter(m => m.id !== materialId));
    }
    
    setLoading(false);
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
    const result = await linkSupplierToMaterial(selectedMaterial.id, supplierId);
    
    if (result.error) {
      setError(result.error._form?.[0] || 'Er is een fout opgetreden');
    } else {
      // Refresh the page to show updated data
      window.location.reload();
    }
    
    setLoading(false);
  };

  const handleUnlinkSupplier = async (materialId: string, supplierId: string) => {
    if (!confirm('Weet je zeker dat je deze leverancier wilt ontkoppelen?')) {
      return;
    }

    setLoading(true);
    const result = await unlinkSupplierFromMaterial(materialId, supplierId);
    
    if (result.error) {
      setError(result.error._form?.[0] || 'Er is een fout opgetreden');
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
    }
    
    setLoading(false);
  };

  const availableSuppliers = selectedMaterial
    ? suppliers.filter(s => !selectedMaterial.suppliers?.some(ms => ms.id === s.id))
    : [];

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Materialen</h2>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Nieuw materiaal
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Naam</TableHead>
                <TableHead>Afwerkingsopties</TableHead>
                <TableHead>Leveranciers</TableHead>
                <TableHead>Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.map((material) => (
                <TableRow key={material.id}>
                  <TableCell className="font-medium">{material.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {material.finish_options.join(', ')}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {material.suppliers?.map((supplier) => (
                        <div key={supplier.id} className="flex items-center gap-2">
                          <span className="text-sm">{supplier.name}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleUnlinkSupplier(material.id, supplier.id)}
                            disabled={loading}
                          >
                            <Unlink className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                      {(!material.suppliers || material.suppliers.length === 0) && (
                        <span className="text-muted-foreground text-sm">Geen leveranciers</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
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
              {materials.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nog geen materialen aangemaakt.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Material Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMaterial ? 'Materiaal bewerken' : 'Nieuw materiaal'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="material-name">Naam *</Label>
              <Input
                id="material-name"
                value={formData.name}
                onChange={(e) => updateFormData('name', e.target.value)}
                placeholder="bijv. Glass, Teak"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="finish-options">
                Afwerkingsopties * <span className="text-xs text-muted-foreground">(gescheiden door komma's)</span>
              </Label>
              <Input
                id="finish-options"
                value={formData.finish_options}
                onChange={(e) => updateFormData('finish_options', e.target.value)}
                placeholder="bijv. Polished, Matte, Frosted"
                required
              />
            </div>

            <div className="space-y-3">
              <Label>Leveranciers koppelen (optioneel)</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                {suppliers.map((supplier) => (
                  <div key={supplier.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`supplier-${supplier.id}`}
                      checked={formData.supplier_ids.includes(supplier.id)}
                      onCheckedChange={(checked) => 
                        handleSupplierToggle(supplier.id, checked as boolean)
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
                Annuleren
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Bezig...' : (editingMaterial ? 'Bijwerken' : 'Aanmaken')}
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
              Leverancier koppelen aan {selectedMaterial?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {availableSuppliers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Alle leveranciers zijn al gekoppeld aan dit materiaal.
              </p>
            ) : (
              <>
                <Label>Beschikbare leveranciers</Label>
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
                        Koppelen
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setLinkDialogOpen(false)}>
              Sluiten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}