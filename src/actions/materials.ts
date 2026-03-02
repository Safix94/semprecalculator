'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, requireRole } from '@/lib/auth';
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
  supplier_ids?: string[];
}

/**
 * Get all materials with their associated suppliers (admin/sales only)
 */
export async function getMaterials(): Promise<MaterialWithSuppliers[]> {
  await requireRole('sales'); // Both sales and admin can read
  try {
    const supabase = await createClient();

    const { data: materials, error } = await supabase
      .from('materials')
      .select(`
        *,
        material_suppliers (
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
      console.error('Failed to fetch materials:', error.message);
      return [];
    }

    type MaterialQueryRow = {
      id: string;
      name: string;
      finish_options: string[];
      is_active: boolean;
      created_at: string;
      updated_at: string;
      material_suppliers?: Array<{ supplier: unknown }> | null;
    };

    // Transform the data to group suppliers under each material
    const materialsWithSuppliers: MaterialWithSuppliers[] = ((materials ?? []) as MaterialQueryRow[]).map(
      (material) => ({
        id: material.id,
        name: material.name,
        finish_options: material.finish_options,
        is_active: material.is_active,
        created_at: material.created_at,
        updated_at: material.updated_at,
        suppliers: (material.material_suppliers ?? [])
          .map((ms) => ms.supplier)
          .filter((supplier): supplier is Supplier => Boolean(supplier)),
      })
    );

    return materialsWithSuppliers;
  } catch (error) {
    console.error('Failed to fetch materials:', error);
    return [];
  }
}

/**
 * Get active materials for RFQ creation (sales/admin)
 */
export async function getActiveMaterials(): Promise<{ data: Material[] } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Je bent niet ingelogd.' };
  }
  if (user.role !== 'sales' && user.role !== 'admin') {
    return { error: 'Je hebt geen rechten om materialen te laden.' };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Failed to fetch active materials:', error.message);
      return { error: 'Materialen konden niet geladen worden.' };
    }

    return { data: (data ?? []) as Material[] };
  } catch (error) {
    console.error('Failed to fetch active materials:', error);
    return { error: 'Materialen konden niet geladen worden.' };
  }
}

/**
 * Get suppliers for a specific material
 */
export async function getSuppliersForMaterial(
  materialId: string
): Promise<{ data: Supplier[] } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Je bent niet ingelogd.' };
  }
  if (user.role !== 'sales' && user.role !== 'admin') {
    return { error: 'Je hebt geen rechten om leveranciers te laden.' };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc('get_suppliers_for_material', { material_uuid: materialId });

    if (error) {
      console.error('Failed to fetch suppliers for material:', error.message);
      return { error: 'Leveranciers konden niet geladen worden.' };
    }

    return { data: (data ?? []) as Supplier[] };
  } catch (error) {
    console.error('Failed to fetch suppliers for material:', error);
    return { error: 'Leveranciers konden niet geladen worden.' };
  }
}

/**
 * Create a new material (sales/admin)
 */
export async function createMaterial(input: CreateMaterialInput) {
  const user = await requireRole('sales');
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

  revalidatePath('/admin/management');
  return { data: material };
}

/**
 * Update a material (sales/admin)
 */
export async function updateMaterial(materialId: string, input: UpdateMaterialInput) {
  const user = await requireRole('sales');
  const supabase = await createClient();
  const { supplier_ids, ...materialFields } = input;
  const hasMaterialFieldUpdates = Object.keys(materialFields).length > 0;
  let material: Material | null = null;

  if (hasMaterialFieldUpdates) {
    const { data: updatedMaterial, error } = await supabase
      .from('materials')
      .update(materialFields)
      .eq('id', materialId)
      .select()
      .single();

    if (error) {
      return { error: { _form: [error.message] } };
    }

    material = updatedMaterial as Material;
  }

  if (supplier_ids !== undefined) {
    const { data: existingLinks, error: fetchLinksError } = await supabase
      .from('material_suppliers')
      .select('supplier_id')
      .eq('material_id', materialId);

    if (fetchLinksError) {
      return { error: { _form: [fetchLinksError.message] } };
    }

    const requestedSupplierIds = [...new Set(supplier_ids)];
    const existingSupplierIdSet = new Set((existingLinks ?? []).map((link) => link.supplier_id));
    const requestedSupplierIdSet = new Set(requestedSupplierIds);

    const toAdd = requestedSupplierIds.filter((supplierId) => !existingSupplierIdSet.has(supplierId));
    const toRemove = [...existingSupplierIdSet].filter((supplierId) => !requestedSupplierIdSet.has(supplierId));

    if (toAdd.length > 0) {
      const rowsToInsert = toAdd.map((supplierId) => ({
        material_id: materialId,
        supplier_id: supplierId,
      }));

      const { error: addError } = await supabase
        .from('material_suppliers')
        .insert(rowsToInsert);

      if (addError) {
        return { error: { _form: [addError.message] } };
      }
    }

    if (toRemove.length > 0) {
      const { error: removeError } = await supabase
        .from('material_suppliers')
        .delete()
        .eq('material_id', materialId)
        .in('supplier_id', toRemove);

      if (removeError) {
        return { error: { _form: [removeError.message] } };
      }
    }
  }

  if (!material) {
    const { data: currentMaterial, error: fetchMaterialError } = await supabase
      .from('materials')
      .select('*')
      .eq('id', materialId)
      .single();

    if (fetchMaterialError) {
      return { error: { _form: [fetchMaterialError.message] } };
    }

    material = currentMaterial as Material;
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'MATERIAL_UPDATED',
    entityType: 'material',
    entityId: materialId,
    metadata: supplier_ids === undefined
      ? { changes: materialFields }
      : { changes: materialFields, supplierIds: supplier_ids }
  });

  revalidatePath('/admin/management');
  return { data: material };
}

/**
 * Link a supplier to a material (sales/admin)
 */
export async function linkSupplierToMaterial(materialId: string, supplierId: string) {
  const user = await requireRole('sales');
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

  revalidatePath('/admin/management');
  return { data };
}

/**
 * Unlink a supplier from a material (sales/admin)
 */
export async function unlinkSupplierFromMaterial(materialId: string, supplierId: string) {
  const user = await requireRole('sales');
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

  revalidatePath('/admin/management');
  return { data };
}

/**
 * Delete a material (sales/admin) - sets is_active to false
 */
export async function deleteMaterial(materialId: string) {
  const user = await requireRole('sales');
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

  revalidatePath('/admin/management');
  return { data: material };
}
