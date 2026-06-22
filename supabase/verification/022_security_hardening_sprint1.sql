-- Read-only verification for supabase/migrations/022_security_hardening_sprint1.sql
-- Run this after applying the migration.

-- 1) Function security state.
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security_type,
  p.proconfig as config,
  array_to_string(p.proacl, ',') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_user_role', 'get_suppliers_for_material', 'update_updated_at_column')
order by p.proname, args;

-- 2) RFQ attachment bucket limits.
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'rfq-attachments';

-- 3) RFQ attachment storage policies.
select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    coalesce(qual, '') like '%rfq-attachments%'
    or coalesce(with_check, '') like '%rfq-attachments%'
  )
order by policyname;

-- 4) Sprint 1 supplier FK indexes.
with target_indexes as (
  select 'idx_rfq_comments_supplier'::text as index_name
  union all select 'idx_rfq_quotes_supplier'
)
select
  t.index_name,
  to_regclass('public.' || t.index_name) is not null as exists
from target_indexes t;
