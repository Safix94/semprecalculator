-- ============================================================
-- Configurable pricing settings
-- ============================================================

create table if not exists pricing_settings (
  id integer primary key default 1 check (id = 1),
  container_price_eur numeric(12,2) not null default 7500 check (container_price_eur > 0),
  container_volume_m3 numeric(10,3) not null default 67 check (container_volume_m3 > 0),
  product_margin_factor numeric(8,3) not null default 2.1 check (product_margin_factor > 0),
  shipping_margin_factor numeric(8,3) not null default 2.4 check (shipping_margin_factor > 0),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into pricing_settings (
  id,
  container_price_eur,
  container_volume_m3,
  product_margin_factor,
  shipping_margin_factor
)
values (1, 7500, 67, 2.1, 2.4)
on conflict (id) do nothing;

alter table pricing_settings enable row level security;

drop policy if exists "internal_read_pricing_settings" on pricing_settings;
drop policy if exists "internal_manage_pricing_settings" on pricing_settings;

create policy "internal_read_pricing_settings"
  on pricing_settings for select
  to authenticated
  using (private.get_user_role() in ('sales', 'admin'));

create policy "internal_manage_pricing_settings"
  on pricing_settings for all
  to authenticated
  using (private.get_user_role() in ('sales', 'admin'))
  with check (private.get_user_role() in ('sales', 'admin'));

drop trigger if exists update_pricing_settings_updated_at on pricing_settings;
create trigger update_pricing_settings_updated_at
  before update on pricing_settings
  for each row
  execute function update_updated_at_column();
