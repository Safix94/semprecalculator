-- ============================================================
-- Internal chat per RFQ (sales ↔ pricing), never visible to suppliers
-- ============================================================
-- Suppliers only ever read rfq_comments via the service role; this table is
-- only exposed to authenticated sales/admin users.

create table if not exists public.rfq_internal_messages (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  author_email text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rfq_internal_messages_rfq_created
  on public.rfq_internal_messages (rfq_id, created_at);

alter table public.rfq_internal_messages enable row level security;

create policy "internal_read_rfq_internal_messages"
  on public.rfq_internal_messages for select
  to authenticated
  using (private.get_user_role() in ('sales', 'admin'));

create policy "internal_insert_rfq_internal_messages"
  on public.rfq_internal_messages for insert
  to authenticated
  with check (
    private.get_user_role() in ('sales', 'admin')
    and author_id = auth.uid()
  );

-- Per-user read marker, drives the "new message" badge on the dashboard.
create table if not exists public.rfq_internal_message_reads (
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (rfq_id, user_id)
);

alter table public.rfq_internal_message_reads enable row level security;

create policy "own_read_rfq_internal_message_reads"
  on public.rfq_internal_message_reads for select
  to authenticated
  using (user_id = auth.uid());

create policy "own_insert_rfq_internal_message_reads"
  on public.rfq_internal_message_reads for insert
  to authenticated
  with check (user_id = auth.uid() and private.get_user_role() in ('sales', 'admin'));

create policy "own_update_rfq_internal_message_reads"
  on public.rfq_internal_message_reads for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
