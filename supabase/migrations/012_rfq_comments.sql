-- ============================================================
-- RFQ comments per supplier thread
-- ============================================================

create table if not exists rfq_comments (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references rfqs(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  author_type text not null check (author_type in ('supplier', 'internal')),
  author_id text not null,
  author_email text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rfq_comments_rfq_supplier_created
  on rfq_comments (rfq_id, supplier_id, created_at);

alter table rfq_comments enable row level security;

create policy "internal_read_rfq_comments"
  on rfq_comments for select
  to authenticated
  using (get_user_role() in ('sales', 'admin'));

create policy "internal_insert_rfq_comments"
  on rfq_comments for insert
  to authenticated
  with check (
    get_user_role() in ('sales', 'admin')
    and author_type = 'internal'
    and author_id = auth.uid()::text
  );
