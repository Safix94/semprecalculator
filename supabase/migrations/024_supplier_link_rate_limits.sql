-- ============================================================
-- Sprint 2: supplier magic-link rate limiting
-- ============================================================
-- Stores hashed rate-limit events for public supplier-link actions.
-- The app writes this table via the service-role client; no browser/client role
-- should read or mutate it directly.

create table if not exists public.supplier_link_rate_limits (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  scope_key text not null,
  scope_name text not null,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.supplier_link_rate_limits enable row level security;

-- No RLS policies by design: service_role bypasses RLS, browser roles get no direct access.

create index if not exists idx_supplier_link_rate_limits_action_scope_created
  on public.supplier_link_rate_limits (action, scope_key, created_at desc);

create index if not exists idx_supplier_link_rate_limits_created
  on public.supplier_link_rate_limits (created_at desc);

create index if not exists idx_supplier_link_rate_limits_ip_created
  on public.supplier_link_rate_limits (ip_hash, created_at desc);

comment on table public.supplier_link_rate_limits is
  'Hashed rate-limit events for public supplier magic-link actions. Written by service-role only.';
