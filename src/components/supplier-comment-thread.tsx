'use client';

import { useState } from 'react';
import { addSupplierComment } from '@/actions/rfq-comments';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { getSupplierTranslations, normalizeSupplierLanguage, SUPPLIER_LANGUAGE_LOCALES } from '@/lib/supplier-language';
import type { RfqComment, SupplierLanguage } from '@/types';

interface SupplierCommentThreadProps {
  rfqId: string;
  token: string;
  initialComments: RfqComment[];
  language: SupplierLanguage;
}

function formatTimestamp(value: string, language: SupplierLanguage) {
  return new Date(value).toLocaleString(SUPPLIER_LANGUAGE_LOCALES[normalizeSupplierLanguage(language)], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SupplierCommentThread({ rfqId, token, initialComments, language }: SupplierCommentThreadProps) {
  const t = getSupplierTranslations(normalizeSupplierLanguage(language));
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setError(t.messageRequired);
      return;
    }

    setSubmitting(true);
    const result = await addSupplierComment(rfqId, token, trimmedBody);
    setSubmitting(false);

    if ('error' in result) {
      setError(result.error ?? t.couldNotSendMessage);
      return;
    }

    setComments((current) => [...current, result.data]);
    setBody('');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.conversation}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noMessagesYet}</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-md border px-3 py-2">
                <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{comment.author_type === 'internal' ? t.sempreTeam : t.you}</span>
                  <span>{formatTimestamp(comment.created_at, language)}</span>
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
            placeholder={t.messagePlaceholder}
            disabled={submitting}
          />

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? t.sending : t.sendMessage}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
