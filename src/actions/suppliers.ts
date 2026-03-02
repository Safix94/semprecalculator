'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { logAuditEvent } from './audit';
import type { Material, Supplier, SupplierWithMaterials } from '@/types';

export interface CreateSupplierInput {
  name: string;
  email: string;
  material_ids?: string[];
}

export interface UpdateSupplierInput {
  name?: string;
  email?: string;
  material_ids?: string[];
}

/**
 * Get all active suppliers (admin/sales)
 */
export async function getSuppliers(): Promise<SupplierWithMaterials[]> {
  await requireRole('sales');

  try {
    const supabase = await createClient();

    const { data: suppliers, error } = await supabase
      .from('suppliers')
      .select(`
        *,
        material_suppliers (
          material:materials (
            id,
            name,
            finish_options,
            is_active,
            created_at,
            updated_at
          )
        )
      `)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Failed to fetch suppliers:', error.message);
      return [];
    }

    type SupplierQueryRow = Supplier & {
      material_suppliers?: Array<{ material: Material | null }> | null;
    };

    const suppliersWithMaterials: SupplierWithMaterials[] = ((suppliers ?? []) as SupplierQueryRow[]).map(
      (supplier) => ({
        id: supplier.id,
        name: supplier.name,
        email: supplier.email,
        materials: supplier.materials ?? [],
        is_active: supplier.is_active,
        created_at: supplier.created_at,
        available_materials: (supplier.material_suppliers ?? [])
          .map((materialSupplier) => materialSupplier.material)
          .filter((material): material is Material => Boolean(material && material.is_active)),
      })
    );

    return suppliersWithMaterials;
  } catch (error) {
    console.error('Failed to fetch suppliers:', error);
    return [];
  }
}

/**
 * Create a new supplier (sales/admin)
 */
export async function createSupplier(input: CreateSupplierInput) {
  const user = await requireRole('sales');
  const supabase = await createClient();
  const materialIds = [...new Set(input.material_ids ?? [])];

  const { data: supplier, error } = await supabase
    .from('suppliers')
    .insert({
      name: input.name,
      email: input.email,
    })
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  if (materialIds.length > 0) {
    const materialSupplierRows = materialIds.map((materialId) => ({
      material_id: materialId,
      supplier_id: supplier.id,
    }));

    const { error: linkError } = await supabase
      .from('material_suppliers')
      .insert(materialSupplierRows);

    if (linkError) {
      await logAuditEvent({
        actorType: user.role,
        actorId: user.id,
        action: 'SUPPLIER_CREATED',
        entityType: 'supplier',
        entityId: supplier.id,
        metadata: { supplierName: supplier.name, supplierEmail: supplier.email, materialIds },
      });

      revalidatePath('/admin/management');
      return {
        error: {
          _form: [`Supplier created but failed to link materials: ${linkError.message}`],
        },
      };
    }
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'SUPPLIER_CREATED',
    entityType: 'supplier',
    entityId: supplier.id,
    metadata: { supplierName: supplier.name, supplierEmail: supplier.email, materialIds },
  });

  revalidatePath('/admin/management');
  return { data: supplier };
}

/**
 * Update a supplier (sales/admin)
 */
export async function updateSupplier(supplierId: string, input: UpdateSupplierInput) {
  const user = await requireRole('sales');
  const supabase = await createClient();
  const { material_ids, ...supplierFields } = input;
  const hasSupplierFieldUpdates = Object.keys(supplierFields).length > 0;
  let supplier: Supplier | null = null;

  if (hasSupplierFieldUpdates) {
    const { data: updatedSupplier, error } = await supabase
      .from('suppliers')
      .update(supplierFields)
      .eq('id', supplierId)
      .select()
      .single();

    if (error) {
      return { error: { _form: [error.message] } };
    }

    supplier = updatedSupplier as Supplier;
  }

  if (material_ids !== undefined) {
    const { data: existingLinks, error: fetchLinksError } = await supabase
      .from('material_suppliers')
      .select('material_id')
      .eq('supplier_id', supplierId);

    if (fetchLinksError) {
      return { error: { _form: [fetchLinksError.message] } };
    }

    const requestedMaterialIds = [...new Set(material_ids)];
    const existingMaterialIdSet = new Set((existingLinks ?? []).map((link) => link.material_id));
    const requestedMaterialIdSet = new Set(requestedMaterialIds);

    const toAdd = requestedMaterialIds.filter((materialId) => !existingMaterialIdSet.has(materialId));
    const toRemove = [...existingMaterialIdSet].filter((materialId) => !requestedMaterialIdSet.has(materialId));

    if (toAdd.length > 0) {
      const rowsToInsert = toAdd.map((materialId) => ({
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
        .eq('supplier_id', supplierId)
        .in('material_id', toRemove);

      if (removeError) {
        return { error: { _form: [removeError.message] } };
      }
    }
  }

  if (!supplier) {
    const { data: currentSupplier, error: fetchSupplierError } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', supplierId)
      .single();

    if (fetchSupplierError) {
      return { error: { _form: [fetchSupplierError.message] } };
    }

    supplier = currentSupplier as Supplier;
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'SUPPLIER_UPDATED',
    entityType: 'supplier',
    entityId: supplierId,
    metadata: { changes: supplierFields, materialIds: material_ids },
  });

  revalidatePath('/admin/management');
  return { data: supplier };
}

/**
 * Delete a supplier (sales/admin) - sets is_active to false
 */
export async function deleteSupplier(supplierId: string) {
  const user = await requireRole('sales');
  const supabase = await createClient();

  const { data: supplier, error } = await supabase
    .from('suppliers')
    .update({ is_active: false })
    .eq('id', supplierId)
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'SUPPLIER_DELETED',
    entityType: 'supplier',
    entityId: supplierId,
    metadata: { supplierName: supplier.name },
  });

  revalidatePath('/admin/management');
  return { data: supplier };
}
