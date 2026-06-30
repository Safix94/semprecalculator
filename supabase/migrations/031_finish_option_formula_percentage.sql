-- Store backend-only finish formula percentages for future pricing/formula logic.
-- This value is intentionally not shown in the finish management UI yet.

alter table finish_options
  add column if not exists formula_percentage numeric;

comment on column finish_options.formula_percentage is
  'Backend-only percentage for future finish formula calculations. Null means no percentage supplied.';

alter table finish_options
  drop constraint if exists finish_options_formula_percentage_non_negative;

alter table finish_options
  add constraint finish_options_formula_percentage_non_negative
  check (formula_percentage is null or formula_percentage >= 0);
