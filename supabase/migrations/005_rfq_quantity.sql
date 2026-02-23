-- Add quantity to RFQs
alter table rfqs
  add column if not exists quantity integer not null default 1;

-- Ensure existing records are populated
update rfqs
set quantity = 1
where quantity is null;
