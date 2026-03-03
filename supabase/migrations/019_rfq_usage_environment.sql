-- ============================================================
-- RFQ indoor/outdoor usage environment
-- ============================================================

alter table rfqs
  add column if not exists usage_environment text;

do $$
begin
  alter table rfqs
    add constraint rfqs_usage_environment_check
    check (usage_environment is null or usage_environment in ('Indoor', 'Outdoor'));
exception
  when duplicate_object then null;
end;
$$;
