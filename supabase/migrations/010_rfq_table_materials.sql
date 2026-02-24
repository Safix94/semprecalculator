-- ============================================================
-- RFQ table-specific materials (table top + table foot)
-- ============================================================

alter table rfqs
  add column if not exists material_id_table_top uuid references materials(id),
  add column if not exists material_id_table_foot uuid references materials(id),
  add column if not exists material_table_top text,
  add column if not exists material_table_foot text,
  add column if not exists finish_table_top text,
  add column if not exists finish_table_foot text;

create index if not exists idx_rfqs_material_id_table_top on rfqs (material_id_table_top);
create index if not exists idx_rfqs_material_id_table_foot on rfqs (material_id_table_foot);
