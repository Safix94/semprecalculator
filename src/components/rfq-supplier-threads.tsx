'use client';

import { useMemo, useState } from 'react';
import { replyToSupplierThread, resendSupplierMagicLink } from '@/actions/rfq-thread';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { RfqComment, RfqInvite, RfqStatus, Supplier } from '@/types';

interface RfqSupplierThreadsProps {
  rfqId: string;
  rfqStatus: RfqStatus;
  invites: (RfqInvite & { supplier: Supplier | null })[];
  initialComments: RfqComment[];
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInviteStatus(invite: RfqInvite) {
  if (invite.revoked_at) return 'Revoked';
  if (invite.used_at) return 'Quote submitted';
  if (new Date(invite.expires_at) < new Date()) return 'Expired';
  return 'Open';
}

export function RfqSupplierThreads({
  rfqId,
  rfqStatus,
  invites,
  initialComments,
}: RfqSupplierThreadsProps) {
  const [threadInvites, setThreadInvites] = useState(invites);
  const [comments, setComments] = useState(initialComments);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(invites[0]?.supplier_id ?? '');
  const [draftBySupplierId, setDraftBySupplierId] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorBySupplierId, setErrorBySupplierId] = useState<Record<string, string>>({});
  const [infoBySupplierId, setInfoBySupplierId] = useState<Record<string, string>>({});

  const commentListBySupplierId = useMemo(() => {
    const map = new Map<string, RfqComment[]>();
    for (const comment of comments) {
      const current = map.get(comment.supplier_id) ?? [];
      current.push(comment);
      map.set(comment.supplier_id, current);
    }
    return map;
  }, [comments]);

  function upsertInvite(invite: RfqInvite) {
    setThreadInvites((current) =>
      current.map((currentInvite) => (currentInvite.id === invite.id ? { ...currentInvite, ...invite } : currentInvite))
    );
  }

  async function handleReply(supplierId: string, requestUpdatedQuote: boolean) {
    const body = (draftBySupplierId[supplierId] ?? '').trim();
    if (!body) {
      setErrorBySupplierId((current) => ({
        ...current,
        [supplierId]: 'Message is required.',
      }));
      return;
    }

    setBusyAction(`${supplierId}:${requestUpdatedQuote ? 'update' : 'reply'}`);
    setErrorBySupplierId((current) => ({ ...current, [supplierId]: '' }));
    setInfoBySupplierId((current) => ({ ...current, [supplierId]: '' }));

    const result = await replyToSupplierThread({
      rfqId,
      supplierId,
      body,
      requestUpdatedQuote,
    });

    setBusyAction(null);

    if ('error' in result) {
      setErrorBySupplierId((current) => ({
        ...current,
        [supplierId]: result.error ?? 'Could not send reply',
      }));
      return;
    }

    setComments((current) => [...current, result.data.comment]);
    upsertInvite(result.data.invite);
    setDraftBySupplierId((current) => ({ ...current, [supplierId]: '' }));
    setInfoBySupplierId((current) => ({
      ...current,
      [supplierId]: result.data.emailSent
        ? 'Reply sent and supplier email delivered.'
        : `Reply saved, but email failed: ${result.data.emailError ?? 'unknown error'}`,
    }));
  }

  async function handleResendLink(supplierId: string) {
    if (!confirm('Resend a fresh magic link to this supplier?')) {
      return;
    }

    setBusyAction(`${supplierId}:resend`);
    setErrorBySupplierId((current) => ({ ...current, [supplierId]: '' }));
    setInfoBySupplierId((current) => ({ ...current, [supplierId]: '' }));

    const result = await resendSupplierMagicLink({ rfqId, supplierId });
    setBusyAction(null);

    if ('error' in result) {
      setErrorBySupplierId((current) => ({
        ...current,
        [supplierId]: result.error ?? 'Could not resend link',
      }));
      return;
    }

    upsertInvite(result.data.invite);
    setInfoBySupplierId((current) => ({
      ...current,
      [supplierId]: result.data.emailSent
        ? 'Fresh magic link sent to supplier.'
        : `Link refreshed, but email failed: ${result.data.emailError ?? 'unknown error'}`,
    }));
  }

  if (threadInvites.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Supplier conversation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No suppliers invited yet.</p>
        </CardContent>
      </Card>
    );
  }

  const actionsDisabled = rfqStatus === 'closed';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Supplier conversation</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs
          value={selectedSupplierId}
          onValueChange={setSelectedSupplierId}
          className="space-y-4"
        >
          <TabsList className="w-full justify-start overflow-x-auto">
            {threadInvites.map((invite) => (
              <TabsTrigger key={invite.id} value={invite.supplier_id}>
                {invite.supplier?.name ?? 'Unknown supplier'}
              </TabsTrigger>
            ))}
          </TabsList>

          {threadInvites.map((invite) => {
            const supplierId = invite.supplier_id;
            const supplierComments = commentListBySupplierId.get(supplierId) ?? [];
            const error = errorBySupplierId[supplierId];
            const info = infoBySupplierId[supplierId];
            const draftMessage = draftBySupplierId[supplierId] ?? '';

            return (
              <TabsContent key={invite.id} value={supplierId} className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Status: {getInviteStatus(invite)}
                </div>

                {supplierComments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No messages yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {supplierComments.map((comment) => (
                      <li key={comment.id} className="rounded-md border px-3 py-2">
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span>
                            {comment.author_type === 'supplier'
                              ? invite.supplier?.name ?? 'Supplier'
                              : comment.author_email || 'Sempre team'}
                          </span>
                          <span>{formatTimestamp(comment.created_at)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="space-y-3">
                  <Textarea
                    rows={4}
                    maxLength={2000}
                    value={draftMessage}
                    onChange={(event) =>
                      setDraftBySupplierId((current) => ({
                        ...current,
                        [supplierId]: event.target.value,
                      }))
                    }
                    placeholder="Write your reply to this supplier..."
                    disabled={actionsDisabled || busyAction !== null}
                  />

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {info && <p className="text-sm text-muted-foreground">{info}</p>}

                  {actionsDisabled && (
                    <p className="text-sm text-muted-foreground">Thread is locked because this RFQ is closed.</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={actionsDisabled || busyAction !== null}
                      onClick={() => handleReply(supplierId, false)}
                    >
                      {busyAction === `${supplierId}:reply` ? 'Sending...' : 'Reply'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={actionsDisabled || busyAction !== null}
                      onClick={() => handleReply(supplierId, true)}
                    >
                      {busyAction === `${supplierId}:update` ? 'Sending...' : 'Request updated quote'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={actionsDisabled || busyAction !== null}
                      onClick={() => handleResendLink(supplierId)}
                    >
                      {busyAction === `${supplierId}:resend` ? 'Sending...' : 'Resend link'}
                    </Button>
                  </div>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
