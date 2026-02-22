'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadAttachment } from '@/actions/rfq';

interface AttachmentUploadProps {
  rfqId: string;
}

export function AttachmentUpload({ rfqId }: AttachmentUploadProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError(typeof result.error === 'string' ? result.error : 'Upload mislukt');
    }

    setLoading(false);
    e.target.value = '';
    router.refresh();
  }

  return (
    <div>
      <label className="inline-flex items-center gap-2 px-3 py-2 text-sm text-blue-600 border border-blue-300 rounded-md cursor-pointer hover:bg-blue-50 transition-colors">
        {loading ? 'Uploaden...' : 'Bijlage toevoegen'}
        <input
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.dwg"
          onChange={handleUpload}
          disabled={loading}
        />
      </label>
      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  );
}
