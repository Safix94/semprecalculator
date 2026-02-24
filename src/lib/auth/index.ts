import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AuthUser, UserRole } from '@/types';

/**
 * Auth interface - abstracted for easy migration to Clerk later.
 *
 * TODO [CLERK MIGRATION]:
 * - Replace Supabase Auth calls with Clerk equivalents
 * - getCurrentUser() -> use Clerk's auth() or currentUser()
 * - requireRole() -> use Clerk's auth().sessionClaims or org roles
 * - Sign in/out -> replace with Clerk components
 * - Remove Supabase Auth dependency after migration
 */

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    // Fetch role from user_roles table
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData) return null;

    return {
      id: user.id,
      email: user.email ?? '',
      role: roleData.role as UserRole,
    };
  } catch (error) {
    console.error('Failed to resolve current user:', error);
    return null;
  }
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  return user;
}

export async function requireRole(role: UserRole): Promise<AuthUser> {
  const user = await requireAuth();
  if (user.role !== role && user.role !== 'admin') {
    // Admin can access everything, otherwise redirect with hint so dashboard can show a message
    redirect('/dashboard?admin_required=1');
  }
  return user;
}
