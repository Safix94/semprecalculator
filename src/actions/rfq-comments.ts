'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { assertTokenHashingConfigured, hashToken, isTokenHashingConfigError } from '@/lib/tokens';
import { getPricingTeamEmailsFromEnv, sendInternalSupplierCommentEmail } from '@/lib/mailer';
import { rfqCommentBodySchema } from '@/lib/validation';
import { logAuditEvent } from '@/actions/audit';
import type { RfqComment } from '@/types';

const SUPPLIER_TOKEN_REGEX = /^[a-f0-9]{64}$/i;
type ActionError = { error: string };

interface SupplierInviteAccess {
  id: string;
  supplier_id: string;
  expires_at: string;
}

function isValidSupplierToken(token: string): boolean {
  return SUPPLIER_TOKEN_REGEX.test(token);
}

async function resolveSupplierInvite(
  rfqId: string,
  token: string
): Promise<{ data: SupplierInviteAccess } | ActionError> {
  const supabase = createServiceRoleClient();
  const normalizedToken = token.trim();

  try {
    assertTokenHashingConfigured();
  } catch (error) {
    if (isTokenHashingConfigError(error)) {
      return { error: 'Supplier links are not configured. Please contact support.' };
    }
    return { error: 'Supplier link configuration is invalid.' };
  }

  if (!isValidSupplierToken(normalizedToken)) {
    return { error: 'Invalid link' };
  }

  const tokenHash = hashToken(normalizedToken);
  const { data: invite, error: inviteError } = await supabase
    .from('rfq_invites')
    .select('id, supplier_id, expires_at')
    .eq('rfq_id', rfqId)
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single();

  if (inviteError || !invite) {
    return { error: 'Invalid or expired link' };
  }

  if (new Date(invite.expires_at) < new Date()) {
    return { error: 'This link has expired' };
  }

  return { data: invite as SupplierInviteAccess };
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

  const inviteResult = await resolveSupplierInvite(rfqId, token);
  if ('error' in inviteResult) {
    return { error: inviteResult.error };
  }

  const invite = inviteResult.data;
  const supabase = createServiceRoleClient();

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

  const [{ data: supplier }, { data: rfq }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('name')
      .eq('id', invite.supplier_id)
      .single(),
    supabase
      .from('rfqs')
      .select('created_by, status')
      .eq('id', rfqId)
      .single(),
  ]);

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
  });

  return { data: comment as RfqComment };
}
