import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
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
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  return (
    <>
      <h1 className="text-2xl font-bold mb-6">Audit Logs</h1>
      <AuditLogTable
        logs={(logs as AuditLog[]) ?? []}
        currentPage={page}
        totalPages={totalPages}
        filters={params}
      />
    </>
  );
}
