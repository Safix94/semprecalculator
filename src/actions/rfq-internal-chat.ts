'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getPricingTeamEmailsFromEnv, sendInternalChatMessageEmail } from '@/lib/mailer';
import { normalizeEmail } from '@/lib/email-recipients';
import { rfqCommentBodySchema } from '@/lib/validation';
import { logAuditEvent } from '@/actions/audit';
import type { RfqInternalMessage } from '@/types';

type ActionError = { error: string };

/**
 * Internal sales ↔ pricing chat per RFQ. Lives in rfq_internal_messages, which
 * the supplier pages never query, so suppliers cannot read it.
 */
export async function postInternalMessage(
  rfqId: string,
  body: string
): Promise<{ data: RfqInternalMessage } | ActionError> {
  const user = await requireRole('sales');
  const parsedBody = rfqCommentBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return { error: parsedBody.error.flatten().formErrors[0] ?? 'Message is invalid' };
  }

  const supabase = await createClient();
  const { data: rfq, error: rfqError } = await supabase
    .from('rfqs')
    .select('id, created_by, product_type, material, shape, customer_name')
    .eq('id', rfqId)
    .single();

  if (rfqError || !rfq) {
    return { error: 'RFQ not found' };
  }

  const { data: message, error: insertError } = await supabase
    .from('rfq_internal_messages')
    .insert({
      rfq_id: rfqId,
      author_id: user.id,
      author_email: user.email,
      body: parsedBody.data,
    })
    .select('*')
    .single();

  if (insertError || !message) {
    return { error: `Could not save message: ${insertError?.message ?? 'Unknown error'}` };
  }

  // Your own message never counts as unread for you.
  await markInternalMessagesRead(rfqId);

  await logAuditEvent({
    actorType: user.role,
    actorId: user.id,
    action: 'INTERNAL_CHAT_MESSAGE',
    entityType: 'rfq',
    entityId: rfqId,
    metadata: { messageId: message.id },
  });

  // Notify the requester and the pricing team, never the author.
  after(async () => {
    const recipients = new Set(getPricingTeamEmailsFromEnv().map(normalizeEmail));
    const serviceRole = createServiceRoleClient();
    const { data: creator, error: creatorError } = await serviceRole.auth.admin.getUserById(rfq.created_by);
    if (!creatorError && creator?.user?.email) {
      recipients.add(normalizeEmail(creator.user.email));
    }
    recipients.delete(normalizeEmail(user.email));

    const recipientList = [...recipients].filter(Boolean);
    if (recipientList.length === 0) return;

    const rfqTitle =
      [rfq.product_type, rfq.material, rfq.shape].filter(Boolean).join(' - ') +
      (rfq.customer_name ? ` (${rfq.customer_name})` : '');

    await sendInternalChatMessageEmail({
      recipients: recipientList,
      rfqId,
      rfqTitle,
      authorEmail: user.email,
      body: parsedBody.data,
    });
  });

  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  revalidatePath('/dashboard');
  return { data: message as RfqInternalMessage };
}

export async function markInternalMessagesRead(rfqId: string): Promise<void> {
  const user = await requireRole('sales');
  const supabase = await createClient();
  const { error } = await supabase
    .from('rfq_internal_message_reads')
    .upsert(
      { rfq_id: rfqId, user_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: 'rfq_id,user_id' }
    );

  if (error) {
    console.error('Failed to mark internal messages read:', { rfqId, error: error.message });
  }
}
