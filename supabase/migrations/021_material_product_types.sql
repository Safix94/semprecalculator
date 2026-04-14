-- ============================================================
-- Material to Product Type links
-- ============================================================

create table if not exists material_product_types (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  product_type_id uuid not null references product_types(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (material_id, product_type_id)
);

create index if not exists idx_material_product_types_material
  on material_product_types (material_id);

create index if not exists idx_material_product_types_product_type
  on material_product_types (product_type_id);

alter table material_product_types enable row level security;

drop policy if exists "internal_read_material_product_types" on material_product_types;
create policy "internal_read_material_product_types"
  on material_product_types for select
  to authenticated
  using (get_user_role() in ('sales', 'admin'));

drop policy if exists "internal_manage_material_product_types" on material_product_types;
create policy "internal_manage_material_product_types"
  on material_product_types for all
  to authenticated
  using (get_user_role() in ('sales', 'admin'))
  with check (get_user_role() in ('sales', 'admin'));

-- Backfill existing materials so current table/table-top setup keeps working.
insert into material_product_types (material_id, product_type_id)
select m.id, pt.id
from materials m
join product_types pt
  on lower(regexp_replace(pt.name, '\s+', ' ', 'g')) in ('tables', 'table tops', 'tabletops')
on conflict (material_id, product_type_id) do nothing;
