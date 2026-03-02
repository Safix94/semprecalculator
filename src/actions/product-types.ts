'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, requireRole } from '@/lib/auth';
import { logAuditEvent } from './audit';
import type { ProductType } from '@/types';

interface CreateProductTypeInput {
  name: string;
  sort_order?: number;
}

export async function getProductTypes(): Promise<{ data: ProductType[] } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Je bent niet ingelogd.' };
  }

  if (user.role !== 'sales' && user.role !== 'admin') {
    return { error: 'Je hebt geen rechten om soorten te laden.' };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('product_types')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Failed to fetch product types:', error.message);
      return { error: 'Product types could not be loaded.' };
    }

    return { data: (data ?? []) as ProductType[] };
  } catch (error) {
    console.error('Failed to fetch product types:', error);
    return { error: 'Product types could not be loaded.' };
  }
}

export async function createProductType(input: CreateProductTypeInput) {
  const user = await requireRole('sales');
  const supabase = await createClient();

  const name = input.name.trim();
  if (!name) {
    return { error: { _form: ['Name is required.'] } };
  }

  const sortOrder = Number.isFinite(input.sort_order) ? Math.trunc(input.sort_order as number) : 0;

  const { data, error } = await supabase
    .from('product_types')
    .insert({
      name,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'PRODUCT_TYPE_CREATED',
    entityType: 'product_type',
    entityId: data.id,
    metadata: { name: data.name, sortOrder: data.sort_order },
  });

  revalidatePath('/admin/management');
  revalidatePath('/dashboard');
  return { data: data as ProductType };
}

export async function deleteProductType(productTypeId: string) {
  const user = await requireRole('sales');
  const supabase = await createClient();

  const { data: productType, error: productTypeError } = await supabase
    .from('product_types')
    .select('*')
    .eq('id', productTypeId)
    .single();

  if (productTypeError || !productType) {
    return { error: { _form: ['Soort niet gevonden.'] } };
  }

  const { count, error: usageError } = await supabase
    .from('rfqs')
    .select('id', { count: 'exact', head: true })
    .eq('product_type', productType.name);

  if (usageError) {
    return { error: { _form: [usageError.message] } };
  }

  if ((count ?? 0) > 0) {
    return { error: { _form: ['Deze soort is in gebruik en kan niet verwijderd worden.'] } };
  }

  const { error: deleteError } = await supabase
    .from('product_types')
    .delete()
    .eq('id', productTypeId);

  if (deleteError) {
    return { error: { _form: [deleteError.message] } };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'PRODUCT_TYPE_DELETED',
    entityType: 'product_type',
    entityId: productTypeId,
    metadata: { name: productType.name },
  });

  revalidatePath('/admin/management');
  revalidatePath('/dashboard');
  return { data: { id: productTypeId } };
}
