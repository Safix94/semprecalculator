'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth, requireRole } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { logAuditEvent } from './audit';
import type { OwnFabric } from '@/types';

/**
 * Own fabrics: Sempre fabrics the cushion supplier (Jardinico) does not stock.
 * Sales pick one on a request with the finish "Own fabric"; its price per
 * running meter is added to the supplier's purchase price when they quote.
 */

type OwnFabricResult = { data: OwnFabric } | { error: { _form: string[] } };
type DeleteOwnFabricResult = { data: { id: string } } | { error: { _form: string[] } };

export interface OwnFabricInput {
  name: string;
  price_per_meter_eur: number;
  is_active?: boolean;
}

interface OwnFabricRow {
  id: string;
  name: string;
  price_per_meter_eur: number | string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function mapOwnFabricRow(row: OwnFabricRow): OwnFabric {
  return {
    id: row.id,
    name: row.name,
    price_per_meter_eur: Number(row.price_per_meter_eur),
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function validateInput(input: OwnFabricInput): string | null {
  if (!normalizeName(input.name)) {
    return 'Name is required.';
  }
  const price = Number(input.price_per_meter_eur);
  if (!Number.isFinite(price) || price <= 0) {
    return 'Price per meter must be a positive number.';
  }
  return null;
}

function isDuplicateNameError(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

/** Active fabrics for the RFQ wizard, alphabetically. */
export async function getOwnFabrics(): Promise<OwnFabric[]> {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('own_fabrics')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Failed to fetch own fabrics:', error.message);
    return [];
  }

  return ((data as OwnFabricRow[]) ?? []).map(mapOwnFabricRow);
}

/** All fabrics, including inactive ones, for Management. */
export async function getAllOwnFabrics(): Promise<OwnFabric[]> {
  await requireRole('sales');
  const supabase = await createClient();
  const { data, error } = await supabase.from('own_fabrics').select('*').order('name');

  if (error) {
    console.error('Failed to fetch own fabrics:', error.message);
    return [];
  }

  return ((data as OwnFabricRow[]) ?? []).map(mapOwnFabricRow);
}

export async function createOwnFabric(input: OwnFabricInput): Promise<OwnFabricResult> {
  const user = await requireRole('sales');
  const validationError = validateInput(input);
  if (validationError) {
    return { error: { _form: [validationError] } };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('own_fabrics')
    .insert({
      name: normalizeName(input.name),
      price_per_meter_eur: Number(input.price_per_meter_eur),
      is_active: input.is_active ?? true,
    })
    .select('*')
    .single();

  if (error || !data) {
    return {
      error: {
        _form: [isDuplicateNameError(error) ? 'A fabric with this name already exists.' : error?.message ?? 'Fabric could not be saved.'],
      },
    };
  }

  const fabric = mapOwnFabricRow(data as OwnFabricRow);
  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'OWN_FABRIC_CREATED',
    entityType: 'own_fabric',
    entityId: fabric.id,
    metadata: { name: fabric.name, pricePerMeterEur: fabric.price_per_meter_eur },
  });

  revalidatePath('/admin/management');
  revalidatePath('/dashboard/rfqs/new');
  return { data: fabric };
}

export async function updateOwnFabric(id: string, input: OwnFabricInput): Promise<OwnFabricResult> {
  const user = await requireRole('sales');
  const validationError = validateInput(input);
  if (validationError) {
    return { error: { _form: [validationError] } };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('own_fabrics')
    .update({
      name: normalizeName(input.name),
      price_per_meter_eur: Number(input.price_per_meter_eur),
      ...(input.is_active === undefined ? {} : { is_active: input.is_active }),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    return {
      error: {
        _form: [isDuplicateNameError(error) ? 'A fabric with this name already exists.' : error?.message ?? 'Fabric could not be saved.'],
      },
    };
  }

  const fabric = mapOwnFabricRow(data as OwnFabricRow);
  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'OWN_FABRIC_UPDATED',
    entityType: 'own_fabric',
    entityId: fabric.id,
    metadata: { name: fabric.name, pricePerMeterEur: fabric.price_per_meter_eur, isActive: fabric.is_active },
  });

  revalidatePath('/admin/management');
  revalidatePath('/dashboard/rfqs/new');
  return { data: fabric };
}

/**
 * Removes a fabric from the list. Requests that already reference it keep
 * their fabric name (the id is set to null by the database).
 */
export async function deleteOwnFabric(id: string): Promise<DeleteOwnFabricResult> {
  const user = await requireRole('sales');
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('own_fabrics').delete().eq('id', id);

  if (error) {
    return { error: { _form: [error.message] } };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'OWN_FABRIC_DELETED',
    entityType: 'own_fabric',
    entityId: id,
  });

  revalidatePath('/admin/management');
  revalidatePath('/dashboard/rfqs/new');
  return { data: { id } };
}
