-- Read-only verification for supabase/migrations/023_private_role_helper.sql
-- Run this after applying the migration.

-- 1) Public helper should no longer be SECURITY DEFINER.
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security_type,
  p.proconfig as config,
  array_to_string(p.proacl, ',') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname = 'get_user_role')
   or (n.nspname = 'private' and p.proname = 'get_user_role')
order by schema, function_name, args;

-- 2) Policies should call private.get_user_role(), not the exposed public helper.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where coalesce(qual, '') like '%get_user_role%'
   or coalesce(with_check, '') like '%get_user_role%'
order by schemaname, tablename, policyname;

-- 3) Count any policies that still use unqualified/public get_user_role().
select count(*) as policies_still_using_exposed_helper
from pg_policies
where (
  coalesce(qual, '') ~ '(^|[^.])get_user_role\(\)'
  or coalesce(with_check, '') ~ '(^|[^.])get_user_role\(\)'
);
