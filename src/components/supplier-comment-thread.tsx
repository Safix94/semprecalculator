'use client';

import { useState } from 'react';
import { addSupplierComment } from '@/actions/rfq-comments';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { RfqComment } from '@/types';

interface SupplierCommentThreadProps {
  rfqId: string;
  token: string;
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

export function SupplierCommentThread({ rfqId, token, initialComments }: SupplierCommentThreadProps) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setError('Message is required');
      return;
    }

    setSubmitting(true);
    const result = await addSupplierComment(rfqId, token, trimmedBody);
    setSubmitting(false);

    if ('error' in result) {
      setError(result.error ?? 'Could not send message');
      return;
    }

    setComments((current) => [...current, result.data]);
    setBody('');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-md border px-3 py-2">
                <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{comment.author_type === 'internal' ? 'Sempre team' : 'You'}</span>
                  <span>{formatTimestamp(comment.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            name="message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Ask a question or share an update..."
            disabled={submitting}
          />

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Sending...' : 'Send message'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
