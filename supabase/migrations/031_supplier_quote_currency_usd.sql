-- Extend supplier quote input currencies to USD and add a generic exchange-rate snapshot.
-- Rates are stored as units of supplier input currency per 1 EUR.

alter table public.suppliers
  drop constraint if exists suppliers_quote_price_currency_check;

alter table public.suppliers
  add constraint suppliers_quote_price_currency_check
  check (quote_price_currency in ('EUR', 'USD', 'IDR'));

alter table public.rfq_quotes
  add column if not exists supplier_input_exchange_rate_per_eur numeric(14,6);

alter table public.rfq_quotes
  drop constraint if exists rfq_quotes_supplier_input_currency_check;

alter table public.rfq_quotes
  add constraint rfq_quotes_supplier_input_currency_check
  check (supplier_input_currency in ('EUR', 'USD', 'IDR'));

update public.rfq_quotes
set supplier_input_exchange_rate_per_eur = supplier_input_exchange_rate_idr_per_eur
where supplier_input_currency = 'IDR'
  and supplier_input_exchange_rate_per_eur is null
  and supplier_input_exchange_rate_idr_per_eur is not null;
