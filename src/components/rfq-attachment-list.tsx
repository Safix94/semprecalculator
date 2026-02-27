'use client';

import { useState } from 'react';
import { getInternalAttachmentUrl } from '@/actions/rfq';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { RfqAttachment } from '@/types';

interface RfqAttachmentListProps {
  rfqId: string;
  attachments: RfqAttachment[];
  canOpen: boolean;
}

export function RfqAttachmentList({ rfqId, attachments, canOpen }: RfqAttachmentListProps) {
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOpenAttachment(attachmentId: string) {
    if (!canOpen) {
      return;
    }

    setOpeningAttachmentId(attachmentId);
    setError(null);

    try {
      const result = await getInternalAttachmentUrl(rfqId, attachmentId);
      if ('error' in result) {
        setError(result.error ?? 'Could not open attachment.');
        return;
      }

      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (openError) {
      console.error('Failed to open attachment:', openError);
      setError('Could not open attachment.');
    } finally {
      setOpeningAttachmentId(null);
    }
  }

  if (attachments.length === 0) {
    return <p className="text-sm text-muted-foreground">No attachments.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {attachments.map((attachment) => (
          <li key={attachment.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{attachment.file_name}</span>
            <span className="text-xs text-muted-foreground">({attachment.mime_type})</span>
            {canOpen && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-sm"
                disabled={openingAttachmentId === attachment.id}
                onClick={() => handleOpenAttachment(attachment.id)}
              >
                {openingAttachmentId === attachment.id ? 'Opening...' : 'Open'}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
