-- ============================================================
-- RFQ status: supplier_replied (supplier sent a conversation message)
-- ============================================================

alter table rfqs
  drop constraint if exists rfqs_status_check;

alter table rfqs
  add constraint rfqs_status_check
  check (
    status in (
      'draft',
      'sent_to_pricing',
      'sent_to_supplier',
      'supplier_replied',
      'waiting_for_technical_drawing',
      'quotes_received',
      'closed'
    )
  );
