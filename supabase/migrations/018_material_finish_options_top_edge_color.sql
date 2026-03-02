-- ============================================================
-- Material finish options: Top, Edge, Color (for table tops)
-- ============================================================

alter table materials
  add column if not exists finish_options_top text[] not null default '{}',
  add column if not exists finish_options_edge text[] not null default '{}',
  add column if not exists finish_options_color text[] not null default '{}';
