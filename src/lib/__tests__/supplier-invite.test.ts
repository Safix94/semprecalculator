import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = { rfq_invites: [], rfq_invite_tokens: [] };

// Minimal in-memory stand-in for the PostgREST query builder used by supplier-invite.
function from(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return builder;
    },
    is: (column: string, value: unknown) => {
      filters.push((row) => (row[column] ?? null) === value);
      return builder;
    },
    not: (column: string) => {
      filters.push((row) => row[column] != null);
      return builder;
    },
    insert: async (row: Row) => {
      tables[table].push(row);
      return { error: null };
    },
    rows: () => tables[table].filter((row) => filters.every((filter) => filter(row))),
    single: async () => {
      const [row] = builder.rows();
      return row ? { data: row, error: null } : { data: null, error: { message: 'not found' } };
    },
    maybeSingle: async () => ({ data: builder.rows()[0] ?? null, error: null }),
    then: (resolve: (value: { count: number }) => void) => resolve({ count: builder.rows().length }),
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from }) }));
vi.mock('@/lib/rate-limit', () => ({
  checkSupplierLinkRateLimits: async () => ({ allowed: true }),
  getSupplierLinkRequestContext: async () => ({ ipHash: 'ip', userAgent: 'test' }),
}));

const { recordIssuedInviteToken, resolveSupplierInviteByToken } = await import('@/lib/supplier-invite');
const { generateToken, hashToken } = await import('@/lib/tokens');

const RFQ_ID = 'rfq-1';
const future = () => new Date(Date.now() + 60_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();

async function issue(expiresAt = future()) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  // Mirrors the send actions: rfq_invites keeps the latest hash, every hash is recorded.
  tables.rfq_invites[0].token_hash = tokenHash;
  tables.rfq_invites[0].expires_at = expiresAt;
  await recordIssuedInviteToken({ inviteId: 'invite-1', tokenHash, expiresAt });
  return token;
}

function resolve(token: string) {
  return resolveSupplierInviteByToken({ rfqId: RFQ_ID, token, action: 'supplier_token_validate', distinguishRevoked: true });
}

beforeEach(() => {
  process.env.TOKEN_HASH_SECRET = 'test-secret';
  tables.rfq_invite_tokens = [];
  tables.rfq_invites = [
    {
      id: 'invite-1',
      rfq_id: RFQ_ID,
      supplier_id: 'supplier-1',
      invite_part: 'default',
      token_hash: '',
      expires_at: future(),
      used_at: null,
      revoked_at: null,
    },
  ];
});

describe('resolveSupplierInviteByToken', () => {
  it('keeps links from earlier emails valid after a resend', async () => {
    const first = await issue();
    const second = await issue();

    expect(await resolve(first)).toHaveProperty('invite.id', 'invite-1');
    expect(await resolve(second)).toHaveProperty('invite.id', 'invite-1');
  });

  it('rejects an earlier token once its own expiry has passed', async () => {
    const old = await issue(past());
    await issue();

    expect(await resolve(old)).toEqual({ error: 'This link has expired' });
  });

  it('reports revoked invites for any issued token', async () => {
    const old = await issue();
    await issue();
    tables.rfq_invites[0].revoked_at = past();

    expect(await resolve(old)).toMatchObject({ reason: 'revoked' });
  });

  it('rejects tokens that were never issued for this RFQ', async () => {
    await issue();

    expect(await resolve(generateToken())).toEqual({ error: 'Invalid or expired link' });
  });
});
