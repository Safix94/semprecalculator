-- ============================================================
-- Sprint 1 follow-up: move role helper out of exposed API schema
-- ============================================================
-- Supabase Security Advisor warns when SECURITY DEFINER helpers are directly
-- executable from exposed schemas such as public. Keep the elevated helper for
-- RLS, but move it to a private schema and update policies to call it there.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;
grant usage on schema private to service_role;

create or replace function private.get_user_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select role
  from public.user_roles
  where user_id = auth.uid();
$$;

revoke execute on function private.get_user_role() from public;
revoke execute on function private.get_user_role() from anon;
grant execute on function private.get_user_role() to authenticated;
grant execute on function private.get_user_role() to service_role;

-- Update every existing policy that still references the exposed public helper.
-- pg_policies returns deparsed expressions; replace only unqualified calls so
-- this migration remains safe to re-read and avoids private.private.* rewrites.
do $$
declare
  policy_record record;
  new_qual text;
  new_with_check text;
  sql text;
begin
  for policy_record in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where (
      coalesce(qual, '') ~ '(^|[^.])get_user_role\(\)'
      or coalesce(with_check, '') ~ '(^|[^.])get_user_role\(\)'
    )
  loop
    new_qual := case
      when policy_record.qual is null then null
      else regexp_replace(policy_record.qual, '(^|[^.])get_user_role\(\)', '\1private.get_user_role()', 'g')
    end;

    new_with_check := case
      when policy_record.with_check is null then null
      else regexp_replace(policy_record.with_check, '(^|[^.])get_user_role\(\)', '\1private.get_user_role()', 'g')
    end;

    sql := format(
      'alter policy %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );

    if new_qual is not null then
      sql := sql || format(' using (%s)', new_qual);
    end if;

    if new_with_check is not null then
      sql := sql || format(' with check (%s)', new_with_check);
    end if;

    execute sql;
  end loop;
end $$;

-- Keep a non-elevated compatibility wrapper in public for any accidental direct
-- calls or future migrations that still reference public.get_user_role(). It is
-- no longer a SECURITY DEFINER RPC exposed through public.
create or replace function public.get_user_role()
returns text
language sql
stable
security invoker
set search_path = public, private, auth
as $$
  select private.get_user_role();
$$;

revoke execute on function public.get_user_role() from public;
revoke execute on function public.get_user_role() from anon;
grant execute on function public.get_user_role() to authenticated;
grant execute on function public.get_user_role() to service_role;
