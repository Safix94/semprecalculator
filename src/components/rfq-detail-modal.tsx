'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getRfqDetail, sendToPricingTeam } from '@/actions/rfq';
import { AttachmentUpload } from '@/components/attachment-upload';
import { RfqNotesEditor } from '@/components/rfq-notes-editor';
import { RfqSupplierThreads } from '@/components/rfq-supplier-threads';
import { Button } from '@/components/ui/button';
import { FormattedDate } from '@/components/formatted-date';
import { QuoteComparison } from '@/components/quote-comparison';
import { RfqActions } from '@/components/rfq-actions';
import { formatRfqDimensionsWithOptions, isRoundShape } from '@/lib/rfq-format';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Rfq, RfqAttachment, RfqComment, RfqInvite, RfqQuote, RfqStatus, Supplier } from '@/types';

interface RfqDetailModalProps {
  rfqId: string | null;
  refreshToken: string;
}

interface RfqDetailData {
  rfq: Rfq;
  attachments: RfqAttachment[];
  invites: (RfqInvite & { supplier: Supplier | null })[];
  quotes: (RfqQuote & { supplier: Supplier | null })[];
  comments: RfqComment[];
}

const statusLabels: Record<RfqStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-secondary text-secondary-foreground' },
  sent_to_pricing: { label: 'Sent to pricing', color: 'bg-chart-4/15 text-chart-4' },
  sent_to_supplier: { label: 'Sent to supplier', color: 'bg-primary/15 text-primary' },
  waiting_for_technical_drawing: { label: 'Waiting for technical drawing', color: 'bg-chart-4/15 text-chart-4' },
  quotes_received: { label: 'Supplier replied', color: 'bg-chart-2/15 text-chart-2' },
  closed: { label: 'Closed', color: 'bg-accent text-accent-foreground' },
};

export function RfqDetailModal({ rfqId, refreshToken }: RfqDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<RfqDetailData | null>(null);
  const [pricingTeamLoading, setPricingTeamLoading] = useState(false);
  const [pricingTeamResult, setPricingTeamResult] = useState<string | null>(null);
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

  const isRound = detail ? isRoundShape(detail.rfq.shape) : false;
  const isTablesType = detail?.rfq.product_type === 'Tables';

  const handleSendToPricingTeam = useCallback(async () => {
    if (!detail?.rfq.id) return;
    setPricingTeamLoading(true);
    setPricingTeamResult(null);
    try {
      const res = await sendToPricingTeam(detail.rfq.id);
      if ('error' in res) {
        setPricingTeamResult(`Error: ${typeof res.error === 'string' ? res.error : JSON.stringify(res.error)}`);
      } else {
        setPricingTeamResult(`Sent to pricing team (${res.data.sent}/${res.data.total})`);
        router.refresh();
      }
    } catch (err) {
      console.error('Send to pricing team failed:', err);
      setPricingTeamResult('Error: Failed to notify pricing team');
    } finally {
      setPricingTeamLoading(false);
    }
  }, [detail?.rfq.id, router]);

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
            Here you can see all the details of the pricing request
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
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
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
              <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
                {status && (
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-sm font-medium ${status.color}`}
                  >
                    {status.label}
                  </span>
                )}
                {detail.rfq.status === 'draft' && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSendToPricingTeam}
                    disabled={pricingTeamLoading}
                    className="shrink-0"
                  >
                    {pricingTeamLoading ? 'Loading...' : 'Send to pricing team'}
                  </Button>
                )}
                <div className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 sm:w-auto">
                  <RfqActions
                    rfqId={detail.rfq.id}
                    status={detail.rfq.status}
                    materialId={detail.rfq.material_id}
                    hidePricingTeamButton
                  />
                </div>
                {pricingTeamResult && (
                  <span className="min-w-0 shrink text-sm text-muted-foreground">{pricingTeamResult}</span>
                )}
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {detail.rfq.product_type && (
                    <div>
                      <dt className="text-xs uppercase text-muted-foreground">Type</dt>
                      <dd className="mt-1 text-sm font-medium">{detail.rfq.product_type}</dd>
                    </div>
                  )}
                  {!isTablesType && (
                    <div>
                      <dt className="text-xs uppercase text-muted-foreground">Material</dt>
                      <dd className="mt-1 text-sm font-medium">{detail.rfq.material}</dd>
                    </div>
                  )}
                  {isTablesType && detail.rfq.material_table_top && (
                    <div>
                      <dt className="text-xs uppercase text-muted-foreground">Tafelblad</dt>
                      <dd className="mt-1 text-sm font-medium">
                        {detail.rfq.material_table_top}
                        {detail.rfq.finish_table_top ? ` (${detail.rfq.finish_table_top})` : ''}
                      </dd>
                    </div>
                  )}
                  {isTablesType && detail.rfq.material_table_foot && (
                    <div>
                      <dt className="text-xs uppercase text-muted-foreground">Tafelpoot</dt>
                      <dd className="mt-1 text-sm font-medium">
                        {detail.rfq.material_table_foot}
                        {detail.rfq.finish_table_foot ? ` (${detail.rfq.finish_table_foot})` : ''}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Shape</dt>
                    <dd className="mt-1 text-sm font-medium">{detail.rfq.shape}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Customer</dt>
                    <dd className="mt-1 text-sm font-medium">{detail.rfq.customer_name || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">
                      {isRound ? 'Dimensions (Ø x H)' : 'Dimensions (LxWxH)'}
                    </dt>
                    <dd className="mt-1 text-sm font-medium">
                      {formatRfqDimensionsWithOptions(detail.rfq, { includeThickness: false })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Quantity</dt>
                    <dd className="mt-1 text-sm font-medium">{detail.rfq.quantity}</dd>
                  </div>
                  {(!isRound || detail.rfq.thickness > 0) && (
                    <div>
                      <dt className="text-xs uppercase text-muted-foreground">Thickness</dt>
                      <dd className="mt-1 text-sm font-medium">{detail.rfq.thickness} cm</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 border-t pt-4">
                  <h3 className="mb-2 text-xs uppercase text-muted-foreground">Notes</h3>
                  <RfqNotesEditor
                    key={`rfq-notes-${detail.rfq.id}`}
                    rfqId={detail.rfq.id}
                    initialNotes={detail.rfq.notes}
                    disabled={detail.rfq.status === 'closed'}
                  />
                </div>
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

                {detail.rfq.status !== 'closed' && (
                  <div className="mt-4">
                    <AttachmentUpload rfqId={detail.rfq.id} />
                  </div>
                )}
              </CardContent>
            </Card>

            {detail.rfq.status !== 'draft' && (
              <QuoteComparison invites={invitesWithSupplier} quotes={quotesWithSupplier} />
            )}

            <RfqSupplierThreads
              key={`rfq-threads-${detail.rfq.id}`}
              rfqId={detail.rfq.id}
              rfqStatus={detail.rfq.status}
              invites={detail.invites}
              initialComments={detail.comments}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
