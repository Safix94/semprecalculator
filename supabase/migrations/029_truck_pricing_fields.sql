-- ============================================================
-- Truck pricing support and quote snapshots
-- ============================================================

alter table rfq_quotes
  add column if not exists transport_adjusted_base_price numeric(12,2),
  add column if not exists truck_multiplier_factor numeric(8,3);

update supplier_pricing_profiles
set truck_multiplier_factor = 1.5
where truck_multiplier_factor is null;

update rfq_quotes
set truck_multiplier_factor = null
where pricing_method is distinct from 'truck';
