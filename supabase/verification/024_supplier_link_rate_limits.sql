-- Read-only verification for supabase/migrations/024_supplier_link_rate_limits.sql
-- Run this after applying the migration.

-- 1) Table exists and RLS is enabled.
select
  n.nspname as schema,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'supplier_link_rate_limits';

-- 2) Expected indexes exist.
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'supplier_link_rate_limits'
order by indexname;

-- 3) Browser roles should have no direct RLS policies on this service-role-only table.
select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'supplier_link_rate_limits'
order by policyname;
