import { requireRole } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { AuditLogTable } from '@/components/audit-log-table';
import type { AuditLog } from '@/types';

interface PageProps {
  searchParams: Promise<{
    action?: string;
    entity_id?: string;
    actor_id?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 50;

function getEmailPrefix(email: string | null | undefined): string | null {
  const prefix = email?.split('@')[0]?.trim();
  return prefix || null;
}

async function buildActorDisplayNameMap(logs: AuditLog[]): Promise<Map<string, string>> {
  const userActorIds = [...new Set(
    logs
      .filter((log) => log.actor_type === 'admin' || log.actor_type === 'sales')
      .map((log) => log.actor_id)
      .filter(Boolean)
  )];

  if (userActorIds.length === 0) {
    return new Map();
  }

  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    console.error('Failed to resolve audit actor names:', error.message);
    return new Map();
  }

  return new Map(
    (data.users ?? [])
      .filter((user) => userActorIds.includes(user.id))
      .map((user) => [user.id, getEmailPrefix(user.email) ?? user.id])
  );
}

function decorateLogsWithActorNames(logs: AuditLog[], actorDisplayNames: Map<string, string>): AuditLog[] {
  return logs.map((log) => ({
    ...log,
    actor_display_name: actorDisplayNames.get(log.actor_id) ?? null,
  }));
}

export default async function AdminLogsPage({ searchParams }: PageProps) {
  await requireRole('admin');
  const params = await searchParams;
  const supabase = await createClient();

  const page = Math.max(1, Number(params.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (params.action) {
    query = query.eq('action', params.action);
  }
  if (params.entity_id) {
    query = query.eq('entity_id', params.entity_id);
  }
  if (params.actor_id) {
    query = query.eq('actor_id', params.actor_id);
  }
  if (params.from) {
    query = query.gte('created_at', params.from);
  }
  if (params.to) {
    query = query.lte('created_at', params.to);
  }

  const { data: logs, count } = await query;
  const auditLogs = (logs as AuditLog[]) ?? [];
  const actorDisplayNames = await buildActorDisplayNameMap(auditLogs);
  const decoratedLogs = decorateLogsWithActorNames(auditLogs, actorDisplayNames);
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  return (
    <>
      <h1 className="text-2xl font-bold mb-6">Audit Logs</h1>
      <AuditLogTable
        logs={decoratedLogs}
        currentPage={page}
        totalPages={totalPages}
        filters={params}
      />
    </>
  );
}
