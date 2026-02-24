-- ============================================================
-- RFQ invite part (table_top / table_foot / table_both)
-- ============================================================

alter table rfq_invites
  add column if not exists invite_part text not null default 'default';

alter table rfq_invites
  drop constraint if exists rfq_invites_invite_part_check;

alter table rfq_invites
  add constraint rfq_invites_invite_part_check
  check (invite_part in ('default', 'table_top', 'table_foot', 'table_both'));
