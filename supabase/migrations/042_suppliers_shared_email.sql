-- ============================================================
-- Suppliers may share an email address
-- ============================================================
-- One contact person can be behind several supplier records (e.g. the
-- Sanne Juk and Sanne Vos pricing profiles). The initial schema made
-- suppliers.email unique, so changing a supplier's email to one that
-- another supplier already uses failed with
-- "duplicate key value violates unique constraint suppliers_email_key".
-- Suppliers are identified by id and by their invite tokens, never by
-- email, so the uniqueness is not needed.

alter table public.suppliers
  drop constraint if exists suppliers_email_key;

create index if not exists idx_suppliers_email on public.suppliers (email);
