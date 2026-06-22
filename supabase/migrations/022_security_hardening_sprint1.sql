-- ============================================================
-- Sprint 1 security hardening
-- ============================================================
-- Goals:
-- - Remove public/elevated supplier RPC exposure.
-- - Pin function search_path values reported by Supabase Security Advisor.
-- - Restrict RFQ attachment storage access to sales/admin users.
-- - Add storage bucket limits before real RFQ attachments are uploaded.
-- - Add missing supplier foreign-key indexes for future quote/comment lookups.

-- Keep the RLS helper as SECURITY DEFINER because RLS policies depend on it,
-- but pin the search_path and prevent direct anonymous execution.
create or replace function public.get_user_role()
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

revoke execute on function public.get_user_role() from public;
revoke execute on function public.get_user_role() from anon;
grant execute on function public.get_user_role() to authenticated;
grant execute on function public.get_user_role() to service_role;

-- This RPC does not need elevated privileges. With SECURITY INVOKER, the
-- existing RLS policies on suppliers/material_suppliers decide what the caller
-- may see. Anonymous callers receive no data and cannot bypass RLS.
create or replace function public.get_suppliers_for_material(material_uuid uuid)
returns table(id uuid, name text, email text, is_active boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select s.id, s.name, s.email, s.is_active
  from public.suppliers s
  join public.material_suppliers ms on s.id = ms.supplier_id
  where ms.material_id = material_uuid
    and s.is_active = true;
$$;

revoke execute on function public.get_suppliers_for_material(uuid) from public;
revoke execute on function public.get_suppliers_for_material(uuid) from anon;
grant execute on function public.get_suppliers_for_material(uuid) to authenticated;
grant execute on function public.get_suppliers_for_material(uuid) to service_role;

-- Pin search_path for the generic updated_at trigger function.
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Ensure the private RFQ attachment bucket exists with defensive upload limits.
-- 25 MB is intentionally aligned with the server-side upload validation.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rfq-attachments',
  'rfq-attachments',
  false,
  26214400,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.sketchup.skp',
    'application/acad',
    'application/x-acad',
    'application/x-autocad',
    'image/vnd.dwg',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    updated_at = now();

-- Replace any existing RFQ attachment storage policies. PostgreSQL RLS policies
-- are permissive by default, so leaving one old bucket-only policy in place
-- would keep broad authenticated access open.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') like '%rfq-attachments%'
        or coalesce(with_check, '') like '%rfq-attachments%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_record.policyname);
  end loop;
end $$;

create policy "Sales and admin can read attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'rfq-attachments'
    and public.get_user_role() in ('sales', 'admin')
  );

create policy "Sales and admin can upload attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'rfq-attachments'
    and public.get_user_role() in ('sales', 'admin')
  );

create policy "Sales and admin can delete attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'rfq-attachments'
    and public.get_user_role() in ('sales', 'admin')
  );

-- Low-risk indexes surfaced by the live audit. These are currently cheap
-- because there is no RFQ/quote production data yet.
create index if not exists idx_rfq_comments_supplier
  on public.rfq_comments (supplier_id);

create index if not exists idx_rfq_quotes_supplier
  on public.rfq_quotes (supplier_id);
