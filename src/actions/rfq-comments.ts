'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getSupplierTranslations, normalizeSupplierLanguage } from '@/lib/supplier-language';
import { resolveSupplierInviteByToken } from '@/lib/supplier-invite';
import { getPricingTeamEmailsFromEnv, sendInternalSupplierCommentEmail } from '@/lib/mailer';
import { rfqCommentBodySchema } from '@/lib/validation';
import { logAuditEvent } from '@/actions/audit';
import { getSupplierLinkRequestContext } from '@/lib/rate-limit';
import type { SupplierLinkRequestContext } from '@/lib/rate-limit';
import type { RfqComment } from '@/types';

type ActionError = { error: string };

interface SupplierInviteAccess {
  id: string;
  supplier_id: string;
  expires_at: string;
}

async function resolveSupplierInvite(
  rfqId: string,
  token: string,
  options?: {
    rateLimitCommentSubmit?: boolean;
    requestContext?: SupplierLinkRequestContext;
  }
): Promise<{ data: SupplierInviteAccess } | ActionError> {
  const resolved = await resolveSupplierInviteByToken({
    rfqId,
    token,
    action: 'supplier_comment_add',
    rateLimit: options?.rateLimitCommentSubmit ?? false,
    requestContext: options?.requestContext,
    logPrefix: 'Supplier comment access blocked',
  });

  if ('error' in resolved) {
    return { error: resolved.error };
  }

  return {
    data: {
      id: resolved.invite.id,
      supplier_id: resolved.invite.supplier_id,
      expires_at: resolved.invite.expires_at,
    },
  };
}

export async function listSupplierComments(
  rfqId: string,
  token: string
): Promise<{ data: RfqComment[] } | ActionError> {
  const inviteResult = await resolveSupplierInvite(rfqId, token);
  if ('error' in inviteResult) {
    return { error: inviteResult.error };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('rfq_comments')
    .select('*')
    .eq('rfq_id', rfqId)
    .eq('supplier_id', inviteResult.data.supplier_id)
    .order('created_at', { ascending: true });

  if (error) {
    return { error: `Could not load comments: ${error.message}` };
  }

  return { data: (data ?? []) as RfqComment[] };
}

export async function addSupplierComment(
  rfqId: string,
  token: string,
  body: string
): Promise<{ data: RfqComment } | ActionError> {
  const parsedBody = rfqCommentBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return { error: parsedBody.error.flatten().formErrors[0] ?? 'Message is invalid' };
  }

  const requestContext = await getSupplierLinkRequestContext();
  const inviteResult = await resolveSupplierInvite(rfqId, token, {
    rateLimitCommentSubmit: true,
    requestContext,
  });
  if ('error' in inviteResult) {
    return { error: inviteResult.error };
  }

  const invite = inviteResult.data;
  const supabase = createServiceRoleClient();

  const [{ data: supplier }, { data: rfq }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('name, preferred_language')
      .eq('id', invite.supplier_id)
      .single(),
    supabase
      .from('rfqs')
      .select('created_by, status')
      .eq('id', rfqId)
      .single(),
  ]);

  // Closed requests no longer accept messages, even while the link is valid.
  if (rfq?.status === 'closed') {
    const labels = getSupplierTranslations(normalizeSupplierLanguage(supplier?.preferred_language));
    return { error: labels.requestClosedSubmitError };
  }

  const { data: comment, error: commentError } = await supabase
    .from('rfq_comments')
    .insert({
      rfq_id: rfqId,
      supplier_id: invite.supplier_id,
      author_type: 'supplier',
      author_id: invite.supplier_id,
      body: parsedBody.data,
    })
    .select('*')
    .single();

  if (commentError || !comment) {
    return { error: `Could not send message: ${commentError?.message ?? 'Unknown error'}` };
  }

  if (rfq?.status === 'sent_to_supplier') {
    const { error: rfqStatusError } = await supabase
      .from('rfqs')
      .update({ status: 'supplier_replied' })
      .eq('id', rfqId)
      .eq('status', 'sent_to_supplier');

    if (rfqStatusError) {
      console.warn('Failed to update RFQ status to supplier_replied after supplier comment.', {
        rfqId,
        supplierId: invite.supplier_id,
        commentId: comment.id,
        error: rfqStatusError.message,
      });
    } else {
      revalidatePath('/dashboard');
      revalidatePath(`/dashboard/rfqs/${rfqId}`);
    }
  }

  // Internal notification doesn't affect the supplier's result — send it
  // after the response so the message form resolves without waiting on Brevo.
  after(async () => {
    const recipients = new Set(getPricingTeamEmailsFromEnv());
    if (rfq?.created_by) {
      const { data: rfqCreator, error: creatorError } = await supabase.auth.admin.getUserById(rfq.created_by);
      if (!creatorError && rfqCreator?.user?.email) {
        recipients.add(rfqCreator.user.email);
      }
    }

    const recipientList = [...recipients];
    if (recipientList.length > 0) {
      await sendInternalSupplierCommentEmail({
        recipients: recipientList,
        rfqId,
        supplierName: supplier?.name ?? 'Supplier',
        bodyExcerpt: parsedBody.data,
      });
    }
  });

  await logAuditEvent({
    actorType: 'supplier_link',
    actorId: invite.supplier_id,
    action: 'SUPPLIER_COMMENT_ADDED',
    entityType: 'rfq_comment',
    entityId: comment.id,
    metadata: {
      rfqId,
      supplierId: invite.supplier_id,
    },
    ip: requestContext.ip,
    userAgent: requestContext.userAgent,
  });

  return { data: comment as RfqComment };
}
