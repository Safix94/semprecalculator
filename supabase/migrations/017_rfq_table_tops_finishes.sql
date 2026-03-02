-- ============================================================
-- RFQ fields for Table tops finish details
-- ============================================================

alter table rfqs
  add column if not exists finish_top text,
  add column if not exists finish_edge text,
  add column if not exists finish_color text;
