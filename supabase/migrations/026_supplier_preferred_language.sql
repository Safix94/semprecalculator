alter table public.suppliers
  add column if not exists preferred_language text;

update public.suppliers
set preferred_language = 'en'
where preferred_language is null
   or preferred_language not in ('en', 'nl', 'fr', 'es', 'pt');

alter table public.suppliers
  alter column preferred_language set default 'en';

alter table public.suppliers
  alter column preferred_language set not null;

alter table public.suppliers
  drop constraint if exists suppliers_preferred_language_check;

alter table public.suppliers
  add constraint suppliers_preferred_language_check
  check (preferred_language in ('en', 'nl', 'fr', 'es', 'pt'));

comment on column public.suppliers.preferred_language is
  'Preferred supplier-facing language for RFQ invite emails and supplier magic-link pages.';
