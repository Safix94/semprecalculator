-- ============================================================
-- Keep every issued supplier magic link valid until it expires
-- ============================================================
-- rfq_invites holds one token_hash per supplier per RFQ, so every resend,
-- thread reply or "Send RFQ" overwrote it and broke the links in earlier
-- emails ("Invalid or expired link"). Each issued token now gets a row here;
-- rfq_invites.token_hash stays as the latest token for backwards compatibility.
-- Revocation (closing an RFQ) stays on rfq_invites.revoked_at.

create table if not exists public.rfq_invite_tokens (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.rfq_invites(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.rfq_invite_tokens enable row level security;

-- No RLS policies by design: service_role bypasses RLS, browser roles get no direct access.

create index if not exists idx_rfq_invite_tokens_invite
  on public.rfq_invite_tokens (invite_id);

insert into public.rfq_invite_tokens (invite_id, token_hash, expires_at)
select id, token_hash, expires_at
from public.rfq_invites
on conflict (token_hash) do nothing;

comment on table public.rfq_invite_tokens is
  'Every issued supplier magic-link token hash per invite. Written by service-role only.';
