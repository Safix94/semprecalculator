-- ============================================================
-- Supplier-level pricing profiles and quote pricing snapshots
-- ============================================================

create table if not exists supplier_pricing_profiles (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null unique references suppliers(id) on delete cascade,
  transport_mode text not null default 'container' check (transport_mode in ('none', 'container', 'truck')),
  formula_version text not null default 'supplier_transport_v1',
  container_price_eur numeric(12,2) check (container_price_eur is null or container_price_eur > 0),
  container_volume_m3 numeric(10,3) check (container_volume_m3 is null or container_volume_m3 > 0),
  product_margin_factor numeric(8,3) not null default 2.1 check (product_margin_factor > 0),
  retail_multiplier_factor numeric(8,3) not null default 2.4 check (retail_multiplier_factor > 0),
  truck_multiplier_factor numeric(8,3) check (truck_multiplier_factor is null or truck_multiplier_factor > 0),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_pricing_container_required check (
    transport_mode <> 'container'
    or (container_price_eur is not null and container_volume_m3 is not null)
  )
);

create index if not exists idx_supplier_pricing_profiles_supplier
  on supplier_pricing_profiles (supplier_id);

insert into supplier_pricing_profiles (
  supplier_id,
  transport_mode,
  formula_version,
  container_price_eur,
  container_volume_m3,
  product_margin_factor,
  retail_multiplier_factor
)
select
  s.id,
  'container',
  'supplier_transport_v1',
  coalesce(ps.container_price_eur, 7500),
  coalesce(ps.container_volume_m3, 67),
  coalesce(ps.product_margin_factor, 2.1),
  coalesce(ps.shipping_margin_factor, 2.4)
from suppliers s
left join pricing_settings ps on ps.id = 1
where s.is_active = true
on conflict (supplier_id) do nothing;

alter table supplier_pricing_profiles enable row level security;

drop policy if exists "internal_read_supplier_pricing_profiles" on supplier_pricing_profiles;
drop policy if exists "internal_manage_supplier_pricing_profiles" on supplier_pricing_profiles;

create policy "internal_read_supplier_pricing_profiles"
  on supplier_pricing_profiles for select
  to authenticated
  using (private.get_user_role() in ('sales', 'admin'));

create policy "internal_manage_supplier_pricing_profiles"
  on supplier_pricing_profiles for all
  to authenticated
  using (private.get_user_role() in ('sales', 'admin'))
  with check (private.get_user_role() in ('sales', 'admin'));

drop trigger if exists update_supplier_pricing_profiles_updated_at on supplier_pricing_profiles;
create trigger update_supplier_pricing_profiles_updated_at
  before update on supplier_pricing_profiles
  for each row
  execute function update_updated_at_column();

alter table rfq_quotes
  add column if not exists pricing_method text check (pricing_method in ('legacy_container', 'none', 'container', 'truck')),
  add column if not exists pricing_formula_version text,
  add column if not exists product_price_after_margin numeric(12,2),
  add column if not exists transport_cost_calculated numeric(12,3),
  add column if not exists cost_including_transport numeric(12,2),
  add column if not exists retail_multiplier_factor numeric(8,3),
  add column if not exists pricing_settings_snapshot jsonb;

update rfq_quotes
set
  pricing_method = coalesce(pricing_method, 'legacy_container'),
  pricing_formula_version = coalesce(pricing_formula_version, 'global_pricing_v1'),
  transport_cost_calculated = coalesce(transport_cost_calculated, shipping_cost_calculated),
  pricing_settings_snapshot = coalesce(
    pricing_settings_snapshot,
    jsonb_build_object(
      'formulaVersion', 'global_pricing_v1',
      'transportMode', 'legacy_container',
      'note', 'Legacy quote calculated before supplier-level pricing profiles.'
    )
  )
where pricing_method is null
   or pricing_formula_version is null
   or transport_cost_calculated is null
   or pricing_settings_snapshot is null;
