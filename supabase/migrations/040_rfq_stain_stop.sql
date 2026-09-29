-- ============================================================
-- Stain stop option for Table tops requests
-- ============================================================
-- Sales can ask for a stain stop treatment on a table top. The Vos pricing
-- chains (Sanne Vos Bluestone, Natuursteen Vos) add a fixed surcharge per
-- piece after the finish margin and before the retail multiplier.

alter table public.rfqs
  add column if not exists stain_stop boolean not null default false;

comment on column public.rfqs.stain_stop is
  'Table tops only: stain stop treatment requested. Priced as a fixed surcharge per piece in the Vos pricing chains.';
