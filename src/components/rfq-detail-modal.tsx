'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getRfqDetail } from '@/actions/rfq';
import { AttachmentUpload } from '@/components/attachment-upload';
import { FormattedDate } from '@/components/formatted-date';
import { QuoteComparison } from '@/components/quote-comparison';
import { RfqActions } from '@/components/rfq-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Rfq, RfqAttachment, RfqInvite, RfqQuote, RfqStatus, Supplier } from '@/types';

interface RfqDetailModalProps {
  rfqId: string | null;
  refreshToken: string;
}

interface RfqDetailData {
  rfq: Rfq;
  attachments: RfqAttachment[];
  invites: (RfqInvite & { supplier: Supplier | null })[];
  quotes: (RfqQuote & { supplier: Supplier | null })[];
}

const statusLabels: Record<RfqStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-secondary text-secondary-foreground' },
  sent_to_supplier: { label: 'Sent to supplier', color: 'bg-primary/15 text-primary' },
  waiting_for_technical_drawing: { label: 'Waiting for technical drawing', color: 'bg-chart-4/15 text-chart-4' },
  closed: { label: 'Closed', color: 'bg-accent text-accent-foreground' },
};

export function RfqDetailModal({ rfqId, refreshToken }: RfqDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<RfqDetailData | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = Boolean(rfqId);

  const closeModal = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('rfq');

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!open || !rfqId) {
      setError(null);
      setDetail(null);
      return;
    }

    const currentRfqId = rfqId;
    let active = true;

    async function loadDetail() {
      setLoading(true);
      setError(null);

      try {
        const result = await getRfqDetail(currentRfqId);
        if (!active) {
          return;
        }

        if ('error' in result) {
          setError(result.error);
          setDetail(null);
          return;
        }

        setDetail(result.data);
      } catch (loadError) {
        if (!active) {
          return;
        }

        console.error('Failed to load RFQ detail modal:', loadError);
        setError('Could not load RFQ details.');
        setDetail(null);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDetail();

    return () => {
      active = false;
    };
  }, [open, refreshToken, rfqId]);

  const invitesWithSupplier = useMemo(
    () =>
      (detail?.invites ?? []).filter(
        (invite): invite is RfqInvite & { supplier: Supplier } => Boolean(invite.supplier)
      ),
    [detail?.invites]
  );

  const quotesWithSupplier = useMemo(
    () =>
      (detail?.quotes ?? []).filter(
        (quote): quote is RfqQuote & { supplier: Supplier } => Boolean(quote.supplier)
      ),
    [detail?.quotes]
  );

  const status = detail
    ? statusLabels[detail.rfq.status] ?? {
        label: detail.rfq.status,
        color: 'bg-muted text-muted-foreground',
      }
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeModal();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {detail ? `${detail.rfq.material} - ${detail.rfq.shape}` : 'RFQ details'}
          </DialogTitle>
          <DialogDescription>
            View RFQ details, attachments, status, and supplier responses.
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">Loading RFQ details...</p>}

        {!loading && error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && !error && detail && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  Created on{' '}
                  <FormattedDate
                    value={detail.rfq.created_at}
                    locale="nl-NL"
                    dateStyle="short"
                    timeStyle="short"
                  />
                  {detail.rfq.sent_at && (
                    <>
                      {' '}
                      | Sent on{' '}
                      <FormattedDate
                        value={detail.rfq.sent_at}
                        locale="nl-NL"
                        dateStyle="short"
                        timeStyle="short"
                      />
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {status && (
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${status.color}`}
                  >
                    {status.label}
                  </span>
                )}
                <RfqActions rfqId={detail.rfq.id} status={detail.rfq.status} />
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Material</dt>
                    <dd className="mt-1 text-sm font-medium">{detail.rfq.material}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Shape</dt>
                    <dd className="mt-1 text-sm font-medium">{detail.rfq.shape}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Customer</dt>
                    <dd className="mt-1 text-sm font-medium">{detail.rfq.customer_name || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Dimensions (LxWxH)</dt>
                    <dd className="mt-1 text-sm font-medium">
                      {detail.rfq.length} x {detail.rfq.width} x {detail.rfq.height} mm
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Thickness</dt>
                    <dd className="mt-1 text-sm font-medium">{detail.rfq.thickness} mm</dd>
                  </div>
                  {detail.rfq.notes && (
                    <div className="col-span-2 md:col-span-3">
                      <dt className="text-xs uppercase text-muted-foreground">Notes</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-sm">{detail.rfq.notes}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Attachments</CardTitle>
              </CardHeader>
              <CardContent>
                {detail.attachments.length > 0 ? (
                  <ul className="space-y-2">
                    {detail.attachments.map((attachment) => (
                      <li key={attachment.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{attachment.file_name}</span>
                        <span className="text-xs text-muted-foreground">({attachment.mime_type})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No attachments.</p>
                )}

                {(detail.rfq.status === 'draft' ||
                  detail.rfq.status === 'waiting_for_technical_drawing') && (
                  <div className="mt-4">
                    <AttachmentUpload rfqId={detail.rfq.id} />
                  </div>
                )}
              </CardContent>
            </Card>

            {detail.rfq.status !== 'draft' && (
              <QuoteComparison invites={invitesWithSupplier} quotes={quotesWithSupplier} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
