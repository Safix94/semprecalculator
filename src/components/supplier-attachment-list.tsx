'use client';

import { useState } from 'react';
import { getAttachmentUrl } from '@/actions/quote';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getSupplierTranslations, normalizeSupplierLanguage } from '@/lib/supplier-language';
import type { RfqAttachment, SupplierLanguage } from '@/types';

interface SupplierAttachmentListProps {
  rfqId: string;
  token: string;
  attachments: RfqAttachment[];
  language: SupplierLanguage;
}

export function SupplierAttachmentList({ rfqId, token, attachments, language }: SupplierAttachmentListProps) {
  const t = getSupplierTranslations(normalizeSupplierLanguage(language));
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOpenAttachment(attachment: RfqAttachment) {
    setOpeningAttachmentId(attachment.id);
    setError(null);

    try {
      const result = await getAttachmentUrl(rfqId, token, attachment.storage_path);
      if ('error' in result) {
        setError(result.error ?? t.couldNotOpenAttachment);
        return;
      }

      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (openError) {
      console.error('Failed to open supplier attachment:', openError);
      setError(t.couldNotOpenAttachment);
    } finally {
      setOpeningAttachmentId(null);
    }
  }

  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-border pt-4">
      <h3 className="mb-2 text-xs uppercase text-muted-foreground">{t.attachments}</h3>
      <ul className="space-y-2">
        {attachments.map((attachment) => (
          <li
            key={attachment.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className="min-w-0 truncate">{attachment.file_name}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenAttachment(attachment)}
              disabled={openingAttachmentId === attachment.id}
            >
              {openingAttachmentId === attachment.id ? t.opening : t.open}
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
