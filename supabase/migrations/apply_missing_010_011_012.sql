-- ============================================================
-- Run this in Supabase SQL Editor if you get schema cache errors
-- or "Could not load RFQ details" after submitting an RFQ.
-- Safe to run multiple times (uses if not exists / on conflict do nothing).
-- ============================================================

-- 010: RFQ table materials (table top + foot)
alter table rfqs
  add column if not exists material_id_table_top uuid references materials(id),
  add column if not exists material_id_table_foot uuid references materials(id),
  add column if not exists material_table_top text,
  add column if not exists material_table_foot text,
  add column if not exists finish_table_top text,
  add column if not exists finish_table_foot text;

create index if not exists idx_rfqs_material_id_table_top on rfqs (material_id_table_top);
create index if not exists idx_rfqs_material_id_table_foot on rfqs (material_id_table_foot);

-- 011: Product types
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

do $$
begin
  create policy "internal_read_product_types"
    on product_types for select
    to authenticated
    using (get_user_role() in ('sales', 'admin'));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "admin_manage_product_types"
    on product_types for all
    to authenticated
    using (get_user_role() = 'admin')
    with check (get_user_role() = 'admin');
exception when duplicate_object then null;
end $$;

-- 012: RFQ comments
create table if not exists rfq_comments (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references rfqs(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  author_type text not null check (author_type in ('supplier', 'internal')),
  author_id text not null,
  author_email text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rfq_comments_rfq_supplier_created
  on rfq_comments (rfq_id, supplier_id, created_at);

alter table rfq_comments enable row level security;

do $$
begin
  create policy "internal_read_rfq_comments"
    on rfq_comments for select
    to authenticated
    using (get_user_role() in ('sales', 'admin'));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "internal_insert_rfq_comments"
    on rfq_comments for insert
    to authenticated
    with check (
      get_user_role() in ('sales', 'admin')
      and author_type = 'internal'
      and author_id = auth.uid()::text
    );
exception when duplicate_object then null;
end $$;
