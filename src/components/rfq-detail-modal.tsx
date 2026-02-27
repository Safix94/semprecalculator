'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getRfqDetail, sendToPricingTeam, updateRfqDetails } from '@/actions/rfq';
import { AttachmentUpload } from '@/components/attachment-upload';
import { RfqAttachmentList } from '@/components/rfq-attachment-list';
import { RfqNotesEditor } from '@/components/rfq-notes-editor';
import { RfqSupplierThreads } from '@/components/rfq-supplier-threads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import type { Rfq, RfqAttachment, RfqComment, RfqInvite, RfqQuote, RfqStatus, Supplier, UserRole } from '@/types';

interface RfqDetailModalProps {
  rfqId: string | null;
  refreshToken: string;
  userRole: UserRole;
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

export function RfqDetailModal({ rfqId, refreshToken, userRole }: RfqDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<RfqDetailData | null>(null);
  const [pricingTeamLoading, setPricingTeamLoading] = useState(false);
  const [pricingTeamResult, setPricingTeamResult] = useState<string | null>(null);
  const [detailsEditing, setDetailsEditing] = useState(false);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsResult, setDetailsResult] = useState<string | null>(null);
  const [detailsForm, setDetailsForm] = useState({
    length: '',
    width: '',
    height: '',
    thickness: '',
  });
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
      setDetailsEditing(false);
      setDetailsError(null);
      setDetailsResult(null);
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

  const canManageRfq = userRole === 'admin' || userRole === 'sales';
  const isRound = detail ? isRoundShape(detail.rfq.shape) : false;
  const isTablesType = detail?.rfq.product_type === 'Tables';

  useEffect(() => {
    if (!detail || detailsEditing) {
      return;
    }

    setDetailsForm({
      length: String(detail.rfq.length),
      width: String(detail.rfq.width),
      height: String(detail.rfq.height),
      thickness: String(detail.rfq.thickness),
    });
  }, [detail, detailsEditing]);

  const parseActionError = (actionError: unknown): string => {
    if (typeof actionError === 'string') {
      return actionError;
    }

    if (actionError && typeof actionError === 'object') {
      const firstFieldError = Object.values(actionError as Record<string, unknown>)
        .flatMap((value) => (Array.isArray(value) ? value : []))
        .find((value): value is string => typeof value === 'string');

      if (firstFieldError) {
        return firstFieldError;
      }
    }

    return 'Could not update RFQ details';
  };

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

  const startDetailsEdit = useCallback(() => {
    if (!detail) {
      return;
    }

    setDetailsForm({
      length: String(detail.rfq.length),
      width: String(detail.rfq.width),
      height: String(detail.rfq.height),
      thickness: String(detail.rfq.thickness),
    });
    setDetailsError(null);
    setDetailsResult(null);
    setDetailsEditing(true);
  }, [detail]);

  const cancelDetailsEdit = useCallback(() => {
    if (!detail) {
      return;
    }

    setDetailsForm({
      length: String(detail.rfq.length),
      width: String(detail.rfq.width),
      height: String(detail.rfq.height),
      thickness: String(detail.rfq.thickness),
    });
    setDetailsError(null);
    setDetailsResult(null);
    setDetailsEditing(false);
  }, [detail]);

  const handleDetailsSave = useCallback(async () => {
    if (!detail) {
      return;
    }

    const parsedLength = Number.parseFloat(detailsForm.length);
    const parsedWidth = Number.parseFloat(detailsForm.width);
    const parsedHeight = Number.parseFloat(detailsForm.height);
    const parsedThickness = Number.parseFloat(detailsForm.thickness);

    const updateInput: {
      length?: number;
      width?: number;
      height?: number;
      thickness?: number;
    } = {};

    if (!Number.isNaN(parsedLength) && parsedLength !== detail.rfq.length) {
      updateInput.length = parsedLength;
    }
    if (!isRound && !Number.isNaN(parsedWidth) && parsedWidth !== detail.rfq.width) {
      updateInput.width = parsedWidth;
    }
    if (!Number.isNaN(parsedHeight) && parsedHeight !== detail.rfq.height) {
      updateInput.height = parsedHeight;
    }
    if (!Number.isNaN(parsedThickness) && parsedThickness !== detail.rfq.thickness) {
      updateInput.thickness = parsedThickness;
    }

    if (Object.keys(updateInput).length === 0) {
      setDetailsResult('No changes to save.');
      setDetailsError(null);
      setDetailsEditing(false);
      return;
    }

    setDetailsSaving(true);
    setDetailsError(null);
    setDetailsResult(null);

    try {
      const result = await updateRfqDetails(detail.rfq.id, updateInput);
      if ('error' in result) {
        setDetailsError(parseActionError(result.error));
        return;
      }

      setDetail((currentDetail) => {
        if (!currentDetail) {
          return currentDetail;
        }

        return {
          ...currentDetail,
          rfq: result.data,
        };
      });
      setDetailsEditing(false);
      setDetailsResult('Details saved.');
      router.refresh();
    } catch (saveError) {
      console.error('Failed to update RFQ details:', saveError);
      setDetailsError('Could not update RFQ details.');
    } finally {
      setDetailsSaving(false);
    }
  }, [detail, detailsForm.height, detailsForm.length, detailsForm.thickness, detailsForm.width, isRound, router]);

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
                    productType={detail.rfq.product_type}
                    materialId={detail.rfq.material_id}
                    materialIdTableTop={detail.rfq.material_id_table_top}
                    materialIdTableFoot={detail.rfq.material_id_table_foot}
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>Details</CardTitle>
                  {canManageRfq && !detailsEditing && (
                    <Button type="button" variant="outline" size="sm" onClick={startDetailsEdit}>
                      Edit
                    </Button>
                  )}
                </div>
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
                  {!detailsEditing && (
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">
                      {isRound ? 'Dimensions (Ø x H)' : 'Dimensions (LxWxH)'}
                    </dt>
                    <dd className="mt-1 text-sm font-medium">
                      {formatRfqDimensionsWithOptions(detail.rfq, { includeThickness: false })}
                    </dd>
                  </div>
                  )}
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Quantity</dt>
                    <dd className="mt-1 text-sm font-medium">{detail.rfq.quantity}</dd>
                  </div>
                  {!detailsEditing && (!isRound || detail.rfq.thickness > 0 || canManageRfq) && (
                    <div>
                      <dt className="text-xs uppercase text-muted-foreground">Thickness</dt>
                      <dd className="mt-1 text-sm font-medium">{detail.rfq.thickness} cm</dd>
                    </div>
                  )}
                  {detailsEditing && canManageRfq && (
                    <div className="col-span-2 rounded-md border p-3 md:col-span-4">
                      <p className="mb-3 text-xs uppercase text-muted-foreground">Edit dimensions and thickness</p>
                      <div className={`grid gap-3 ${isRound ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
                        <label className="space-y-1 text-xs uppercase text-muted-foreground">
                          <span>{isRound ? 'Diameter (cm)' : 'Length (cm)'}</span>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={detailsForm.length}
                            onChange={(event) =>
                              setDetailsForm((current) => ({ ...current, length: event.target.value }))
                            }
                            disabled={detailsSaving}
                          />
                        </label>
                        {!isRound && (
                          <label className="space-y-1 text-xs uppercase text-muted-foreground">
                            <span>Width (cm)</span>
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={detailsForm.width}
                              onChange={(event) =>
                                setDetailsForm((current) => ({ ...current, width: event.target.value }))
                              }
                              disabled={detailsSaving}
                            />
                          </label>
                        )}
                        <label className="space-y-1 text-xs uppercase text-muted-foreground">
                          <span>Height (cm)</span>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={detailsForm.height}
                            onChange={(event) =>
                              setDetailsForm((current) => ({ ...current, height: event.target.value }))
                            }
                            disabled={detailsSaving}
                          />
                        </label>
                        <label className="space-y-1 text-xs uppercase text-muted-foreground">
                          <span>Thickness (cm)</span>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={detailsForm.thickness}
                            onChange={(event) =>
                              setDetailsForm((current) => ({ ...current, thickness: event.target.value }))
                            }
                            disabled={detailsSaving}
                          />
                        </label>
                      </div>
                      {detailsError && <p className="mt-3 text-sm text-destructive">{detailsError}</p>}
                      {detailsResult && <p className="mt-3 text-sm text-muted-foreground">{detailsResult}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button type="button" size="sm" onClick={handleDetailsSave} disabled={detailsSaving}>
                          {detailsSaving ? 'Saving...' : 'Save details'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={cancelDetailsEdit}
                          disabled={detailsSaving}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </dl>

                {!detailsEditing && detailsResult && (
                  <p className="mt-3 text-sm text-muted-foreground">{detailsResult}</p>
                )}
                {!detailsEditing && detailsError && (
                  <p className="mt-3 text-sm text-destructive">{detailsError}</p>
                )}

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
                <RfqAttachmentList
                  rfqId={detail.rfq.id}
                  attachments={detail.attachments}
                  canOpen={canManageRfq}
                />

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
