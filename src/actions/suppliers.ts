'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { logAuditEvent } from './audit';
import { normalizeSupplierLanguage } from '@/lib/supplier-language';
import { validateSupplierAdditionalEmails } from '@/lib/email-recipients';
import { DEFAULT_PRICING_SETTINGS, DEFAULT_TRUCK_MULTIPLIER_FACTOR } from '@/lib/pricing';
import { normalizeQuotePriceCurrency, type QuotePriceCurrency } from '@/lib/currency';
import type { Material, Supplier, SupplierPricingProfile, SupplierWithMaterials, TransportMode } from '@/types';
import type { SupplierLanguage } from '@/lib/supplier-language';

export interface SupplierPricingProfileInput {
  transport_mode: TransportMode;
  container_price_eur?: number | null;
  container_volume_m3?: number | null;
  product_margin_factor: number;
  retail_multiplier_factor: number;
  truck_multiplier_factor?: number | null;
}

export interface CreateSupplierInput {
  name: string;
  email: string;
  additional_emails?: string[];
  material_ids?: string[];
  preferred_language?: SupplierLanguage;
  quote_price_currency?: QuotePriceCurrency;
  pricing_profile?: SupplierPricingProfileInput;
}


function isMissingPreferredLanguageColumnError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? '';
  return error?.code === '42703' || message.includes('preferred_language');
}

function isMissingAdditionalEmailsColumnError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? '';
  return error?.code === '42703' || message.includes('additional_emails');
}

function withoutPreferredLanguage<T extends { preferred_language?: SupplierLanguage }>(input: T) {
  const rest = { ...input };
  delete rest.preferred_language;
  return rest;
}

function withoutAdditionalEmails<T extends { additional_emails?: string[] }>(input: T) {
  const rest = { ...input };
  delete rest.additional_emails;
  return rest;
}

function normalizeNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return typeof value === 'number' ? value : Number(value);
}

function mapSupplierPricingProfileRow(row: Partial<SupplierPricingProfile> | null | undefined): SupplierPricingProfile | null {
  if (!row?.supplier_id) {
    return null;
  }

  return {
    id: row.id,
    supplier_id: row.supplier_id,
    transport_mode: row.transport_mode ?? 'container',
    formula_version: row.formula_version ?? 'supplier_transport_v1',
    container_price_eur: normalizeNumber(row.container_price_eur),
    container_volume_m3: normalizeNumber(row.container_volume_m3),
    product_margin_factor: Number(row.product_margin_factor ?? DEFAULT_PRICING_SETTINGS.productMarginFactor),
    retail_multiplier_factor: Number(row.retail_multiplier_factor ?? DEFAULT_PRICING_SETTINGS.shippingMarginFactor),
    truck_multiplier_factor: normalizeNumber(row.truck_multiplier_factor) ?? DEFAULT_TRUCK_MULTIPLIER_FACTOR,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function defaultSupplierPricingProfileInput(): SupplierPricingProfileInput {
  return {
    transport_mode: 'container',
    container_price_eur: DEFAULT_PRICING_SETTINGS.containerPriceEur,
    container_volume_m3: DEFAULT_PRICING_SETTINGS.containerVolumeM3,
    product_margin_factor: DEFAULT_PRICING_SETTINGS.productMarginFactor,
    retail_multiplier_factor: DEFAULT_PRICING_SETTINGS.shippingMarginFactor,
    truck_multiplier_factor: DEFAULT_TRUCK_MULTIPLIER_FACTOR,
  };
}

function validatePricingProfileInput(input: SupplierPricingProfileInput): string | null {
  const requiredPositiveFields: Array<[number | null | undefined, string]> = [
    [input.product_margin_factor, 'Product margin'],
    [input.retail_multiplier_factor, 'Retail multiplier'],
  ];

  if (input.transport_mode === 'container') {
    requiredPositiveFields.push(
      [input.container_price_eur, 'Container price'],
      [input.container_volume_m3, 'Container volume']
    );
  }

  if (input.transport_mode === 'truck') {
    requiredPositiveFields.push([input.truck_multiplier_factor, 'Truck multiplier']);
  }

  for (const [value, label] of requiredPositiveFields) {
    if (!Number.isFinite(value) || value === null || value === undefined || value <= 0) {
      return `${label} must be a positive number.`;
    }
  }

  return null;
}

async function upsertSupplierPricingProfile(
  supplierId: string,
  input: SupplierPricingProfileInput | undefined,
  updatedBy: string
): Promise<{ data?: SupplierPricingProfile; error?: string }> {
  const profileInput = input ?? defaultSupplierPricingProfileInput();
  const validationError = validatePricingProfileInput(profileInput);

  if (validationError) {
    return { error: validationError };
  }

  const serviceRoleSupabase = createServiceRoleClient();
  const { data, error } = await serviceRoleSupabase
    .from('supplier_pricing_profiles')
    .upsert(
      {
        supplier_id: supplierId,
        transport_mode: profileInput.transport_mode,
        formula_version: 'supplier_transport_v1',
        container_price_eur: profileInput.transport_mode === 'container' ? profileInput.container_price_eur : null,
        container_volume_m3: profileInput.transport_mode === 'container' ? profileInput.container_volume_m3 : null,
        product_margin_factor: profileInput.product_margin_factor,
        retail_multiplier_factor: profileInput.retail_multiplier_factor,
        truck_multiplier_factor: profileInput.transport_mode === 'truck' ? profileInput.truck_multiplier_factor ?? DEFAULT_TRUCK_MULTIPLIER_FACTOR : DEFAULT_TRUCK_MULTIPLIER_FACTOR,
        updated_by: updatedBy,
      },
      { onConflict: 'supplier_id' }
    )
    .select('*')
    .single();

  if (error || !data) {
    return { error: error?.message ?? 'Supplier pricing profile could not be saved.' };
  }

  return { data: mapSupplierPricingProfileRow(data as SupplierPricingProfile) ?? undefined };
}

export interface UpdateSupplierInput {
  name?: string;
  email?: string;
  additional_emails?: string[];
  material_ids?: string[];
  preferred_language?: SupplierLanguage;
  quote_price_currency?: QuotePriceCurrency;
  pricing_profile?: SupplierPricingProfileInput;
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
        supplier_pricing_profiles (*),
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
      supplier_pricing_profiles?: SupplierPricingProfile[] | null;
      material_suppliers?: Array<{ material: Material | null }> | null;
    };

    const suppliersWithMaterials: SupplierWithMaterials[] = ((suppliers ?? []) as SupplierQueryRow[]).map(
      (supplier) => ({
        id: supplier.id,
        name: supplier.name,
        email: supplier.email,
        additional_emails: supplier.additional_emails ?? [],
        preferred_language: normalizeSupplierLanguage(supplier.preferred_language),
        quote_price_currency: normalizeQuotePriceCurrency(supplier.quote_price_currency),
        materials: supplier.materials ?? [],
        is_active: supplier.is_active,
        created_at: supplier.created_at,
        pricing_profile: mapSupplierPricingProfileRow(supplier.supplier_pricing_profiles?.[0]),
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
  const preferredLanguage = normalizeSupplierLanguage(input.preferred_language);
  const quotePriceCurrency = normalizeQuotePriceCurrency(input.quote_price_currency);
  const emailValidation = validateSupplierAdditionalEmails(input.email, input.additional_emails);

  if (emailValidation.error) {
    return { error: { _form: [emailValidation.error] } };
  }

  const insertPayload = {
    name: input.name,
    email: input.email.trim().toLowerCase(),
    additional_emails: emailValidation.emails,
    preferred_language: preferredLanguage,
    quote_price_currency: quotePriceCurrency,
  };

  let { data: supplier, error } = await supabase
    .from('suppliers')
    .insert(insertPayload)
    .select()
    .single();

  if (error && isMissingPreferredLanguageColumnError(error)) {
    if (preferredLanguage !== 'en') {
      return {
        error: {
          _form: [
            'Supplier language could not be saved because the database migration is not applied yet.',
          ],
        },
      };
    }

    const retryResult = await supabase
      .from('suppliers')
      .insert(withoutPreferredLanguage(insertPayload))
      .select()
      .single();
    supplier = retryResult.data;
    error = retryResult.error;
  }

  if (error && isMissingAdditionalEmailsColumnError(error)) {
    if (emailValidation.emails.length > 0) {
      return {
        error: {
          _form: [
            'Additional supplier emails could not be saved because the database migration is not applied yet.',
          ],
        },
      };
    }

    const retryResult = await supabase
      .from('suppliers')
      .insert(withoutAdditionalEmails(insertPayload))
      .select()
      .single();
    supplier = retryResult.data;
    error = retryResult.error;
  }

  if (error) {
    return { error: { _form: [error.message] } };
  }

  const pricingProfileResult = await upsertSupplierPricingProfile(
    supplier.id,
    input.pricing_profile,
    user.id
  );

  if (pricingProfileResult.error) {
    return { error: { _form: [pricingProfileResult.error] } };
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
        metadata: { supplierName: supplier.name, supplierEmail: supplier.email, additionalEmails: emailValidation.emails, preferredLanguage, quotePriceCurrency, materialIds, pricingProfile: pricingProfileResult.data },
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
    metadata: { supplierName: supplier.name, supplierEmail: supplier.email, additionalEmails: emailValidation.emails, preferredLanguage, quotePriceCurrency, materialIds, pricingProfile: pricingProfileResult.data },
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
  const { material_ids, pricing_profile, ...supplierFieldsInput } = input;
  let additionalEmails: string[] | undefined;

  if (supplierFieldsInput.additional_emails !== undefined || supplierFieldsInput.email !== undefined) {
    let { data: currentEmailSupplier, error: currentEmailError } = await supabase
      .from('suppliers')
      .select('email, additional_emails')
      .eq('id', supplierId)
      .single();

    if (currentEmailError && isMissingAdditionalEmailsColumnError(currentEmailError)) {
      if ((supplierFieldsInput.additional_emails ?? []).length > 0) {
        return {
          error: {
            _form: [
              'Additional supplier emails could not be saved because the database migration is not applied yet.',
            ],
          },
        };
      }

      const fallbackResult = await supabase
        .from('suppliers')
        .select('email')
        .eq('id', supplierId)
        .single();
      currentEmailSupplier = fallbackResult.data ? { ...fallbackResult.data, additional_emails: [] } : null;
      currentEmailError = fallbackResult.error;
    }

    if (currentEmailError || !currentEmailSupplier) {
      return { error: { _form: [currentEmailError?.message ?? 'Supplier email could not be loaded'] } };
    }

    const emailValidation = validateSupplierAdditionalEmails(
      supplierFieldsInput.email ?? currentEmailSupplier.email,
      supplierFieldsInput.additional_emails ?? currentEmailSupplier.additional_emails ?? []
    );

    if (emailValidation.error) {
      return { error: { _form: [emailValidation.error] } };
    }

    additionalEmails = emailValidation.emails;
  }

  const supplierFields = {
    ...supplierFieldsInput,
    ...(supplierFieldsInput.email !== undefined ? { email: supplierFieldsInput.email.trim().toLowerCase() } : {}),
    ...(additionalEmails !== undefined ? { additional_emails: additionalEmails } : {}),
    ...(supplierFieldsInput.preferred_language !== undefined
      ? { preferred_language: normalizeSupplierLanguage(supplierFieldsInput.preferred_language) }
      : {}),
    ...(supplierFieldsInput.quote_price_currency !== undefined
      ? { quote_price_currency: normalizeQuotePriceCurrency(supplierFieldsInput.quote_price_currency) }
      : {}),
  };
  const hasSupplierFieldUpdates = Object.keys(supplierFields).length > 0;
  let supplier: Supplier | null = null;

  if (hasSupplierFieldUpdates) {
    let { data: updatedSupplier, error } = await supabase
      .from('suppliers')
      .update(supplierFields)
      .eq('id', supplierId)
      .select()
      .single();

    if (error && isMissingPreferredLanguageColumnError(error)) {
      if (supplierFields.preferred_language !== undefined && supplierFields.preferred_language !== 'en') {
        return {
          error: {
            _form: [
              'Supplier language could not be saved because the database migration is not applied yet.',
            ],
          },
        };
      }

      const retryResult = await supabase
        .from('suppliers')
        .update(withoutPreferredLanguage(supplierFields))
        .eq('id', supplierId)
        .select()
        .single();
      updatedSupplier = retryResult.data;
      error = retryResult.error;
    }

    if (error && isMissingAdditionalEmailsColumnError(error)) {
      if (additionalEmails !== undefined && additionalEmails.length > 0) {
        return {
          error: {
            _form: [
              'Additional supplier emails could not be saved because the database migration is not applied yet.',
            ],
          },
        };
      }

      const retryResult = await supabase
        .from('suppliers')
        .update(withoutAdditionalEmails(supplierFields))
        .eq('id', supplierId)
        .select()
        .single();
      updatedSupplier = retryResult.data;
      error = retryResult.error;
    }

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

  let pricingProfile: SupplierPricingProfile | undefined;
  if (pricing_profile !== undefined) {
    const pricingProfileResult = await upsertSupplierPricingProfile(supplierId, pricing_profile, user.id);
    if (pricingProfileResult.error) {
      return { error: { _form: [pricingProfileResult.error] } };
    }
    pricingProfile = pricingProfileResult.data;
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'SUPPLIER_UPDATED',
    entityType: 'supplier',
    entityId: supplierId,
    metadata: { changes: supplierFields, materialIds: material_ids, pricingProfile },
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
