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
    if (!confirm('Are you sure you want to send this request to suppliers?')) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await sendRfq(rfqId);

      if ('error' in res) {
        setResult(`Error: ${typeof res.error === 'string' ? res.error : JSON.stringify(res.error)}`);
      } else if ('data' in res) {
        setResult(`Sent to ${res.data.sent}/${res.data.total} suppliers`);
      }

      router.refresh();
    } catch (error) {
      console.error('Failed to send RFQ:', error);
      setResult('Error: Failed to send RFQ');
    } finally {
      setLoading(false);
    }
  }

  async function handleClose() {
    if (!confirm('Are you sure you want to close this request?')) return;
    setLoading(true);

    try {
      const res = await closeRfq(rfqId);
      if (res.error) {
        setResult(`Error: ${res.error}`);
      }

      router.refresh();
    } catch (error) {
      console.error('Failed to close RFQ:', error);
      setResult('Error: Failed to close RFQ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status === 'draft' && (
        <Button onClick={handleSend} disabled={loading}>
          {loading ? 'Loading...' : 'Send'}
        </Button>
      )}
      {status === 'sent' && (
        <Button onClick={handleClose} disabled={loading} variant="secondary">
          {loading ? 'Loading...' : 'Close'}
        </Button>
      )}
      {result && <span className="text-sm text-muted-foreground">{result}</span>}
    </div>
  );
}
