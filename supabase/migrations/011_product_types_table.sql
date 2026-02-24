-- ============================================================
-- Product types table + seed data
-- ============================================================

create table if not exists product_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_types_sort on product_types (sort_order, name);

insert into product_types (name, sort_order) values
  ('Bar chairs', 10),
  ('Bar tables', 20),
  ('Baskets, planters & pots', 30),
  ('Bathroom', 40),
  ('Benches & chairs', 50),
  ('Cabinets & consoles', 60),
  ('Carafes', 70),
  ('Coffee & side tables', 80),
  ('Decorative glassware', 90),
  ('Drinking glasses', 100),
  ('Furniture', 110),
  ('Glassware & Decoration', 120),
  ('Kitchenware', 130),
  ('Lighting', 140),
  ('Lounge sets', 150),
  ('Ornaments & more', 160),
  ('Pillows', 170),
  ('Pouffe', 180),
  ('Sunbeds', 190),
  ('Tables', 200),
  ('Tableware', 210),
  ('Umbrellas', 220),
  ('Vases', 230)
on conflict (name) do nothing;

alter table product_types enable row level security;

create policy "internal_read_product_types"
  on product_types for select
  to authenticated
  using (get_user_role() in ('sales', 'admin'));

create policy "admin_manage_product_types"
  on product_types for all
  to authenticated
  using (get_user_role() = 'admin')
  with check (get_user_role() = 'admin');
