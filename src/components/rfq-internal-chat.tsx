'use client';

import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { markInternalMessagesRead, postInternalMessage } from '@/actions/rfq-internal-chat';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { RfqInternalMessage } from '@/types';

interface RfqInternalChatProps {
  rfqId: string;
  currentUserId: string;
  initialMessages: RfqInternalMessage[];
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function RfqInternalChat({ rfqId, currentUserId, initialMessages }: RfqInternalChatProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opening the request clears the dashboard "new message" badge for this user.
  useEffect(() => {
    void markInternalMessagesRead(rfqId);
  }, [rfqId]);

  async function handleSend() {
    setSending(true);
    setError(null);
    const result = await postInternalMessage(rfqId, draft);
    setSending(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setMessages((current) => [...current, result.data]);
    setDraft('');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Internal chat</CardTitle>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3" />
          Sales and pricing only, not visible to the supplier
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No internal messages yet.</p>
        ) : (
          <ul className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`sempre-message ${
                  message.author_id === currentUserId
                    ? 'ml-auto max-w-[88%] border-primary/20 bg-primary/10'
                    : 'border-border bg-muted/45'
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate">{message.author_email || 'Sempre team'}</span>
                  <span className="shrink-0">{formatTimestamp(message.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{message.body}</p>
              </li>
            ))}
          </ul>
        )}

        <Textarea
          rows={3}
          maxLength={2000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message to sales / pricing…"
          disabled={sending}
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="button" onClick={handleSend} disabled={sending || draft.trim().length === 0}>
          {sending ? 'Sending...' : 'Send'}
        </Button>
      </CardContent>
    </Card>
  );
}
