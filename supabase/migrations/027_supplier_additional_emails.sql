alter table public.suppliers
  add column if not exists additional_emails text[];

update public.suppliers
set additional_emails = '{}'
where additional_emails is null;

alter table public.suppliers
  alter column additional_emails set default '{}',
  alter column additional_emails set not null;

comment on column public.suppliers.additional_emails is
  'Additional supplier recipient emails for RFQ invites and supplier thread notifications.';
