-- ============================================================
-- RFQ status update: quotes_received
-- ============================================================

alter table rfqs
  drop constraint if exists rfqs_status_check;

alter table rfqs
  add constraint rfqs_status_check
  check (
    status in (
      'draft',
      'sent_to_supplier',
      'waiting_for_technical_drawing',
      'quotes_received',
      'closed'
    )
  );

-- Backfill existing RFQs that already have at least one quote.
update rfqs r
set status = 'quotes_received'
where r.status = 'sent_to_supplier'
  and exists (
    select 1
    from rfq_quotes q
    where q.rfq_id = r.id
  );
