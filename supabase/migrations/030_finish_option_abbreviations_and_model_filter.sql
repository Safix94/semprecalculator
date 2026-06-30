-- Add finish abbreviations and backfill the finish master list.
-- Percentages from the business list are intentionally ignored for now.

create table if not exists finish_options (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abbreviation text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table finish_options
  add column if not exists abbreviation text;

create unique index if not exists idx_finish_options_name_lower_unique
  on finish_options (lower(name));

create index if not exists idx_finish_options_active_sort
  on finish_options (is_active, sort_order, name);

create index if not exists idx_finish_options_abbreviation_lower
  on finish_options (lower(abbreviation))
  where abbreviation is not null;

create or replace function update_finish_options_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
), next_sort as (
  select coalesce(max(sort_order), 0) as value from finish_options
), numbered as (
  select name, (select value from next_sort) + row_number() over (order by name) * 10 as sort_order
  from deduped_finishes
)
insert into finish_options (name, sort_order)
select name, sort_order
from numbered
where not exists (
  select 1
  from finish_options
  where lower(finish_options.name) = lower(numbered.name)
);

create or replace function pg_temp.normalize_finish_name(input text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    translate(
      lower(coalesce(input, '')),
      'áàâäãåéèêëíìîïóòôöõúùûüç',
      'aaaaaaeeeeiiiiooooouuuuc'
    ),
    '\s+',
    ' ',
    'g'
  )
$$;

create temp table finish_abbreviation_seed (
  abbreviation text not null,
  name text not null,
  sort_order integer not null
) on commit drop;

insert into finish_abbreviation_seed (abbreviation, name, sort_order) values
  ('A', 'Antique', 10),
  ('AF', 'Antique fumé', 20),
  ('AFK', 'Antique fumé korinthia', 30),
  ('AFP', 'Antique fumé puré', 40),
  ('AFPE', 'Antique fumé pebbles', 50),
  ('AFR', 'Antique fumé rocky', 60),
  ('AK', 'Antique korinthia', 70),
  ('AL', 'Antique leathered', 80),
  ('ALK', 'Antique leathered korinthia', 90),
  ('ALP', 'Antique leathered puré', 100),
  ('ALPE', 'Antique leathered pebbles', 110),
  ('ALR', 'Antique leathered rocky', 120),
  ('AP', 'Antique puré', 130),
  ('AR', 'Antique rocky', 140),
  ('AT', 'Antique tiré', 150),
  ('B', 'Bouchardé', 160),
  ('BF', 'Bouchardé fumé', 170),
  ('BFK', 'Bouchardé fumé korinthia', 180),
  ('BFP', 'Bouchardé fumé puré', 190),
  ('BFR', 'Bouchardé fumé rocky', 200),
  ('BK', 'Bouchardé korinthia', 210),
  ('BL', 'Bouchardé leathered', 220),
  ('BLK', 'Bouchardé leathered korinthia', 230),
  ('BLP', 'Bouchardé leathered puré', 240),
  ('BLPE', 'Bouchardé leathered pebbles', 250),
  ('BLR', 'Bouchardé leathered rocky', 260),
  ('BP', 'Bouchardé puré', 270),
  ('BR', 'Bouchardé rocky', 280),
  ('E', 'Erosé', 290),
  ('EF', 'Erosé fumé', 300),
  ('EL', 'Erosé leathered', 310),
  ('EP', 'Erosé puré', 320),
  ('EPE', 'Erosé pebbles', 330),
  ('ER', 'Erosé rocky', 340),
  ('F', 'Fumé', 350),
  ('FP', 'Fumé puré', 360),
  ('FK', 'Fumé korinthia', 370),
  ('FR', 'Fumé rocky', 380),
  ('FE', 'Ferrara', 390),
  ('FEF', 'Ferrara fumé', 400),
  ('FEFK', 'Ferrara fumé korinthia', 410),
  ('FEFP', 'Ferrara fumé puré', 420),
  ('FEFR', 'Ferrara fumé rocky', 430),
  ('FEK', 'Ferrara korinthia', 440),
  ('FEL', 'Ferrara leathered', 450),
  ('FELK', 'Ferrara leathered korinthia', 460),
  ('FELP', 'Ferrara leathered puré', 470),
  ('FELR', 'Ferrara leathered rocky', 480),
  ('FEP', 'Ferrara puré', 490),
  ('FER', 'Ferrara rocky', 500),
  ('K', 'Korinthia', 510),
  ('KR', 'Korinthia rocky', 520),
  ('L', 'Leathered', 530),
  ('LK', 'Leathered korinthia', 540),
  ('LR', 'Leathered rocky', 550),
  ('P', 'Puré', 560),
  ('PE', 'Pebbles', 570),
  ('PEF', 'Pebbles fumé', 580),
  ('PEL', 'Pebbles leathered', 590),
  ('R', 'Rocky', 600),
  ('SL', 'Sclypé', 610),
  ('T', 'Tiré', 620),
  ('TF', 'Tiré fumé', 630),
  ('TFT', 'Tiré fumé tiré', 640),
  ('TK', 'Tiré korinthia', 650),
  ('TL', 'Tiré leathered', 660),
  ('TPE', 'Tiré pebbles', 670),
  ('TR', 'Tiré rocky', 680),
  ('TT', 'Tiré tiré', 690),
  ('V', 'Vintage', 700),
  ('VF', 'Vintage fumé', 710),
  ('VFK', 'Vintage fumé korinthia', 720),
  ('VFR', 'Vintage fumé rocky', 730),
  ('VK', 'Vintage korinthia', 740),
  ('VL', 'Vintage leathered', 750),
  ('VLK', 'Vintage leathered korinthia', 760),
  ('VLR', 'Vintage leathered rocky', 770),
  ('VPE', 'Vintage pebbles', 780),
  ('VP', 'Vintage puré', 790),
  ('VR', 'Vintage rocky', 800),
  ('VT', 'Vintage tiré', 810);

do $$
declare
  seed record;
  existing_id uuid;
begin
  for seed in select * from finish_abbreviation_seed order by sort_order loop
    select id into existing_id
    from finish_options
    where pg_temp.normalize_finish_name(name) = pg_temp.normalize_finish_name(seed.name)
    limit 1;

    if existing_id is null then
      insert into finish_options (name, abbreviation, sort_order, is_active)
      values (seed.name, upper(seed.abbreviation), seed.sort_order, true);
    else
      update finish_options
      set name = seed.name,
          abbreviation = upper(seed.abbreviation),
          sort_order = seed.sort_order,
          is_active = true
      where id = existing_id;
    end if;
  end loop;
end $$;

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
