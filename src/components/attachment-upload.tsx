'use client';

import { useState } from 'react';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadAttachment } from '@/actions/rfq';
import { Button } from '@/components/ui/button';

interface AttachmentUploadProps {
  rfqId: string;
}

export function AttachmentUpload({ rfqId }: AttachmentUploadProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    const result = await uploadAttachment(rfqId, formData);

    if (result.error) {
      setError(typeof result.error === 'string' ? result.error : 'Upload failed');
    }

    setLoading(false);
    e.target.value = '';
    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.dwg"
        onChange={handleUpload}
        disabled={loading}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
      >
        {loading ? 'Uploading...' : 'Add attachment'}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
