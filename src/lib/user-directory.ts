import { unstable_cache, updateTag } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';

const USER_EMAIL_MAP_TAG = 'user-email-map';

// One listUsers call, cached across requests — replaces per-user
// auth.admin.getUserById fan-outs. The staff roster is tiny and changes rarely.
const loadUserEmailEntries = unstable_cache(
  async (): Promise<Array<[string, string]>> => {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

    if (error) {
      console.error('Failed to list users for email map:', error.message);
      return [];
    }

    return (data.users ?? [])
      .filter((user) => Boolean(user.email))
      .map((user) => [user.id, user.email as string]);
  },
  ['user-email-map'],
  { revalidate: 600, tags: [USER_EMAIL_MAP_TAG] }
);

export async function getUserEmailMap(): Promise<Map<string, string>> {
  return new Map(await loadUserEmailEntries());
}

// Only call from within a Server Action (updateTag requirement).
export function revalidateUserEmailMap() {
  updateTag(USER_EMAIL_MAP_TAG);
}
