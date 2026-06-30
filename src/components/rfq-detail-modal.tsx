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
import { QuoteComparison } from '@/components/quote-comparison';
import { RfqDetailsOverview } from '@/components/rfq-details-overview';
import { RfqActions } from '@/components/rfq-actions';
import {
  isRoundShape,
  isTablesProductType,
} from '@/lib/rfq-format';
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
  supplier_replied: { label: 'Supplier replied', color: 'bg-chart-2/15 text-chart-2' },
  waiting_for_technical_drawing: { label: 'Waiting for technical drawing', color: 'bg-chart-4/15 text-chart-4' },
  quotes_received: { label: 'Quotes received', color: 'bg-chart-2/15 text-chart-2' },
  sent_to_pricing_crm: { label: 'Sent to pricing (CRM)', color: 'bg-chart-4/15 text-chart-4' },
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
    model: '',
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
  const canEditRfqDetails =
    canManageRfq && (detail?.rfq.status === 'draft' || detail?.rfq.status === 'sent_to_pricing');
  const isRound = detail ? isRoundShape(detail.rfq.shape) : false;
  const isTablesType = isTablesProductType(detail?.rfq.product_type);

  useEffect(() => {
    if (!detail || detailsEditing) {
      return;
    }

    setDetailsForm({
      model: detail.rfq.model || '',
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
      model: detail.rfq.model || '',
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
      model: detail.rfq.model || '',
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
    const normalizedModel = detailsForm.model.trim();
    const currentModel = (detail.rfq.model ?? '').trim();

    const updateInput: {
      model?: string | null;
      length?: number;
      width?: number;
      height?: number;
      thickness?: number;
    } = {};

    if (isTablesType && normalizedModel !== currentModel) {
      updateInput.model = normalizedModel.length > 0 ? normalizedModel : null;
    }
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
  }, [
    detail,
    detailsForm.height,
    detailsForm.length,
    detailsForm.model,
    detailsForm.thickness,
    detailsForm.width,
    isRound,
    isTablesType,
    router,
  ]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeModal();
        }
      }}
    >
      <DialogContent className="max-h-[92vh] w-[96vw] overflow-y-auto sm:max-w-none xl:max-w-[1400px]">
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
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <RfqDetailsOverview rfq={detail.rfq} invites={detail.invites} status={status ?? undefined} />
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 xl:max-w-[220px] xl:justify-end">
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
                <RfqActions
                  rfqId={detail.rfq.id}
                  status={detail.rfq.status}
                  productType={detail.rfq.product_type}
                  materialId={detail.rfq.material_id}
                  materialIdTableTop={detail.rfq.material_id_table_top}
                  materialIdTableFoot={detail.rfq.material_id_table_foot}
                  hidePricingTeamButton
                />
                {pricingTeamResult && (
                  <span className="min-w-0 shrink text-sm text-muted-foreground">{pricingTeamResult}</span>
                )}
              </div>
            </div>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>Edit details</CardTitle>
                  {canEditRfqDetails && !detailsEditing && (
                    <Button type="button" variant="outline" size="sm" onClick={startDetailsEdit}>
                      Edit
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {detailsEditing && canEditRfqDetails ? (
                  <div className="rounded-md border p-3">
                    <div className={`grid gap-3 ${isRound ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
                      {isTablesType && (
                        <label className="space-y-1 text-xs uppercase text-muted-foreground sm:col-span-full">
                          <span>Model</span>
                          <Input
                            type="text"
                            value={detailsForm.model}
                            onChange={(event) =>
                              setDetailsForm((current) => ({ ...current, model: event.target.value }))
                            }
                            disabled={detailsSaving}
                          />
                        </label>
                      )}
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
                        <span>Thickness top (cm)</span>
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
                ) : (
                  <p className="text-sm text-muted-foreground">Open edit mode to adjust dimensions or model before sending to suppliers.</p>
                )}
                {!detailsEditing && detailsResult && (
                  <p className="mt-3 text-sm text-muted-foreground">{detailsResult}</p>
                )}
                {!detailsEditing && detailsError && (
                  <p className="mt-3 text-sm text-destructive">{detailsError}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <RfqNotesEditor
                  key={`rfq-notes-${detail.rfq.id}`}
                  rfqId={detail.rfq.id}
                  initialNotes={detail.rfq.notes}
                  disabled={detail.rfq.status === 'closed'}
                />
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
                  canDelete={canManageRfq && detail.rfq.status !== 'closed'}
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
