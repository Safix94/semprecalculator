'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { logAuditEvent } from './audit';
import type { Supplier } from '@/types';

export interface CreateSupplierInput {
  name: string;
  email: string;
}

export interface UpdateSupplierInput {
  name?: string;
  email?: string;
}

/**
 * Get all active suppliers (admin/sales)
 */
export async function getSuppliers(): Promise<Supplier[]> {
  await requireRole('sales');

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Failed to fetch suppliers:', error.message);
      return [];
    }

    return data ?? [];
  } catch (error) {
    console.error('Failed to fetch suppliers:', error);
    return [];
  }
}

/**
 * Create a new supplier (admin only)
 */
export async function createSupplier(input: CreateSupplierInput) {
  const user = await requireRole('admin');
  const supabase = await createClient();

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

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'SUPPLIER_CREATED',
    entityType: 'supplier',
    entityId: supplier.id,
    metadata: { supplierName: supplier.name, supplierEmail: supplier.email },
  });

  revalidatePath('/admin/management');
  return { data: supplier };
}

/**
 * Update a supplier (admin only)
 */
export async function updateSupplier(supplierId: string, input: UpdateSupplierInput) {
  const user = await requireRole('admin');
  const supabase = await createClient();

  const { data: supplier, error } = await supabase
    .from('suppliers')
    .update(input)
    .eq('id', supplierId)
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'SUPPLIER_UPDATED',
    entityType: 'supplier',
    entityId: supplierId,
    metadata: { changes: input },
  });

  revalidatePath('/admin/management');
  return { data: supplier };
}

/**
 * Delete a supplier (admin only) - sets is_active to false
 */
export async function deleteSupplier(supplierId: string) {
  const user = await requireRole('admin');
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
