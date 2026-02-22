'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import type { ActorType } from '@/types';

/**
 * Log an audit event. Uses service role to bypass RLS.
 */
export async function logAuditEvent(params: {
  actorType: ActorType;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const supabase = createServiceRoleClient();

  const { error } = await supabase.from('audit_logs').insert({
    actor_type: params.actorType,
    actor_id: params.actorId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    metadata: params.metadata ?? {},
    ip: params.ip ?? null,
    user_agent: params.userAgent ?? null,
  });

  if (error) {
    console.error('Failed to log audit event:', error.message);
  }
}
