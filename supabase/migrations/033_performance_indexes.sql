-- Dashboard and history sort RFQs by created_at desc on every load;
-- audit_logs already has idx_audit_logs_created (001), rfqs was missing one.
-- Applied to production with CREATE INDEX CONCURRENTLY (outside a transaction).
create index if not exists idx_rfqs_created_at on rfqs (created_at desc);
