'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getCurrentUser, requireRole } from '@/lib/auth';
import {
  normalizeDetailFieldSettings,
  type ProductTypeDetailFieldSetting,
} from '@/lib/product-type-detail-fields';
import { logAuditEvent } from './audit';
import type { ProductType } from '@/types';

interface CreateProductTypeInput {
  name: string;
  sort_order?: number;
}

interface UpdateProductTypeDetailFieldsInput {
  detail_fields: ProductTypeDetailFieldSetting[];
}

interface StoredProductTypeDetailFieldsFile {
  productTypes: Record<string, ProductTypeDetailFieldSetting[]>;
}

const STORAGE_BUCKET = 'app-config';
const PRODUCT_TYPE_DETAIL_FIELDS_PATH = 'product-type-detail-fields.json';

function normalizeSortOrder(value: number | undefined): number {
  return Number.isFinite(value) ? Math.trunc(value as number) : 0;
}

function isProductTypeDetailFieldsColumnMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? '';
  return (
    error.code === '42703' ||
    message.includes('detail_fields') &&
      (message.includes('schema cache') || message.includes('does not exist') || message.includes('column'))
  );
}

async function ensureStorageBucket() {
  const supabase = createServiceRoleClient();
  const { error: getBucketError } = await supabase.storage.getBucket(STORAGE_BUCKET);

  if (!getBucketError) {
    return { supabase, error: null as string | null };
  }

  const { error: createBucketError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
    public: false,
  });

  if (createBucketError && !createBucketError.message.toLowerCase().includes('already exists')) {
    return { supabase, error: createBucketError.message };
  }

  return { supabase, error: null as string | null };
}

async function readStoredProductTypeDetailFields(): Promise<{
  settingsByProductTypeId: Record<string, ProductTypeDetailFieldSetting[]>;
  error: string | null;
}> {
  const { supabase, error: bucketError } = await ensureStorageBucket();
  if (bucketError) {
    return { settingsByProductTypeId: {}, error: bucketError };
  }

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(PRODUCT_TYPE_DETAIL_FIELDS_PATH);

  if (error) {
    const isMissing = error.message.toLowerCase().includes('not found') || error.message.toLowerCase().includes('does not exist');
    return { settingsByProductTypeId: {}, error: isMissing ? null : error.message };
  }

  try {
    const parsed = JSON.parse(await data.text()) as StoredProductTypeDetailFieldsFile;
    return {
      settingsByProductTypeId: parsed.productTypes && typeof parsed.productTypes === 'object'
        ? parsed.productTypes
        : {},
      error: null,
    };
  } catch (parseError) {
    console.error('Failed to parse stored product type detail fields:', parseError);
    return { settingsByProductTypeId: {}, error: 'Stored product type detail fields could not be parsed.' };
  }
}

async function writeStoredProductTypeDetailFields(
  settingsByProductTypeId: Record<string, ProductTypeDetailFieldSetting[]>
): Promise<string | null> {
  const { supabase, error: bucketError } = await ensureStorageBucket();
  if (bucketError) {
    return bucketError;
  }

  const file: StoredProductTypeDetailFieldsFile = { productTypes: settingsByProductTypeId };
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(PRODUCT_TYPE_DETAIL_FIELDS_PATH, JSON.stringify(file, null, 2), {
      contentType: 'application/json',
      upsert: true,
    });

  return error?.message ?? null;
}

async function upsertStoredProductTypeDetailFields(
  productTypeId: string,
  productTypeName: string,
  settings: ProductTypeDetailFieldSetting[]
): Promise<string | null> {
  const { settingsByProductTypeId, error } = await readStoredProductTypeDetailFields();
  if (error) {
    return error;
  }

  settingsByProductTypeId[productTypeId] = normalizeDetailFieldSettings(settings, productTypeName);
  return writeStoredProductTypeDetailFields(settingsByProductTypeId);
}

async function mergeProductTypeDetailFields(productTypes: ProductType[]): Promise<ProductType[]> {
  const { settingsByProductTypeId, error } = await readStoredProductTypeDetailFields();
  if (error) {
    console.error('Failed to load stored product type detail fields:', error);
  }

  return productTypes.map((productType) => {
    const hasDatabaseSettings = Object.prototype.hasOwnProperty.call(productType, 'detail_fields') && productType.detail_fields;
    const rawSettings = hasDatabaseSettings ? productType.detail_fields : settingsByProductTypeId[productType.id];

    return {
      ...productType,
      detail_fields: normalizeDetailFieldSettings(rawSettings, productType.name),
    };
  });
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

    return { data: await mergeProductTypeDetailFields((data ?? []) as ProductType[]) };
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

  const sortOrder = normalizeSortOrder(input.sort_order);

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

  const normalizedProductType = (await mergeProductTypeDetailFields([data as ProductType]))[0];
  await upsertStoredProductTypeDetailFields(
    normalizedProductType.id,
    normalizedProductType.name,
    normalizedProductType.detail_fields ?? []
  );

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
  return { data: normalizedProductType };
}

export async function updateProductTypeDetailFields(
  productTypeId: string,
  input: UpdateProductTypeDetailFieldsInput
) {
  const user = await requireRole('sales');
  const supabase = await createClient();

  const { data: productType, error: productTypeError } = await supabase
    .from('product_types')
    .select('*')
    .eq('id', productTypeId)
    .single();

  if (productTypeError || !productType) {
    return { error: { _form: ['Product type not found.'] } };
  }

  const normalizedSettings = normalizeDetailFieldSettings(input.detail_fields, productType.name);
  const { data, error } = await supabase
    .from('product_types')
    .update({ detail_fields: normalizedSettings })
    .eq('id', productTypeId)
    .select()
    .single();

  if (isProductTypeDetailFieldsColumnMissing(error)) {
    const storageError = await upsertStoredProductTypeDetailFields(productTypeId, productType.name, normalizedSettings);
    if (storageError) {
      return { error: { _form: [storageError] } };
    }

    const storedProductType = {
      ...(productType as ProductType),
      detail_fields: normalizedSettings,
    };

    await logAuditEvent({
      actorType: user.role,
      actorId: user.id,
      action: 'PRODUCT_TYPE_DETAIL_FIELDS_UPDATED',
      entityType: 'product_type',
      entityId: productTypeId,
      metadata: { name: productType.name, storageFallback: true, detailFields: normalizedSettings },
    });

    revalidatePath('/admin/management');
    revalidatePath('/dashboard');
    return { data: storedProductType };
  }

  if (error) {
    return { error: { _form: [error.message] } };
  }

  const normalizedProductType = {
    ...(data as ProductType),
    detail_fields: normalizeDetailFieldSettings((data as ProductType).detail_fields, data.name),
  };

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'PRODUCT_TYPE_DETAIL_FIELDS_UPDATED',
    entityType: 'product_type',
    entityId: productTypeId,
    metadata: { name: data.name, detailFields: normalizedProductType.detail_fields },
  });

  revalidatePath('/admin/management');
  revalidatePath('/dashboard');
  return { data: normalizedProductType };
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

  const { settingsByProductTypeId } = await readStoredProductTypeDetailFields();
  if (settingsByProductTypeId[productTypeId]) {
    delete settingsByProductTypeId[productTypeId];
    await writeStoredProductTypeDetailFields(settingsByProductTypeId);
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
