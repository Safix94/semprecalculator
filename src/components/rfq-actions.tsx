'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendRfq, closeRfq } from '@/actions/rfq';

interface RfqActionsProps {
  rfqId: string;
  status: string;
}

export function RfqActions({ rfqId, status }: RfqActionsProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function handleSend() {
    if (!confirm('Weet je zeker dat je deze aanvraag wilt verzenden naar leveranciers?')) return;
    setLoading(true);
    setResult(null);

    const res = await sendRfq(rfqId);

    if ('error' in res) {
      setResult(`Fout: ${typeof res.error === 'string' ? res.error : JSON.stringify(res.error)}`);
    } else if ('data' in res) {
      setResult(`Verzonden naar ${res.data.sent}/${res.data.total} leveranciers`);
    }

    setLoading(false);
    router.refresh();
  }

  async function handleClose() {
    if (!confirm('Weet je zeker dat je deze aanvraag wilt sluiten?')) return;
    setLoading(true);

    const res = await closeRfq(rfqId);
    if (res.error) {
      setResult(`Fout: ${res.error}`);
    }

    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {status === 'draft' && (
        <button
          onClick={handleSend}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Bezig...' : 'Verzenden'}
        </button>
      )}
      {status === 'sent' && (
        <button
          onClick={handleClose}
          disabled={loading}
          className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Bezig...' : 'Sluiten'}
        </button>
      )}
      {result && (
        <span className="text-sm text-gray-600">{result}</span>
      )}
    </div>
  );
}
