-- ============================================================
-- Sempre Calculator - Initial Schema
-- ============================================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

-- Suppliers
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  materials text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_suppliers_materials on suppliers using gin (materials);
create index idx_suppliers_active on suppliers (is_active) where is_active = true;

-- User roles (for internal users: sales/admin)
create table user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('sales', 'admin')),
  created_at timestamptz not null default now()
);

-- RFQs
create table rfqs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  customer_name text,
  material text not null,
  length numeric not null,
  width numeric not null,
  height numeric not null,
  thickness numeric not null,
  shape text not null,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'closed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index idx_rfqs_status on rfqs (status);
create index idx_rfqs_created_by on rfqs (created_by);
create index idx_rfqs_material on rfqs (material);

-- RFQ Attachments
create table rfq_attachments (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references rfqs(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);

create index idx_rfq_attachments_rfq on rfq_attachments (rfq_id);

-- RFQ Invites (magic links for suppliers)
create table rfq_invites (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references rfqs(id) on delete cascade,
  supplier_id uuid not null references suppliers(id),
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  last_access_at timestamptz,
  created_at timestamptz not null default now(),
  unique (rfq_id, supplier_id)
);

create index idx_rfq_invites_token_hash on rfq_invites (token_hash);
create index idx_rfq_invites_rfq on rfq_invites (rfq_id);
create index idx_rfq_invites_supplier on rfq_invites (supplier_id);

-- RFQ Quotes
create table rfq_quotes (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references rfqs(id) on delete cascade,
  supplier_id uuid not null references suppliers(id),
  base_price numeric not null,
  volume_m3 numeric(10,3) not null,
  shipping_cost_calculated numeric(10,3) not null,
  final_price_calculated numeric(12,2) not null,
  currency text not null default 'EUR',
  lead_time_days int,
  comment text,
  submitted_at timestamptz not null default now(),
  unique (rfq_id, supplier_id)
);

create index idx_rfq_quotes_rfq on rfq_quotes (rfq_id);

-- Audit Logs
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('sales', 'admin', 'supplier_link', 'system')),
  actor_id text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  ip text,
  user_agent text
);

create index idx_audit_logs_action on audit_logs (action);
create index idx_audit_logs_entity on audit_logs (entity_type, entity_id);
create index idx_audit_logs_created on audit_logs (created_at desc);
create index idx_audit_logs_actor on audit_logs (actor_type, actor_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table suppliers enable row level security;
alter table user_roles enable row level security;
alter table rfqs enable row level security;
alter table rfq_attachments enable row level security;
alter table rfq_invites enable row level security;
alter table rfq_quotes enable row level security;
alter table audit_logs enable row level security;

-- Helper function: get current user's role
create or replace function get_user_role()
returns text
language sql
security definer
stable
as $$
  select role from user_roles where user_id = auth.uid();
$$;

-- ── Suppliers ──
-- Sales and admin can read active suppliers
create policy "internal_read_suppliers"
  on suppliers for select
  to authenticated
  using (get_user_role() in ('sales', 'admin'));

-- Only admin can manage suppliers
create policy "admin_manage_suppliers"
  on suppliers for all
  to authenticated
  using (get_user_role() = 'admin')
  with check (get_user_role() = 'admin');

-- ── User Roles ──
create policy "users_read_own_role"
  on user_roles for select
  to authenticated
  using (user_id = auth.uid());

create policy "admin_manage_roles"
  on user_roles for all
  to authenticated
  using (get_user_role() = 'admin')
  with check (get_user_role() = 'admin');

-- ── RFQs ──
-- Sales and admin can read all RFQs
create policy "internal_read_rfqs"
  on rfqs for select
  to authenticated
  using (get_user_role() in ('sales', 'admin'));

-- Sales can create and update their own RFQs
create policy "sales_create_rfqs"
  on rfqs for insert
  to authenticated
  with check (get_user_role() in ('sales', 'admin') and created_by = auth.uid());

create policy "sales_update_rfqs"
  on rfqs for update
  to authenticated
  using (get_user_role() in ('sales', 'admin'));

-- ── RFQ Attachments ──
create policy "internal_read_attachments"
  on rfq_attachments for select
  to authenticated
  using (get_user_role() in ('sales', 'admin'));

create policy "sales_manage_attachments"
  on rfq_attachments for insert
  to authenticated
  with check (get_user_role() in ('sales', 'admin'));

-- ── RFQ Invites ──
create policy "internal_read_invites"
  on rfq_invites for select
  to authenticated
  using (get_user_role() in ('sales', 'admin'));

create policy "internal_manage_invites"
  on rfq_invites for all
  to authenticated
  using (get_user_role() in ('sales', 'admin'))
  with check (get_user_role() in ('sales', 'admin'));

-- ── RFQ Quotes ──
create policy "internal_read_quotes"
  on rfq_quotes for select
  to authenticated
  using (get_user_role() in ('sales', 'admin'));

-- ── Audit Logs ──
-- Only admin can read audit logs
create policy "admin_read_audit_logs"
  on audit_logs for select
  to authenticated
  using (get_user_role() = 'admin');

-- System inserts via service role, no RLS policy needed for insert
-- (service role bypasses RLS)

-- ============================================================
-- STORAGE BUCKET
-- ============================================================

-- Create bucket for RFQ attachments (run via Supabase dashboard or API)
-- insert into storage.buckets (id, name, public) values ('rfq-attachments', 'rfq-attachments', false);

-- Storage policies would be:
-- Authenticated users (sales/admin) can upload
-- Authenticated users (sales/admin) can read
-- Supplier access to attachments is handled via server-side signed URLs
