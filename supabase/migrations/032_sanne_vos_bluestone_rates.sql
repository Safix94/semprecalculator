-- Backend-only special pricing rate table for automatic Sanne Vos Bluestone quotes.
-- This is intentionally not exposed in the management UI.

create table if not exists public.supplier_special_pricing_bluestone_rates (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  shape_kind text not null check (shape_kind in ('straight', 'round')),
  thickness_cm numeric(6,2) not null check (thickness_cm > 0),
  surface_type text not null default 'sanded' check (surface_type in ('sanded', 'saw_cut')),
  base_price_per_m2_eur numeric(12,2) check (base_price_per_m2_eur is null or base_price_per_m2_eur > 0),
  discount_percentage numeric(6,3) not null default 3 check (discount_percentage >= 0 and discount_percentage < 100),
  net_price_per_m2_eur numeric(12,2) generated always as (
    case
      when base_price_per_m2_eur is null then null
      else round((base_price_per_m2_eur * (1 - (discount_percentage / 100)))::numeric, 2)
    end
  ) stored,
  is_supported boolean not null default true,
  unsupported_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_special_bluestone_rate_supported_check check (
    (is_supported and base_price_per_m2_eur is not null and unsupported_reason is null)
    or (not is_supported and base_price_per_m2_eur is null and unsupported_reason is not null)
  )
);

create unique index if not exists idx_supplier_special_bluestone_rates_unique
  on public.supplier_special_pricing_bluestone_rates (supplier_id, material_id, shape_kind, thickness_cm, surface_type);

create index if not exists idx_supplier_special_bluestone_rates_lookup
  on public.supplier_special_pricing_bluestone_rates (supplier_id, material_id, shape_kind, thickness_cm, surface_type, is_supported);

alter table public.supplier_special_pricing_bluestone_rates enable row level security;

drop policy if exists "Internal users can read Sanne Vos Bluestone rates" on public.supplier_special_pricing_bluestone_rates;
create policy "Internal users can read Sanne Vos Bluestone rates"
  on public.supplier_special_pricing_bluestone_rates for select
  using (private.get_user_role() in ('sales', 'admin'));

drop policy if exists "Admins can manage Sanne Vos Bluestone rates" on public.supplier_special_pricing_bluestone_rates;
create policy "Admins can manage Sanne Vos Bluestone rates"
  on public.supplier_special_pricing_bluestone_rates for all
  using (private.get_user_role() = 'admin')
  with check (private.get_user_role() = 'admin');

drop trigger if exists update_supplier_special_bluestone_rates_updated_at on public.supplier_special_pricing_bluestone_rates;
create trigger update_supplier_special_bluestone_rates_updated_at
  before update on public.supplier_special_pricing_bluestone_rates
  for each row execute function update_updated_at_column();

with sanne as (
  select id as supplier_id
  from public.suppliers
  where lower(name) = lower('Sanne Vos')
  limit 1
), bluestone as (
  select id as material_id
  from public.materials
  where lower(name) = lower('Bluestone')
  limit 1
), rates(shape_kind, thickness_cm, surface_type, base_price_per_m2_eur, is_supported, unsupported_reason) as (
  values
    ('straight', 2::numeric, 'sanded', 94::numeric, true, null::text),
    ('round', 2::numeric, 'sanded', 154::numeric, true, null::text),
    ('straight', 3::numeric, 'sanded', 138::numeric, true, null::text),
    ('round', 3::numeric, 'sanded', 213::numeric, true, null::text),
    ('straight', 4::numeric, 'sanded', 205::numeric, true, null::text),
    ('round', 4::numeric, 'sanded', 297::numeric, true, null::text),
    ('straight', 5::numeric, 'sanded', 205::numeric, true, null::text),
    ('round', 5::numeric, 'sanded', 297::numeric, true, null::text),
    ('straight', 5::numeric, 'saw_cut', 166::numeric, true, null::text),
    ('straight', 6::numeric, 'sanded', null::numeric, false, 'Sanne Vos does not support Bluestone straight 6 cm.'),
    ('round', 6::numeric, 'sanded', null::numeric, false, 'Sanne Vos does not support Bluestone round 6 cm.'),
    ('straight', 8::numeric, 'sanded', null::numeric, false, 'Sanne Vos does not support Bluestone straight 8 cm.'),
    ('straight', 10::numeric, 'sanded', null::numeric, false, 'Sanne Vos does not support Bluestone straight 10 cm.')
)
insert into public.supplier_special_pricing_bluestone_rates (
  supplier_id,
  material_id,
  shape_kind,
  thickness_cm,
  surface_type,
  base_price_per_m2_eur,
  discount_percentage,
  is_supported,
  unsupported_reason
)
select
  sanne.supplier_id,
  bluestone.material_id,
  rates.shape_kind,
  rates.thickness_cm,
  rates.surface_type,
  rates.base_price_per_m2_eur,
  3,
  rates.is_supported,
  rates.unsupported_reason
from sanne
cross join bluestone
cross join rates
on conflict (supplier_id, material_id, shape_kind, thickness_cm, surface_type)
do update set
  base_price_per_m2_eur = excluded.base_price_per_m2_eur,
  discount_percentage = excluded.discount_percentage,
  is_supported = excluded.is_supported,
  unsupported_reason = excluded.unsupported_reason,
  updated_at = now();
