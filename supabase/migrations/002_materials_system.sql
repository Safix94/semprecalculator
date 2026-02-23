-- ============================================================
-- Materials System Migration
-- ============================================================

-- Materials table
create table materials (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  finish_options text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_materials_active on materials (is_active) where is_active = true;
create index idx_materials_name on materials (name);

-- Material-Supplier junction table
create table material_suppliers (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(material_id, supplier_id)
);

create index idx_material_suppliers_material on material_suppliers (material_id);
create index idx_material_suppliers_supplier on material_suppliers (supplier_id);

-- Add finish field to RFQs table
alter table rfqs add column finish text;
alter table rfqs add column material_id uuid references materials(id);

-- Create index for material_id
create index idx_rfqs_material_id on rfqs (material_id);

-- ============================================================
-- UPDATE EXISTING DATA
-- ============================================================

-- Insert initial materials
insert into materials (name, finish_options) values 
  ('Glass', array['Polished', 'Matte', 'Frosted']),
  ('Teak', array['Natural', 'Oiled', 'Lacquered']);

-- Insert suppliers for these materials
insert into suppliers (name, email, materials) values 
  ('Polen', 'polen@example.com', array['Glass']),
  ('Polen2', 'polen2@example.com', array['Glass']),
  ('Indonesia', 'indonesia@example.com', array['Teak']);

-- Link materials to suppliers
insert into material_suppliers (material_id, supplier_id)
select m.id, s.id 
from materials m
cross join suppliers s
where (m.name = 'Glass' and s.name in ('Polen', 'Polen2'))
   or (m.name = 'Teak' and s.name = 'Indonesia');

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table materials enable row level security;
alter table material_suppliers enable row level security;

-- Materials policies (read for sales/admin, manage for admin only)
create policy "internal_read_materials"
  on materials for select
  to authenticated
  using (get_user_role() in ('sales', 'admin'));

create policy "admin_manage_materials"
  on materials for all
  to authenticated
  using (get_user_role() = 'admin')
  with check (get_user_role() = 'admin');

-- Material-suppliers policies
create policy "internal_read_material_suppliers"
  on material_suppliers for select
  to authenticated
  using (get_user_role() in ('sales', 'admin'));

create policy "admin_manage_material_suppliers"
  on material_suppliers for all
  to authenticated
  using (get_user_role() = 'admin')
  with check (get_user_role() = 'admin');

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to get suppliers for a material
create or replace function get_suppliers_for_material(material_uuid uuid)
returns table(
  id uuid,
  name text,
  email text,
  is_active boolean
)
language sql
security definer
stable
as $$
  select s.id, s.name, s.email, s.is_active
  from suppliers s
  join material_suppliers ms on s.id = ms.supplier_id
  where ms.material_id = material_uuid and s.is_active = true;
$$;

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger to automatically update updated_at
create trigger update_materials_updated_at
  before update on materials
  for each row
  execute function update_updated_at_column();