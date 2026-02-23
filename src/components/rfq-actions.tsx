'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendRfq, closeRfq } from '@/actions/rfq';
import { Button } from '@/components/ui/button';

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
        <Button onClick={handleSend} disabled={loading}>
          {loading ? 'Bezig...' : 'Verzenden'}
        </Button>
      )}
      {status === 'sent' && (
        <Button onClick={handleClose} disabled={loading} variant="secondary">
          {loading ? 'Bezig...' : 'Sluiten'}
        </Button>
      )}
      {result && <span className="text-sm text-muted-foreground">{result}</span>}
    </div>
  );
}
