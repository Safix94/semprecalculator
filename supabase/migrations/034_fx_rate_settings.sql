-- Admin-configurable FX rates for supplier quote conversion.
-- Defaults match the previously hardcoded constants in src/lib/currency.ts
-- (ECB daily reference rate, 2026-06-29). Historical quotes are unaffected:
-- each quote snapshots supplier_input_exchange_rate_per_eur at submit time.

alter table pricing_settings
  add column if not exists usd_per_eur_rate numeric(12, 6) not null default 1.1401 check (usd_per_eur_rate > 0),
  add column if not exists idr_per_eur_rate numeric(14, 2) not null default 20361.16 check (idr_per_eur_rate > 0);
