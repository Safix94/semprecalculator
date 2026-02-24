'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { sendSupplierThreadReplyEmail } from '@/lib/mailer';
import { rfqCommentBodySchema } from '@/lib/validation';
import {
  assertTokenHashingConfigured,
  generateToken,
  hashToken,
  isTokenHashingConfigError,
} from '@/lib/tokens';
import { logAuditEvent } from '@/actions/audit';
import type { RfqComment, RfqInvite, RfqStatus, Supplier } from '@/types';

const INVITE_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000;

type ActionError = { error: string };

interface ListRfqThreadsData {
  rfqStatus: RfqStatus;
  invites: (RfqInvite & { supplier: Supplier | null })[];
  comments: RfqComment[];
}

interface RefreshInviteData {
  token: string;
  invite: RfqInvite;
  supplier: { id: string; name: string; email: string };
  rfqStatus: RfqStatus;
}

async function refreshInviteToken(params: {
  rfqId: string;
  supplierId: string;
  requestUpdatedQuote: boolean;
}): Promise<{ data: RefreshInviteData } | ActionError> {
  try {
    assertTokenHashingConfigured();
  } catch (error) {
    if (isTokenHashingConfigError(error)) {
      return { error: 'RFQ invites are not configured. Set TOKEN_HASH_SECRET and try again.' };
    }
    return { error: 'RFQ invite token configuration is invalid.' };
  }

  const supabase = await createClient();
  const [{ data: invite, error: inviteError }, { data: supplier, error: supplierError }, { data: rfq, error: rfqError }] = await Promise.all([
    supabase
      .from('rfq_invites')
      .select('*')
      .eq('rfq_id', params.rfqId)
      .eq('supplier_id', params.supplierId)
      .single(),
    supabase
      .from('suppliers')
      .select('id, name, email')
      .eq('id', params.supplierId)
      .single(),
    supabase
      .from('rfqs')
      .select('status')
      .eq('id', params.rfqId)
      .single(),
  ]);

  if (inviteError || !invite) {
    return { error: 'Supplier invite not found' };
  }

  if (supplierError || !supplier?.email) {
    return { error: 'Supplier email is missing' };
  }

  if (rfqError || !rfq) {
    return { error: 'RFQ not found' };
  }

  if (rfq.status === 'closed') {
    return { error: 'Cannot send supplier links for a closed RFQ' };
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRATION_MS).toISOString();
  const updateValues: {
    token_hash: string;
    expires_at: string;
    revoked_at: null;
    used_at?: null;
    last_access_at?: null;
  } = {
    token_hash: tokenHash,
    expires_at: expiresAt,
    revoked_at: null,
  };

  if (params.requestUpdatedQuote) {
    updateValues.used_at = null;
    updateValues.last_access_at = null;
  }

  const { data: updatedInvite, error: updateError } = await supabase
    .from('rfq_invites')
    .update(updateValues)
    .eq('id', invite.id)
    .select('*')
    .single();

  if (updateError || !updatedInvite) {
    return {
      error: `Could not refresh supplier link: ${updateError?.message ?? 'Unknown error'}`,
    };
  }

  return {
    data: {
      token,
      invite: updatedInvite as RfqInvite,
      supplier,
      rfqStatus: rfq.status as RfqStatus,
    },
  };
}

export async function listRfqThreads(
  rfqId: string
): Promise<{ data: ListRfqThreadsData } | ActionError> {
  await requireRole('sales');
  const supabase = await createClient();

  const { data: rfq, error: rfqError } = await supabase
    .from('rfqs')
    .select('status')
    .eq('id', rfqId)
    .single();

  if (rfqError || !rfq) {
    return { error: 'RFQ not found' };
  }

  const [{ data: invites, error: invitesError }, { data: comments, error: commentsError }] =
    await Promise.all([
      supabase
        .from('rfq_invites')
        .select('*, supplier:suppliers(*)')
        .eq('rfq_id', rfqId)
        .order('created_at', { ascending: true }),
      supabase
        .from('rfq_comments')
        .select('*')
        .eq('rfq_id', rfqId)
        .order('created_at', { ascending: true }),
    ]);

  if (invitesError || commentsError) {
    return {
      error: `Could not load threads: ${invitesError?.message ?? commentsError?.message ?? 'Unknown error'}`,
    };
  }

  return {
    data: {
      rfqStatus: rfq.status as RfqStatus,
      invites: (invites ?? []) as (RfqInvite & { supplier: Supplier | null })[],
      comments: (comments ?? []) as RfqComment[],
    },
  };
}

export async function replyToSupplierThread(params: {
  rfqId: string;
  supplierId: string;
  body: string;
  requestUpdatedQuote?: boolean;
}): Promise<{ data: { comment: RfqComment; invite: RfqInvite; emailSent: boolean; emailError?: string } } | ActionError> {
  const user = await requireRole('sales');
  const parsedBody = rfqCommentBodySchema.safeParse(params.body);
  if (!parsedBody.success) {
    return { error: parsedBody.error.flatten().formErrors[0] ?? 'Message is invalid' };
  }

  const refreshResult = await refreshInviteToken({
    rfqId: params.rfqId,
    supplierId: params.supplierId,
    requestUpdatedQuote: params.requestUpdatedQuote === true,
  });
  if ('error' in refreshResult) {
    return { error: refreshResult.error };
  }

  const supabase = await createClient();
  const { data: comment, error: commentError } = await supabase
    .from('rfq_comments')
    .insert({
      rfq_id: params.rfqId,
      supplier_id: params.supplierId,
      author_type: 'internal',
      author_id: user.id,
      author_email: user.email,
      body: parsedBody.data,
    })
    .select('*')
    .single();

  if (commentError || !comment) {
    return { error: `Could not save reply: ${commentError?.message ?? 'Unknown error'}` };
  }

  const emailResult = await sendSupplierThreadReplyEmail({
    supplierEmail: refreshResult.data.supplier.email,
    supplierName: refreshResult.data.supplier.name,
    rfqId: params.rfqId,
    token: refreshResult.data.token,
    messageExcerpt: parsedBody.data,
    requestUpdatedQuote: params.requestUpdatedQuote === true,
  });

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'INTERNAL_COMMENT_ADDED',
    entityType: 'rfq_comment',
    entityId: comment.id,
    metadata: {
      rfqId: params.rfqId,
      supplierId: params.supplierId,
    },
  });

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'SUPPLIER_LINK_SENT',
    entityType: 'rfq_invite',
    entityId: refreshResult.data.invite.id,
    metadata: {
      rfqId: params.rfqId,
      supplierId: params.supplierId,
      requestUpdatedQuote: params.requestUpdatedQuote === true,
      success: emailResult.success,
      error: emailResult.error,
      recipient: refreshResult.data.supplier.email,
    },
  });

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/rfqs/${params.rfqId}`);

  return {
    data: {
      comment: comment as RfqComment,
      invite: refreshResult.data.invite,
      emailSent: emailResult.success,
      emailError: emailResult.error,
    },
  };
}

export async function resendSupplierMagicLink(params: {
  rfqId: string;
  supplierId: string;
}): Promise<{ data: { invite: RfqInvite; emailSent: boolean; emailError?: string } } | ActionError> {
  const user = await requireRole('sales');
  const refreshResult = await refreshInviteToken({
    rfqId: params.rfqId,
    supplierId: params.supplierId,
    requestUpdatedQuote: false,
  });
  if ('error' in refreshResult) {
    return { error: refreshResult.error };
  }

  const emailResult = await sendSupplierThreadReplyEmail({
    supplierEmail: refreshResult.data.supplier.email,
    supplierName: refreshResult.data.supplier.name,
    rfqId: params.rfqId,
    token: refreshResult.data.token,
    messageExcerpt: 'A new secure link was generated for this RFQ.',
    requestUpdatedQuote: false,
  });

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'SUPPLIER_LINK_SENT',
    entityType: 'rfq_invite',
    entityId: refreshResult.data.invite.id,
    metadata: {
      rfqId: params.rfqId,
      supplierId: params.supplierId,
      requestUpdatedQuote: false,
      success: emailResult.success,
      error: emailResult.error,
      recipient: refreshResult.data.supplier.email,
      resendOnly: true,
    },
  });

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/rfqs/${params.rfqId}`);

  return {
    data: {
      invite: refreshResult.data.invite,
      emailSent: emailResult.success,
      emailError: emailResult.error,
    },
  };
}
