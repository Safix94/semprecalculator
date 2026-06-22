-- Add configurable Details & dimensions fields per product type.
-- The app normalizes missing/legacy values to defaults, so this column is safe for existing rows.

alter table product_types
  add column if not exists detail_fields jsonb;

comment on column product_types.detail_fields is
  'Array of RFQ details/dimensions field settings: [{ key, enabled, required }]. Missing values are normalized by the app.';
