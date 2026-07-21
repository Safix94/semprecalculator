'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAttachment, getInternalAttachmentUrl } from '@/actions/rfq';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { RfqAttachment } from '@/types';

interface RfqAttachmentListProps {
  rfqId: string;
  attachments: RfqAttachment[];
  canOpen: boolean;
  canDelete?: boolean;
  onMutated?: () => void;
}

export function RfqAttachmentList({
  rfqId,
  attachments,
  canOpen,
  canDelete = false,
  onMutated,
}: RfqAttachmentListProps) {
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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

  async function handleDeleteAttachment(attachment: RfqAttachment) {
    if (!canDelete || deletingAttachmentId) {
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete “${attachment.file_name}”? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingAttachmentId(attachment.id);
    setError(null);

    try {
      const result = await deleteAttachment(rfqId, attachment.id);
      if ('error' in result) {
        setError(result.error ?? 'Could not delete attachment.');
        return;
      }

      router.refresh();
      onMutated?.();
    } catch (deleteError) {
      console.error('Failed to delete attachment:', deleteError);
      setError('Could not delete attachment.');
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  if (attachments.length === 0) {
    return <p className="text-sm text-muted-foreground">No attachments.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {attachments.map((attachment) => {
          const isOpening = openingAttachmentId === attachment.id;
          const isDeleting = deletingAttachmentId === attachment.id;

          return (
            <li key={attachment.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="flex size-7 items-center justify-center rounded-md bg-muted text-[9px] font-extrabold uppercase text-muted-foreground">
                {attachment.file_name.split('.').pop()?.slice(0, 3) ?? 'file'}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{attachment.file_name}</span>
              <span className="text-xs text-muted-foreground">{attachment.mime_type}</span>
              {canOpen && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-sm"
                  disabled={isOpening || isDeleting}
                  onClick={() => handleOpenAttachment(attachment.id)}
                >
                  {isOpening ? 'Openen...' : 'Open'}
                </Button>
              )}
              {canDelete && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-sm text-destructive"
                  disabled={isDeleting || isOpening}
                  onClick={() => handleDeleteAttachment(attachment)}
                >
                  {isDeleting ? 'Removing...' : 'Remove'}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
