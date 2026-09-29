-- ============================================================
-- Own fabrics: Sempre fabrics the cushion supplier (Jardinico) does not stock
-- ============================================================
-- Source: Excel "Prijsberekening_nieuwe prijzen_2024_Bel CHD.xlsx",
-- tab "B - jardinico CHD (2025)". When the finish "Own fabric" is chosen,
-- sales pick the fabric on the request, the supplier quotes its price plus
-- the running meters of fabric needed, and the fabric cost
-- (meters × price per running meter) is added to the supplier's purchase
-- price before the normal margin and multiplier.

create table if not exists public.own_fabrics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_per_meter_eur numeric(10,2) not null check (price_per_meter_eur > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_own_fabrics_name_lower_unique
  on public.own_fabrics (lower(name));

create index if not exists idx_own_fabrics_active_name
  on public.own_fabrics (is_active, name);

drop trigger if exists update_own_fabrics_updated_at on public.own_fabrics;
create trigger update_own_fabrics_updated_at
  before update on public.own_fabrics
  for each row execute function update_updated_at_column();

alter table public.own_fabrics enable row level security;

drop policy if exists "internal_read_own_fabrics" on public.own_fabrics;
create policy "internal_read_own_fabrics"
  on public.own_fabrics for select
  to authenticated
  using (private.get_user_role() in ('sales', 'admin'));

drop policy if exists "internal_manage_own_fabrics" on public.own_fabrics;
create policy "internal_manage_own_fabrics"
  on public.own_fabrics for all
  to authenticated
  using (private.get_user_role() in ('sales', 'admin'))
  with check (private.get_user_role() in ('sales', 'admin'));

-- Price list per running meter (own-fabric list, September 2026).
insert into public.own_fabrics (name, price_per_meter_eur)
values
  ('Bandung pine', 31.03),
  ('Bandung saffron', 31.03),
  ('Bandung umber', 31.03),
  ('Gili grove', 29.26),
  ('Gili jasmin', 29.26),
  ('Munduk coral', 26.75),
  ('Perseide 06', 24.30),
  ('Kimi 05', 29.80),
  ('Sienna 06', 25.80),
  ('Blaze 5', 35.60),
  ('Lorkey 216', 26.70),
  ('Sienna tonal 15', 25.80),
  ('Sulawesi forest', 34.56),
  ('Sulawesi saffron', 34.56),
  ('Sulawesi maroon', 34.56),
  ('Papua sand', 40.02),
  ('Papua jade', 40.02),
  ('Rattan gold', 32.10)
on conflict do nothing;

-- The request stores which fabric was chosen (id for the rate lookup at quote
-- time, name as a display snapshot).
alter table public.rfqs
  add column if not exists own_fabric_id uuid references public.own_fabrics(id) on delete set null,
  add column if not exists own_fabric text;

comment on column public.rfqs.own_fabric_id is
  'Finish "Own fabric" only: the fabric from the own-fabric master list. Its price per meter is looked up when the supplier quotes.';
comment on column public.rfqs.own_fabric is
  'Finish "Own fabric" only: display name of the chosen fabric.';

-- The quote stores the supplier-entered meters and the fabric cost that was
-- added to the purchase price.
alter table public.rfq_quotes
  add column if not exists fabric_meters numeric(8,2) check (fabric_meters is null or fabric_meters > 0),
  add column if not exists fabric_price_per_meter_eur numeric(10,2) check (fabric_price_per_meter_eur is null or fabric_price_per_meter_eur > 0),
  add column if not exists fabric_cost_eur numeric(12,2) check (fabric_cost_eur is null or fabric_cost_eur >= 0);

comment on column public.rfq_quotes.fabric_meters is
  'Own fabric: running meters entered by the supplier for one piece.';
comment on column public.rfq_quotes.fabric_price_per_meter_eur is
  'Own fabric: price per running meter (EUR) used for this quote.';
comment on column public.rfq_quotes.fabric_cost_eur is
  'Own fabric: fabric_meters × fabric_price_per_meter_eur, added to the supplier base price before margin and multiplier.';
