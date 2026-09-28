'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteRfq, restoreRfq } from '@/actions/rfq';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function RfqDeleteButton({ rfqId }: { rfqId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const result = await deleteRfq(rfqId);
    if ('error' in result && result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setOpen(false);
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" className="shrink-0 text-destructive" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!loading) setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this price request?</DialogTitle>
            <DialogDescription>
              The request disappears from all lists and supplier links stop working. Quotes and messages are
              kept, and an admin can restore it from RFQ history.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RfqRestoreButton({ rfqId }: { rfqId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleRestore() {
    setLoading(true);
    setError(null);
    const result = await restoreRfq(rfqId);
    setLoading(false);
    if ('error' in result && result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="secondary" onClick={handleRestore} disabled={loading}>
        {loading ? 'Restoring...' : 'Restore'}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </span>
  );
}
