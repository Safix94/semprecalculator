'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { logAuditEvent } from './audit';
import type { UserRole, UserWithRole } from '@/types';

interface ListUsersWithRolesOptions {
  page?: number;
  perPage?: number;
}

export async function listUsersWithRoles(
  options: ListUsersWithRolesOptions = {}
): Promise<UserWithRole[]> {
  await requireRole('admin');
  const page = options.page ?? 1;
  const perPage = options.perPage ?? 200;

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

    if (error) {
      console.error('Failed to list auth users:', error.message);
      return [];
    }

    const users = data.users ?? [];
    if (users.length === 0) {
      return [];
    }

    const userIds = users.map((user) => user.id);
    const { data: roleRows, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds);

    if (rolesError) {
      console.error('Failed to fetch user roles:', rolesError.message);
      return users.map((user) => ({
        id: user.id,
        email: user.email ?? null,
        role: null,
      }));
    }

    const rolesByUserId = new Map(
      (roleRows ?? []).map((row) => [row.user_id, row.role as UserRole])
    );

    return users
      .map((user) => ({
        id: user.id,
        email: user.email ?? null,
        role: rolesByUserId.get(user.id) ?? null,
      }))
      .sort((a, b) => {
        const emailA = a.email ?? '';
        const emailB = b.email ?? '';
        return emailA.localeCompare(emailB, undefined, { sensitivity: 'base' });
      });
  } catch (error) {
    console.error('Failed to list users with roles:', error);
    return [];
  }
}

function generateTemporaryPassword() {
  return `Sempre-${randomBytes(18).toString('base64url')}-1a`;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function createUserWithRole(input: { email: string; role: UserRole }) {
  const currentUser = await requireRole('admin');
  const email = input.email.trim().toLowerCase();
  const role = input.role;

  if (!isValidEmail(email)) {
    return { error: { email: ['Enter a valid email address.'] } };
  }

  if (role !== 'sales' && role !== 'admin') {
    return { error: { role: ['Invalid role.'] } };
  }

  const supabase = createServiceRoleClient();
  const temporaryPassword = generateTemporaryPassword();

  const { data: createdUserData, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  });

  if (createError || !createdUserData.user) {
    const message = createError?.message ?? 'Could not create user.';
    return {
      error: {
        _form: [message.toLowerCase().includes('already') ? 'A user with this email already exists.' : message],
      },
    };
  }

  const createdUser = createdUserData.user;
  const { error: roleError } = await supabase
    .from('user_roles')
    .upsert({ user_id: createdUser.id, role }, { onConflict: 'user_id' });

  if (roleError) {
    await supabase.auth.admin.deleteUser(createdUser.id);
    return { error: { _form: [`User was created in Auth, but role setup failed: ${roleError.message}`] } };
  }

  await logAuditEvent({
    actorType: currentUser.role,
    actorId: currentUser.id,
    action: 'USER_CREATED',
    entityType: 'user',
    entityId: createdUser.id,
    metadata: { email, role },
  });

  revalidatePath('/admin/management');
  return {
    data: {
      id: createdUser.id,
      email,
      role,
      temporaryPassword,
    },
  };
}

export async function setUserRole(userId: string, role: UserRole) {
  const currentUser = await requireRole('admin');

  if (!userId) {
    return { error: { _form: ['User ID is required.'] } };
  }

  if (userId === currentUser.id) {
    return { error: { _form: ['You cannot change your own role.'] } };
  }

  if (role !== 'sales' && role !== 'admin') {
    return { error: { _form: ['Invalid role.'] } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_roles')
    .upsert(
      {
        user_id: userId,
        role,
      },
      { onConflict: 'user_id' }
    )
    .select('user_id, role')
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  await logAuditEvent({
    actorType: currentUser.role,
    actorId: currentUser.id,
    action: 'USER_ROLE_UPDATED',
    entityType: 'user_role',
    entityId: userId,
    metadata: { role },
  });

  revalidatePath('/admin/management');
  return { data: { user_id: data.user_id, role: data.role as UserRole } };
}
