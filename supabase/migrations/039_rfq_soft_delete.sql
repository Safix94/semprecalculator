-- ============================================================
-- Soft delete for RFQs
-- ============================================================
-- Deleted RFQs disappear from every list but keep their quotes, messages and
-- audit trail; an admin can restore them from RFQ history.

alter table public.rfqs
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

create index if not exists idx_rfqs_not_deleted_created
  on public.rfqs (created_at desc)
  where deleted_at is null;
