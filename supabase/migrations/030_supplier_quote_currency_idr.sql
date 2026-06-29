-- Supplier quote input currency and quote-level conversion snapshots.
-- Internal pricing stays EUR-based; supplier-entered IDR amounts are converted before pricing formulas run.

alter table public.suppliers
  add column if not exists quote_price_currency text not null default 'EUR';

alter table public.suppliers
  drop constraint if exists suppliers_quote_price_currency_check;

alter table public.suppliers
  add constraint suppliers_quote_price_currency_check
  check (quote_price_currency in ('EUR', 'IDR'));

alter table public.rfq_quotes
  add column if not exists supplier_input_price numeric(14,2),
  add column if not exists supplier_input_currency text not null default 'EUR',
  add column if not exists supplier_input_exchange_rate_idr_per_eur numeric(14,6),
  add column if not exists supplier_input_converted_at timestamptz;

alter table public.rfq_quotes
  drop constraint if exists rfq_quotes_supplier_input_currency_check;

alter table public.rfq_quotes
  add constraint rfq_quotes_supplier_input_currency_check
  check (supplier_input_currency in ('EUR', 'IDR'));

update public.rfq_quotes
set supplier_input_price = base_price,
    supplier_input_currency = coalesce(nullif(currency, ''), 'EUR'),
    supplier_input_converted_at = submitted_at
where supplier_input_price is null;
