import { createServiceRoleClient } from '@/lib/supabase/server';
import { assertTokenHashingConfigured, hashToken } from '@/lib/tokens';
import {
  checkSupplierLinkRateLimits,
  getSupplierLinkRequestContext,
} from '@/lib/rate-limit';
import type {
  SupplierLinkRateLimitAction,
  SupplierLinkRequestContext,
} from '@/lib/rate-limit';

export const SUPPLIER_TOKEN_REGEX = /^[a-f0-9]{64}$/i;

/** Magic links stay valid for 30 days after each (re)send. */
export const INVITE_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000;

export function isValidSupplierToken(token: string): boolean {
  return SUPPLIER_TOKEN_REGEX.test(token);
}

export function maskSupplierToken(token: string): string {
  if (token.length < 12) {
    return `len=${token.length}`;
  }
  return `${token.slice(0, 6)}...${token.slice(-4)} (len=${token.length})`;
}

/**
 * Remember an issued token so its link keeps working after later resends.
 * rfq_invites.token_hash only holds the latest token; older ones live here.
 * Failure is logged, not thrown: the latest token still validates via rfq_invites.
 */
export async function recordIssuedInviteToken(params: {
  inviteId: string;
  tokenHash: string;
  expiresAt: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('rfq_invite_tokens').insert({
    invite_id: params.inviteId,
    token_hash: params.tokenHash,
    expires_at: params.expiresAt,
  });

  if (error) {
    console.error('Failed to record issued supplier invite token:', {
      inviteId: params.inviteId,
      reason: error.message,
    });
  }
}

export interface SupplierInviteRecord {
  id: string;
  supplier_id: string;
  invite_part: 'default' | 'table_top' | 'table_foot' | 'table_both' | null;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  supplier: unknown;
}

export type ResolveSupplierInviteResult =
  | {
      invite: SupplierInviteRecord;
      tokenHash: string;
      requestContext: SupplierLinkRequestContext;
    }
  | { error: string; reason?: 'revoked'; revokedInvite?: SupplierInviteRecord };

async function getInviteLookupDiagnostics(
  supabase: ReturnType<typeof createServiceRoleClient>,
  rfqId: string,
  tokenHash: string
) {
  const [{ count: activeInviteCount }, { count: revokedInviteCount }, { count: tokenHashMatchCount }] =
    await Promise.all([
      supabase
        .from('rfq_invites')
        .select('id', { count: 'exact', head: true })
        .eq('rfq_id', rfqId)
        .is('revoked_at', null),
      supabase
        .from('rfq_invites')
        .select('id', { count: 'exact', head: true })
        .eq('rfq_id', rfqId)
        .not('revoked_at', 'is', null),
      supabase
        .from('rfq_invites')
        .select('id', { count: 'exact', head: true })
        .eq('token_hash', tokenHash)
        .is('revoked_at', null),
    ]);

  return {
    activeInviteCount: activeInviteCount ?? 0,
    revokedInviteCount: revokedInviteCount ?? 0,
    tokenHashMatchCount: tokenHashMatchCount ?? 0,
  };
}

interface ResolveSupplierInviteOptions {
  rfqId: string;
  token: string;
  /** Rate-limit bucket; omit `rateLimit: false` callers still pass it for log context. */
  action: SupplierLinkRateLimitAction;
  /** Skip rate limiting entirely (e.g. read-only comment listing). */
  rateLimit?: boolean;
  requestContext?: SupplierLinkRequestContext;
  /** Extra columns for the supplier join, e.g. 'id, name, preferred_language'. */
  supplierColumns?: string;
  /** Return `{ error, reason: 'revoked' }` instead of invalid-link for revoked invites. */
  distinguishRevoked?: boolean;
  /** Message for malformed tokens (default 'Invalid link'). */
  invalidMessage?: string;
  /** Message for missing/unmatched invites (default 'Invalid or expired link'). */
  notFoundMessage?: string;
  /** Prefix for warn/info logs, e.g. 'Quote submission blocked'. */
  logPrefix?: string;
}

/**
 * Shared supplier magic-link validation: config check → token format check
 * (+ malformed rate limit) → hash → rate limit → invite lookup → revoked +
 * expiry checks. Callers keep their own post-processing (RFQ fetches, closed
 * guards, projections).
 */
export async function resolveSupplierInviteByToken(
  options: ResolveSupplierInviteOptions
): Promise<ResolveSupplierInviteResult> {
  const {
    rfqId,
    action,
    rateLimit = true,
    supplierColumns,
    distinguishRevoked = false,
    invalidMessage = 'Invalid link',
    notFoundMessage = 'Invalid or expired link',
    logPrefix = 'Supplier token validation failed',
  } = options;

  const supabase = createServiceRoleClient();
  const normalizedToken = options.token.trim();
  const requestContext = options.requestContext ?? (await getSupplierLinkRequestContext());

  try {
    assertTokenHashingConfigured();
  } catch (error) {
    console.error(`${logPrefix}: token setup invalid.`, error);
    return { error: 'Supplier links are not configured. Please contact support.' };
  }

  if (!isValidSupplierToken(normalizedToken)) {
    if (rateLimit) {
      const rateLimitResult = await checkSupplierLinkRateLimits({
        action,
        requestContext,
        scopes: [{ name: 'ip-malformed', parts: [rfqId, requestContext.ipHash] }],
      });

      if (!rateLimitResult.allowed) {
        return { error: rateLimitResult.error };
      }
    }

    console.warn(`${logPrefix}: malformed token.`, {
      rfqId,
      token: maskSupplierToken(normalizedToken),
    });
    return { error: invalidMessage };
  }

  const tokenHash = hashToken(normalizedToken);

  if (rateLimit) {
    const rateLimitResult = await checkSupplierLinkRateLimits({
      action,
      requestContext,
      scopes: [
        { name: 'ip', parts: [rfqId, requestContext.ipHash] },
        { name: 'token', parts: [rfqId, tokenHash] },
      ],
    });

    if (!rateLimitResult.allowed) {
      return { error: rateLimitResult.error };
    }
  }

  const selectColumns = supplierColumns
    ? `id, supplier_id, invite_part, expires_at, used_at, revoked_at, supplier:suppliers(${supplierColumns})`
    : 'id, supplier_id, invite_part, expires_at, used_at, revoked_at';

  let inviteQuery = supabase
    .from('rfq_invites')
    .select(selectColumns)
    .eq('rfq_id', rfqId)
    .eq('token_hash', tokenHash);

  if (!distinguishRevoked) {
    inviteQuery = inviteQuery.is('revoked_at', null);
  }

  const latestTokenResult = await inviteQuery.single();
  let invite: unknown = latestTokenResult.data;
  let inviteError = latestTokenResult.error;
  let tokenExpiresAt: string | null = null;

  // Not the latest token: links from earlier emails stay valid until their own expiry.
  if (inviteError || !invite) {
    const { data: issuedToken } = await supabase
      .from('rfq_invite_tokens')
      .select('invite_id, expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (issuedToken) {
      let issuedInviteQuery = supabase
        .from('rfq_invites')
        .select(selectColumns)
        .eq('id', issuedToken.invite_id)
        .eq('rfq_id', rfqId);

      if (!distinguishRevoked) {
        issuedInviteQuery = issuedInviteQuery.is('revoked_at', null);
      }

      const issuedInviteResult = await issuedInviteQuery.single();
      invite = issuedInviteResult.data;
      inviteError = issuedInviteResult.error;
      tokenExpiresAt = issuedToken.expires_at as string;
    }
  }

  if (inviteError || !invite) {
    const diagnostics = await getInviteLookupDiagnostics(supabase, rfqId, tokenHash);
    console.warn(`${logPrefix}: invite not found.`, {
      rfqId,
      tokenHashPrefix: tokenHash.slice(0, 8),
      supabaseError: inviteError?.message ?? null,
      ...diagnostics,
    });
    return { error: notFoundMessage };
  }

  const inviteRecord = invite as unknown as SupplierInviteRecord;

  if (inviteRecord.revoked_at) {
    console.info(`${logPrefix}: invite revoked.`, {
      rfqId,
      inviteId: inviteRecord.id,
      supplierId: inviteRecord.supplier_id,
      revokedAt: inviteRecord.revoked_at,
    });
    return { error: notFoundMessage, reason: 'revoked', revokedInvite: inviteRecord };
  }

  const expiresAt = tokenExpiresAt ?? inviteRecord.expires_at;
  if (new Date(expiresAt) < new Date()) {
    console.info(`${logPrefix}: invite expired.`, {
      rfqId,
      inviteId: inviteRecord.id,
      supplierId: inviteRecord.supplier_id,
      expiresAt,
      now: new Date().toISOString(),
    });
    return { error: 'This link has expired' };
  }

  return { invite: inviteRecord, tokenHash, requestContext };
}
