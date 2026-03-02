-- ============================================================
-- Allow internal users (sales/admin) to manage master data
-- ============================================================

-- Suppliers
drop policy if exists "admin_manage_suppliers" on suppliers;
drop policy if exists "internal_manage_suppliers" on suppliers;

create policy "internal_manage_suppliers"
  on suppliers for all
  to authenticated
  using (get_user_role() in ('sales', 'admin'))
  with check (get_user_role() in ('sales', 'admin'));

-- Materials
drop policy if exists "admin_manage_materials" on materials;
drop policy if exists "internal_manage_materials" on materials;

create policy "internal_manage_materials"
  on materials for all
  to authenticated
  using (get_user_role() in ('sales', 'admin'))
  with check (get_user_role() in ('sales', 'admin'));

-- Material-supplier links
drop policy if exists "admin_manage_material_suppliers" on material_suppliers;
drop policy if exists "internal_manage_material_suppliers" on material_suppliers;

create policy "internal_manage_material_suppliers"
  on material_suppliers for all
  to authenticated
  using (get_user_role() in ('sales', 'admin'))
  with check (get_user_role() in ('sales', 'admin'));

-- Product types
drop policy if exists "admin_manage_product_types" on product_types;
drop policy if exists "internal_manage_product_types" on product_types;

create policy "internal_manage_product_types"
  on product_types for all
  to authenticated
  using (get_user_role() in ('sales', 'admin'))
  with check (get_user_role() in ('sales', 'admin'));

-- user_roles policies remain admin-only (no changes)
