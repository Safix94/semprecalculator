-- Add product type (soort) to RFQs for filtering by category
alter table rfqs add column if not exists product_type text;

create index if not exists idx_rfqs_product_type on rfqs (product_type) where product_type is not null;
