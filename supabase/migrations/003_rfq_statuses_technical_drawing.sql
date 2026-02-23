-- ============================================================
-- RFQ status updates + technical drawing workflow
-- ============================================================

alter table rfqs
  drop constraint if exists rfqs_status_check;

alter table rfqs
  add constraint rfqs_status_check
  check (status in ('draft', 'sent_to_supplier', 'waiting_for_technical_drawing', 'closed'));

update rfqs
set status = 'sent_to_supplier'
where status = 'sent';
