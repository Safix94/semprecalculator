'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { buildSortOrderUpdates } from '@/lib/sort-order';
import { logAuditEvent } from './audit';
import type { FinishOption } from '@/types';

type FinishOptionResult = { data: FinishOption } | { error: { _form: string[] } };
type DeleteFinishOptionResult = { data: { id: string } } | { error: { _form: string[] } };

interface CreateFinishOptionInput {
  name: string;
  abbreviation?: string | null;
  formula_percentage?: number | null;
  sort_order?: number;
}

interface UpdateFinishOptionInput {
  name?: string;
  abbreviation?: string | null;
  formula_percentage?: number | null;
  sort_order?: number;
  is_active?: boolean;
}

interface ReorderFinishOptionsInput {
  orderedIds: string[];
}

interface StoredFinishOptionsFile {
  options: FinishOption[];
}

const STORAGE_BUCKET = 'app-config';
const FINISH_OPTIONS_PATH = 'finish-options.json';
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function normalizeAbbreviation(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, '').toUpperCase() ?? '';
  return normalized || null;
}

function normalizeFormulaPercentage(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeSortOrder(value: number | undefined): number {
  return Number.isFinite(value) ? Math.trunc(value as number) : 0;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sortFinishOptions(options: FinishOption[]): FinishOption[] {
  return [...options].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

function isFinishOptionsTableMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) {
    return false;
  }

  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.message?.toLowerCase().includes('finish_options') === true &&
      error.message.toLowerCase().includes('schema cache')
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

async function seedFinishOptionsFromMaterials(): Promise<FinishOption[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('materials')
    .select('finish_options, finish_options_top, finish_options_edge, finish_options_color');

  if (error) {
    console.error('Failed to seed finish options from materials:', error.message);
    return [];
  }

  const seen = new Map<string, string>();
  for (const material of data ?? []) {
    const allFinishes = [
      ...((material.finish_options ?? []) as string[]),
      ...((material.finish_options_top ?? []) as string[]),
      ...((material.finish_options_edge ?? []) as string[]),
      ...((material.finish_options_color ?? []) as string[]),
    ];

    for (const finish of allFinishes) {
      const normalized = normalizeName(finish);
      if (!normalized) {
        continue;
      }
      const key = normalized.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, normalized);
      }
    }
  }

  const timestamp = nowIso();
  return sortFinishOptions(
    Array.from(seen.values()).map((name) => ({
      id: randomUUID(),
      name,
      abbreviation: null,
      formula_percentage: null,
      sort_order: 0,
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp,
    }))
  );
}

async function readStoredFinishOptions(seedIfMissing = true): Promise<{
  options: FinishOption[];
  error: string | null;
}> {
  const { supabase, error: bucketError } = await ensureStorageBucket();
  if (bucketError) {
    return { options: [], error: bucketError };
  }

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(FINISH_OPTIONS_PATH);

  if (error) {
    const isMissing = error.message.toLowerCase().includes('not found') || error.message.toLowerCase().includes('does not exist');
    if (!isMissing || !seedIfMissing) {
      return { options: [], error: isMissing ? null : error.message };
    }

    const seededOptions = await seedFinishOptionsFromMaterials();
    const writeError = await writeStoredFinishOptions(seededOptions);
    return { options: seededOptions, error: writeError };
  }

  try {
    const text = await data.text();
    const parsed = JSON.parse(text) as StoredFinishOptionsFile;
    return { options: Array.isArray(parsed.options) ? parsed.options : [], error: null };
  } catch (parseError) {
    console.error('Failed to parse stored finish options:', parseError);
    return { options: [], error: 'Stored finish list could not be parsed.' };
  }
}

async function writeStoredFinishOptions(options: FinishOption[]): Promise<string | null> {
  const { supabase, error: bucketError } = await ensureStorageBucket();
  if (bucketError) {
    return bucketError;
  }

  const file: StoredFinishOptionsFile = { options: sortFinishOptions(options) };
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(FINISH_OPTIONS_PATH, JSON.stringify(file, null, 2), {
      contentType: 'application/json',
      upsert: true,
    });

  return error?.message ?? null;
}

async function getStoredActiveFinishOptions(): Promise<FinishOption[]> {
  const { options, error } = await readStoredFinishOptions(true);
  if (error) {
    console.error('Failed to load stored finish options:', error);
    return [];
  }

  return sortFinishOptions(options.filter((option) => option.is_active));
}

async function getNextFinishOptionSortOrder(supabase: SupabaseServerClient): Promise<number> {
  const { data, error } = await supabase
    .from('finish_options')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isFinishOptionsTableMissing(error)) {
    const { options } = await readStoredFinishOptions(true);
    return Math.max(0, ...options.map((option) => option.sort_order ?? 0)) + 10;
  }

  if (error) {
    throw new Error(error.message);
  }

  return normalizeSortOrder(data?.sort_order) + 10;
}

async function createStoredFinishOption(input: CreateFinishOptionInput): Promise<FinishOptionResult> {
  const name = normalizeName(input.name);
  if (!name) {
    return { error: { _form: ['Name is required.'] } };
  }

  const abbreviation = normalizeAbbreviation(input.abbreviation);
  const hasFormulaPercentageInput = input.formula_percentage !== undefined;
  const formulaPercentage = normalizeFormulaPercentage(input.formula_percentage);
  const { options, error } = await readStoredFinishOptions(true);
  if (error) {
    return { error: { _form: [error] } };
  }

  const timestamp = nowIso();
  const existingIndex = options.findIndex((option) => option.name.toLowerCase() === name.toLowerCase());
  const sortOrder = input.sort_order === undefined
    ? Math.max(0, ...options.map((option) => option.sort_order ?? 0)) + 10
    : normalizeSortOrder(input.sort_order);

  let finishOption: FinishOption;
  if (existingIndex >= 0) {
    finishOption = {
      ...options[existingIndex],
      name,
      abbreviation,
      formula_percentage: hasFormulaPercentageInput ? formulaPercentage : options[existingIndex].formula_percentage ?? null,
      sort_order: sortOrder,
      is_active: true,
      updated_at: timestamp,
    };
    options[existingIndex] = finishOption;
  } else {
    finishOption = {
      id: randomUUID(),
      name,
      abbreviation,
      formula_percentage: formulaPercentage,
      sort_order: sortOrder,
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp,
    };
    options.push(finishOption);
  }

  const writeError = await writeStoredFinishOptions(options);
  if (writeError) {
    return { error: { _form: [writeError] } };
  }

  return { data: finishOption };
}

async function updateStoredFinishOption(
  finishOptionId: string,
  input: UpdateFinishOptionInput
): Promise<FinishOptionResult> {
  const { options, error } = await readStoredFinishOptions(true);
  if (error) {
    return { error: { _form: [error] } };
  }

  const index = options.findIndex((option) => option.id === finishOptionId);
  if (index < 0) {
    return { error: { _form: ['Finish not found.'] } };
  }

  const updates: Partial<FinishOption> = { updated_at: nowIso() };
  if (input.name !== undefined) {
    const name = normalizeName(input.name);
    if (!name) {
      return { error: { _form: ['Name is required.'] } };
    }
    updates.name = name;
  }
  if (input.abbreviation !== undefined) {
    updates.abbreviation = normalizeAbbreviation(input.abbreviation);
  }
  if (input.formula_percentage !== undefined) {
    updates.formula_percentage = normalizeFormulaPercentage(input.formula_percentage);
  }
  if (input.sort_order !== undefined) {
    updates.sort_order = normalizeSortOrder(input.sort_order);
  }
  if (input.is_active !== undefined) {
    updates.is_active = input.is_active;
  }

  const nextOption = { ...options[index], ...updates };
  options[index] = nextOption;

  const writeError = await writeStoredFinishOptions(options);
  if (writeError) {
    return { error: { _form: [writeError] } };
  }

  return { data: nextOption };
}

async function deleteStoredFinishOption(finishOptionId: string): Promise<DeleteFinishOptionResult> {
  const result = await updateStoredFinishOption(finishOptionId, { is_active: false });
  if ('error' in result) {
    return result;
  }

  return { data: { id: finishOptionId } };
}

async function reorderStoredFinishOptions(orderedIds: string[]): Promise<{ data: FinishOption[] } | { error: { _form: string[] } }> {
  const { options, error } = await readStoredFinishOptions(true);
  if (error) {
    return { error: { _form: [error] } };
  }

  let updates;
  try {
    updates = buildSortOrderUpdates(orderedIds);
  } catch (reorderError) {
    return { error: { _form: [reorderError instanceof Error ? reorderError.message : 'Invalid finish order.'] } };
  }

  const activeOptions = options.filter((option) => option.is_active);
  const activeOptionIds = new Set(activeOptions.map((option) => option.id));
  if (updates.length !== activeOptions.length || updates.some((update) => !activeOptionIds.has(update.id))) {
    return { error: { _form: ['One or more finishes could not be found.'] } };
  }

  const sortOrderById = new Map(updates.map((update) => [update.id, update.sort_order]));
  const timestamp = nowIso();
  const reorderedOptions = options.map((option) => {
    const sortOrder = sortOrderById.get(option.id);
    return sortOrder === undefined
      ? option
      : { ...option, sort_order: sortOrder, updated_at: timestamp };
  });

  const writeError = await writeStoredFinishOptions(reorderedOptions);
  if (writeError) {
    return { error: { _form: [writeError] } };
  }

  return { data: sortFinishOptions(reorderedOptions.filter((option) => option.is_active)) };
}

export async function getFinishOptions(): Promise<FinishOption[]> {
  await requireRole('sales');

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('finish_options')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (isFinishOptionsTableMissing(error)) {
      return getStoredActiveFinishOptions();
    }

    if (error) {
      console.error('Failed to fetch finish options:', error.message);
      return [];
    }

    return (data ?? []) as FinishOption[];
  } catch (error) {
    console.error('Failed to fetch finish options:', error);
    return getStoredActiveFinishOptions();
  }
}

export async function createFinishOption(input: CreateFinishOptionInput): Promise<FinishOptionResult> {
  const user = await requireRole('sales');
  const supabase = await createClient();
  const name = normalizeName(input.name);
  const abbreviation = normalizeAbbreviation(input.abbreviation);
  const hasFormulaPercentageInput = input.formula_percentage !== undefined;
  const formulaPercentage = normalizeFormulaPercentage(input.formula_percentage);

  if (!name) {
    return { error: { _form: ['Name is required.'] } };
  }

  let sortOrder: number;
  try {
    sortOrder = input.sort_order === undefined
      ? await getNextFinishOptionSortOrder(supabase)
      : normalizeSortOrder(input.sort_order);
  } catch (error) {
    return { error: { _form: [error instanceof Error ? error.message : 'Sort order could not be calculated.'] } };
  }

  const { data: existing, error: existingError } = await supabase
    .from('finish_options')
    .select('*')
    .ilike('name', name)
    .maybeSingle();

  if (isFinishOptionsTableMissing(existingError)) {
    const result = await createStoredFinishOption({ name, abbreviation, formula_percentage: formulaPercentage, sort_order: sortOrder });
    if ('data' in result) {
      await logAuditEvent({
        actorType: user.role,
        actorId: user.id,
        action: 'FINISH_OPTION_CREATED',
        entityType: 'finish_option',
        entityId: result.data.id,
        metadata: { name: result.data.name, abbreviation: result.data.abbreviation, formulaPercentage: result.data.formula_percentage, sortOrder: result.data.sort_order, storageFallback: true },
      });
      revalidatePath('/admin/management');
      revalidatePath('/dashboard');
    }
    return result;
  }

  if (existingError) {
    return { error: { _form: [existingError.message] } };
  }

  if (existing) {
    const { data: reactivated, error: updateError } = await supabase
      .from('finish_options')
      .update({
        name,
        abbreviation,
        ...(hasFormulaPercentageInput ? { formula_percentage: formulaPercentage } : {}),
        sort_order: sortOrder,
        is_active: true,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (updateError) {
      return { error: { _form: [updateError.message] } };
    }

    await logAuditEvent({
      actorType: user.role,
      actorId: user.id,
      action: 'FINISH_OPTION_REACTIVATED',
      entityType: 'finish_option',
      entityId: reactivated.id,
      metadata: { name: reactivated.name, abbreviation: reactivated.abbreviation, formulaPercentage: reactivated.formula_percentage, sortOrder: reactivated.sort_order },
    });

    revalidatePath('/admin/management');
    revalidatePath('/dashboard');
    return { data: reactivated as FinishOption };
  }

  const { data, error } = await supabase
    .from('finish_options')
    .insert({ name, abbreviation, formula_percentage: formulaPercentage, sort_order: sortOrder })
    .select()
    .single();

  if (isFinishOptionsTableMissing(error)) {
    const result = await createStoredFinishOption({ name, abbreviation, formula_percentage: formulaPercentage, sort_order: sortOrder });
    if ('data' in result) {
      await logAuditEvent({
        actorType: user.role,
        actorId: user.id,
        action: 'FINISH_OPTION_CREATED',
        entityType: 'finish_option',
        entityId: result.data.id,
        metadata: { name: result.data.name, abbreviation: result.data.abbreviation, formulaPercentage: result.data.formula_percentage, sortOrder: result.data.sort_order, storageFallback: true },
      });
      revalidatePath('/admin/management');
      revalidatePath('/dashboard');
    }
    return result;
  }

  if (error) {
    return { error: { _form: [error.message] } };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'FINISH_OPTION_CREATED',
    entityType: 'finish_option',
    entityId: data.id,
    metadata: { name: data.name, abbreviation: data.abbreviation, formulaPercentage: data.formula_percentage, sortOrder: data.sort_order },
  });

  revalidatePath('/admin/management');
  revalidatePath('/dashboard');
  return { data: data as FinishOption };
}

export async function updateFinishOption(
  finishOptionId: string,
  input: UpdateFinishOptionInput
): Promise<FinishOptionResult> {
  const user = await requireRole('sales');
  const supabase = await createClient();

  const updates: UpdateFinishOptionInput = {};
  if (input.name !== undefined) {
    const name = normalizeName(input.name);
    if (!name) {
      return { error: { _form: ['Name is required.'] } };
    }
    updates.name = name;
  }
  if (input.abbreviation !== undefined) {
    updates.abbreviation = normalizeAbbreviation(input.abbreviation);
  }
  if (input.formula_percentage !== undefined) {
    updates.formula_percentage = normalizeFormulaPercentage(input.formula_percentage);
  }
  if (input.sort_order !== undefined) {
    updates.sort_order = normalizeSortOrder(input.sort_order);
  }
  if (input.is_active !== undefined) {
    updates.is_active = input.is_active;
  }

  const { data, error } = await supabase
    .from('finish_options')
    .update(updates)
    .eq('id', finishOptionId)
    .select()
    .single();

  if (isFinishOptionsTableMissing(error)) {
    const result = await updateStoredFinishOption(finishOptionId, input);
    if ('data' in result) {
      await logAuditEvent({
        actorType: user.role,
        actorId: user.id,
        action: 'FINISH_OPTION_UPDATED',
        entityType: 'finish_option',
        entityId: result.data.id,
        metadata: {
          name: result.data.name,
          abbreviation: result.data.abbreviation,
          formulaPercentage: result.data.formula_percentage,
          sortOrder: result.data.sort_order,
          isActive: result.data.is_active,
          storageFallback: true,
        },
      });
      revalidatePath('/admin/management');
      revalidatePath('/dashboard');
    }
    return result;
  }

  if (error) {
    return { error: { _form: [error.message] } };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'FINISH_OPTION_UPDATED',
    entityType: 'finish_option',
    entityId: data.id,
    metadata: { name: data.name, abbreviation: data.abbreviation, formulaPercentage: data.formula_percentage, sortOrder: data.sort_order, isActive: data.is_active },
  });

  revalidatePath('/admin/management');
  revalidatePath('/dashboard');
  return { data: data as FinishOption };
}

export async function reorderFinishOptions(input: ReorderFinishOptionsInput): Promise<{ data: FinishOption[] } | { error: { _form: string[] } }> {
  const user = await requireRole('sales');
  const supabase = await createClient();

  let updates;
  try {
    updates = buildSortOrderUpdates(input.orderedIds);
  } catch (error) {
    return { error: { _form: [error instanceof Error ? error.message : 'Invalid finish order.'] } };
  }

  if (updates.length === 0) {
    return { error: { _form: ['No finishes provided.'] } };
  }

  const { data: existingFinishOptions, error: existingError } = await supabase
    .from('finish_options')
    .select('id')
    .eq('is_active', true)
    .in('id', updates.map((update) => update.id));

  if (isFinishOptionsTableMissing(existingError)) {
    const result = await reorderStoredFinishOptions(input.orderedIds);
    if ('data' in result) {
      await logAuditEvent({
        actorType: user.role,
        actorId: user.id,
        action: 'FINISH_OPTIONS_REORDERED',
        entityType: 'finish_option',
        entityId: 'bulk',
        metadata: { orderedIds: updates.map((update) => update.id), storageFallback: true },
      });
      revalidatePath('/admin/management');
      revalidatePath('/dashboard');
    }
    return result;
  }

  if (existingError) {
    return { error: { _form: [existingError.message] } };
  }

  if ((existingFinishOptions ?? []).length !== updates.length) {
    return { error: { _form: ['One or more finishes could not be found.'] } };
  }

  for (const update of updates) {
    const { error } = await supabase
      .from('finish_options')
      .update({ sort_order: update.sort_order })
      .eq('id', update.id);

    if (error) {
      return { error: { _form: [error.message] } };
    }
  }

  const { data, error } = await supabase
    .from('finish_options')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    return { error: { _form: [error.message] } };
  }

  const reorderedFinishOptions = sortFinishOptions((data ?? []) as FinishOption[]);

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'FINISH_OPTIONS_REORDERED',
    entityType: 'finish_option',
    entityId: 'bulk',
    metadata: { orderedIds: updates.map((update) => update.id) },
  });

  revalidatePath('/admin/management');
  revalidatePath('/dashboard');
  return { data: reorderedFinishOptions };
}

export async function deleteFinishOption(finishOptionId: string): Promise<DeleteFinishOptionResult> {
  const user = await requireRole('sales');
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('finish_options')
    .update({ is_active: false })
    .eq('id', finishOptionId)
    .select()
    .single();

  if (isFinishOptionsTableMissing(error)) {
    const result = await deleteStoredFinishOption(finishOptionId);
    if ('data' in result) {
      await logAuditEvent({
        actorType: user.role,
        actorId: user.id,
        action: 'FINISH_OPTION_DEACTIVATED',
        entityType: 'finish_option',
        entityId: finishOptionId,
        metadata: { storageFallback: true },
      });
      revalidatePath('/admin/management');
      revalidatePath('/dashboard');
    }
    return result;
  }

  if (error) {
    return { error: { _form: [error.message] } };
  }

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'FINISH_OPTION_DEACTIVATED',
    entityType: 'finish_option',
    entityId: finishOptionId,
    metadata: { name: data.name },
  });

  revalidatePath('/admin/management');
  revalidatePath('/dashboard');
  return { data: { id: finishOptionId } };
}
