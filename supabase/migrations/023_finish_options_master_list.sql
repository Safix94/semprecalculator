-- ============================================================
-- Finish options master list
-- ============================================================

create table if not exists finish_options (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_finish_options_name_lower_unique
  on finish_options (lower(name));

create index if not exists idx_finish_options_active_sort
  on finish_options (is_active, sort_order, name);

create or replace function update_finish_options_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists finish_options_updated_at on finish_options;
create trigger finish_options_updated_at
  before update on finish_options
  for each row
  execute function update_finish_options_updated_at();

with existing_finishes as (
  select trim(finish) as name
  from materials
  cross join lateral unnest(
    coalesce(finish_options, '{}'::text[])
    || coalesce(finish_options_top, '{}'::text[])
    || coalesce(finish_options_edge, '{}'::text[])
    || coalesce(finish_options_color, '{}'::text[])
  ) as finish
), deduped_finishes as (
  select min(name) as name
  from existing_finishes
  where name <> ''
  group by lower(name)
)
insert into finish_options (name, sort_order)
select name, 0
from deduped_finishes
where not exists (
  select 1
  from finish_options
  where lower(finish_options.name) = lower(deduped_finishes.name)
);

alter table finish_options enable row level security;

drop policy if exists "internal_read_finish_options" on finish_options;
create policy "internal_read_finish_options"
  on finish_options for select
  to authenticated
  using (get_user_role() in ('sales', 'admin'));

drop policy if exists "internal_manage_finish_options" on finish_options;
create policy "internal_manage_finish_options"
  on finish_options for all
  to authenticated
  using (get_user_role() in ('sales', 'admin'))
  with check (get_user_role() in ('sales', 'admin'));
