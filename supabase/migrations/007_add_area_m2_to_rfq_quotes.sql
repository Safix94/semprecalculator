-- Store supplier-entered shipment area (m2) while keeping derived volume_m3 for pricing.
alter table rfq_quotes
  add column if not exists area_m2 numeric(10,3) null;
