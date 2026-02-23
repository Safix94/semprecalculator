'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { logAuditEvent } from './audit';
import type { Material, MaterialWithSuppliers, Supplier } from '@/types';

export interface CreateMaterialInput {
  name: string;
  finish_options: string[];
  supplier_ids?: string[];
}

export interface UpdateMaterialInput {
  name?: string;
  finish_options?: string[];
  is_active?: boolean;
}

/**
 * Get all materials with their associated suppliers (admin/sales only)
 */
export async function getMaterials(): Promise<MaterialWithSuppliers[]> {
  await requireRole('sales'); // Both sales and admin can read
  const supabase = await createClient();

  const { data: materials, error } = await supabase
    .from('materials')
    .select(`
      *,
      material_suppliers!inner (
        supplier:suppliers (
          id,
          name,
          email,
          is_active
        )
      )
    `)
    .eq('is_active', true)
    .order('name');

  if (error) {
    throw new Error(`Failed to fetch materials: ${error.message}`);
  }

  // Transform the data to group suppliers under each material
  const materialsWithSuppliers: MaterialWithSuppliers[] = materials.map((material: any) => ({
    id: material.id,
    name: material.name,
    finish_options: material.finish_options,
    is_active: material.is_active,
    created_at: material.created_at,
    updated_at: material.updated_at,
    suppliers: material.material_suppliers.map((ms: any) => ms.supplier)
  }));

  return materialsWithSuppliers;
}

/**
 * Get active materials for RFQ creation (sales/admin)
 */
export async function getActiveMaterials(): Promise<Material[]> {
  await requireRole('sales');

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Failed to fetch active materials:', error.message);
      return [];
    }

    return data ?? [];
  } catch (error) {
    console.error('Failed to fetch active materials:', error);
    return [];
  }
}

/**
 * Get suppliers for a specific material
 */
export async function getSuppliersForMaterial(materialId: string): Promise<Supplier[]> {
  await requireRole('sales');

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc('get_suppliers_for_material', { material_uuid: materialId });

    if (error) {
      console.error('Failed to fetch suppliers for material:', error.message);
      return [];
    }

    return (data ?? []) as Supplier[];
  } catch (error) {
    console.error('Failed to fetch suppliers for material:', error);
    return [];
  }
}

/**
 * Create a new material (admin only)
 */
export async function createMaterial(input: CreateMaterialInput) {
  const user = await requireRole('admin');
  const supabase = await createClient();

  const { data: material, error } = await supabase
    .from('materials')
    .insert({
      name: input.name,
      finish_options: input.finish_options,
    })
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  // Link suppliers if provided
  if (input.supplier_ids && input.supplier_ids.length > 0) {
    const materialSupplierInserts = input.supplier_ids.map(supplierId => ({
      material_id: material.id,
      supplier_id: supplierId,
    }));

    const { error: linkError } = await supabase
      .from('material_suppliers')
      .insert(materialSupplierInserts);

    if (linkError) {
      return { error: { _form: [`Material created but failed to link suppliers: ${linkError.message}`] } };
    }
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'MATERIAL_CREATED',
    entityType: 'material',
    entityId: material.id,
    metadata: { materialName: material.name, supplierIds: input.supplier_ids }
  });

  revalidatePath('/admin/materials');
  return { data: material };
}

/**
 * Update a material (admin only)
 */
export async function updateMaterial(materialId: string, input: UpdateMaterialInput) {
  const user = await requireRole('admin');
  const supabase = await createClient();

  const { data: material, error } = await supabase
    .from('materials')
    .update(input)
    .eq('id', materialId)
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'MATERIAL_UPDATED',
    entityType: 'material',
    entityId: materialId,
    metadata: { changes: input }
  });

  revalidatePath('/admin/materials');
  return { data: material };
}

/**
 * Link a supplier to a material (admin only)
 */
export async function linkSupplierToMaterial(materialId: string, supplierId: string) {
  const user = await requireRole('admin');
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('material_suppliers')
    .insert({
      material_id: materialId,
      supplier_id: supplierId,
    })
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'MATERIAL_SUPPLIER_LINKED',
    entityType: 'material_supplier',
    entityId: data.id,
    metadata: { materialId, supplierId }
  });

  revalidatePath('/admin/materials');
  return { data };
}

/**
 * Unlink a supplier from a material (admin only)
 */
export async function unlinkSupplierFromMaterial(materialId: string, supplierId: string) {
  const user = await requireRole('admin');
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('material_suppliers')
    .delete()
    .eq('material_id', materialId)
    .eq('supplier_id', supplierId)
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'MATERIAL_SUPPLIER_UNLINKED',
    entityType: 'material_supplier',
    entityId: data.id,
    metadata: { materialId, supplierId }
  });

  revalidatePath('/admin/materials');
  return { data };
}

/**
 * Delete a material (admin only) - sets is_active to false
 */
export async function deleteMaterial(materialId: string) {
  const user = await requireRole('admin');
  const supabase = await createClient();

  const { data: material, error } = await supabase
    .from('materials')
    .update({ is_active: false })
    .eq('id', materialId)
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'MATERIAL_DELETED',
    entityType: 'material',
    entityId: materialId,
    metadata: { materialName: material.name }
  });

  revalidatePath('/admin/materials');
  return { data: material };
}
