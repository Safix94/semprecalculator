import 'server-only';

import { createHmac } from 'crypto';
import { headers } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';

export type SupplierLinkRateLimitAction =
  | 'supplier_token_validate'
  | 'supplier_quote_submit'
  | 'supplier_comment_add'
  | 'supplier_attachment_url';

interface RateLimitRule {
  maxAttempts: number;
  windowSeconds: number;
}

interface RateLimitScope {
  name: string;
  parts: Array<string | number | null | undefined>;
}

export interface SupplierLinkRequestContext {
  ip: string | null;
  ipHash: string;
  userAgent: string | null;
}

export interface SupplierLinkRateLimitOptions {
  action: SupplierLinkRateLimitAction;
  scopes: RateLimitScope[];
  requestContext: SupplierLinkRequestContext;
}

export type SupplierLinkRateLimitResult =
  | { allowed: true }
  | { allowed: false; error: string; retryAfterSeconds: number };

const RATE_LIMIT_RULES: Record<SupplierLinkRateLimitAction, RateLimitRule> = {
  supplier_token_validate: { maxAttempts: 40, windowSeconds: 5 * 60 },
  supplier_quote_submit: { maxAttempts: 8, windowSeconds: 10 * 60 },
  supplier_comment_add: { maxAttempts: 12, windowSeconds: 10 * 60 },
  supplier_attachment_url: { maxAttempts: 60, windowSeconds: 10 * 60 },
};

function getRateLimitSecret(): string {
  return (
    process.env.TOKEN_HASH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'development-rate-limit-secret'
  );
}

function hashForRateLimit(value: string): string {
  return createHmac('sha256', getRateLimitSecret()).update(value).digest('hex');
}

function normalizeIp(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') {
    return null;
  }
  return trimmed;
}

export async function getSupplierLinkRequestContext(): Promise<SupplierLinkRequestContext> {
  try {
    const requestHeaders = await headers();
    const forwardedFor = requestHeaders.get('x-forwarded-for')?.split(',')[0] ?? null;
    const ip = normalizeIp(
      forwardedFor ||
        requestHeaders.get('x-real-ip') ||
        requestHeaders.get('cf-connecting-ip') ||
        requestHeaders.get('x-vercel-forwarded-for')
    );
    const userAgent = requestHeaders.get('user-agent')?.slice(0, 512) ?? null;

    return {
      ip,
      ipHash: hashForRateLimit(ip ?? 'unknown-ip'),
      userAgent,
    };
  } catch {
    return {
      ip: null,
      ipHash: hashForRateLimit('unknown-ip'),
      userAgent: null,
    };
  }
}

function buildScopeKey(action: SupplierLinkRateLimitAction, scope: RateLimitScope): string {
  const normalizedParts = scope.parts.map((part) => String(part ?? 'null')).join('|');
  return hashForRateLimit(`${action}|${scope.name}|${normalizedParts}`);
}

function getRateLimitErrorMessage(): string {
  return 'Too many attempts. Please wait a few minutes and try again.';
}

export async function checkSupplierLinkRateLimits(
  options: SupplierLinkRateLimitOptions
): Promise<SupplierLinkRateLimitResult> {
  const rule = RATE_LIMIT_RULES[options.action];
  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - rule.windowSeconds * 1000).toISOString();

  for (const scope of options.scopes) {
    const scopeKey = buildScopeKey(options.action, scope);
    const { count, error } = await supabase
      .from('supplier_link_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('action', options.action)
      .eq('scope_key', scopeKey)
      .gte('created_at', since);

    if (error) {
      console.warn('Supplier link rate-limit check failed; allowing request.', {
        action: options.action,
        scope: scope.name,
        error: error.message,
      });
      continue;
    }

    if ((count ?? 0) >= rule.maxAttempts) {
      console.warn('Supplier link rate limit exceeded.', {
        action: options.action,
        scope: scope.name,
        retryAfterSeconds: rule.windowSeconds,
      });
      return {
        allowed: false,
        error: getRateLimitErrorMessage(),
        retryAfterSeconds: rule.windowSeconds,
      };
    }
  }

  const rows = options.scopes.map((scope) => ({
    action: options.action,
    scope_key: buildScopeKey(options.action, scope),
    scope_name: scope.name,
    ip_hash: options.requestContext.ipHash,
    user_agent: options.requestContext.userAgent,
  }));

  const { error: insertError } = await supabase.from('supplier_link_rate_limits').insert(rows);
  if (insertError) {
    console.warn('Supplier link rate-limit insert failed.', {
      action: options.action,
      error: insertError.message,
    });
  }

  return { allowed: true };
}
