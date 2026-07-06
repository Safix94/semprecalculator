import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RfqActions } from '@/components/rfq-actions';
import { RfqNotesEditor } from '@/components/rfq-notes-editor';
import { RfqSupplierThreads } from '@/components/rfq-supplier-threads';
import { QuoteComparison } from '@/components/quote-comparison';
import { AttachmentUpload } from '@/components/attachment-upload';
import { RfqAttachmentList } from '@/components/rfq-attachment-list';
import { RfqDirectDetailsCard } from '@/components/rfq-direct-details-card';
import type { Rfq, RfqAttachment, RfqComment, RfqQuote, Supplier, RfqInvite, RfqStatus } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatSupplierInputAmount } from '@/lib/currency';

interface PageProps {
  params: Promise<{ rfqId: string }>;
}

const statusLabels: Record<RfqStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-secondary text-secondary-foreground' },
  sent_to_pricing: { label: 'Sent to pricing', color: 'bg-chart-4/15 text-chart-4' },
  sent_to_supplier: { label: 'Sent to supplier', color: 'bg-chart-2/15 text-chart-2' },
  supplier_replied: { label: 'Supplier replied', color: 'bg-chart-2/15 text-chart-2' },
  waiting_for_technical_drawing: { label: 'Waiting for technical drawing', color: 'bg-chart-4/15 text-chart-4' },
  quotes_received: { label: 'Quotes received', color: 'bg-primary/15 text-primary' },
  sent_to_pricing_crm: { label: 'Sent to pricing (CRM)', color: 'bg-chart-4/15 text-chart-4' },
  closed: { label: 'Closed', color: 'bg-muted text-muted-foreground' },
};

function formatEuro(value: number | string | null | undefined) {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(Number(value));
}

function isAutomaticQuote(quote: RfqQuote | undefined) {
  return quote?.pricing_formula_version === 'sanne_vos_bluestone_v1';
}

function supplierBasePriceLabel(quote: RfqQuote | undefined) {
  if (!quote) return '-';
  if (isAutomaticQuote(quote)) return 'Automatic';
  if (quote.supplier_input_currency && quote.supplier_input_currency !== 'EUR' && quote.supplier_input_price) {
    return formatSupplierInputAmount(quote.supplier_input_price, quote.supplier_input_currency);
  }
  return formatEuro(quote.base_price);
}

export default async function RfqDetailPage({ params }: PageProps) {
  const user = await requireAuth();
  const { rfqId } = await params;
  const supabase = await createClient();

  const { data: rfq, error } = await supabase
    .from('rfqs')
    .select('*')
    .eq('id', rfqId)
    .single();

  if (error || !rfq) notFound();

  const [
    { data: attachments },
    { data: invites },
    { data: quotes },
    { data: comments },
  ] = await Promise.all([
    supabase
      .from('rfq_attachments')
      .select('*')
      .eq('rfq_id', rfqId)
      .order('created_at'),
    supabase
      .from('rfq_invites')
      .select('*, supplier:suppliers(*)')
      .eq('rfq_id', rfqId)
      .order('created_at'),
    supabase
      .from('rfq_quotes')
      .select('*, supplier:suppliers(*)')
      .eq('rfq_id', rfqId)
      .order('final_price_calculated', { ascending: true }),
    supabase
      .from('rfq_comments')
      .select('*')
      .eq('rfq_id', rfqId)
      .order('created_at', { ascending: true }),
  ]);

  const typedRfq = rfq as Rfq;
  const canManageRfq = user.role === 'admin' || user.role === 'sales';
  const requestTitle = [typedRfq.product_type, typedRfq.material, typedRfq.shape].filter(Boolean).join(' - ');
  const status = statusLabels[typedRfq.status] ?? {
    label: typedRfq.status,
    color: 'bg-muted text-muted-foreground',
  };
  const typedQuotes = (quotes as (RfqQuote & { supplier: Supplier })[]) ?? [];
  const typedInvites = (invites as (RfqInvite & { supplier: Supplier | null })[]) ?? [];
  const bestQuote = typedQuotes[0];
  const supplierSummary = bestQuote?.supplier?.name ?? typedInvites[0]?.supplier?.name ?? '-';
  const leadTimeSummary = bestQuote?.lead_time_days ? `${bestQuote.lead_time_days} dagen` : '-';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="sempre-page-title truncate">
                {requestTitle}
              </h1>
              <span className="rounded-md border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                RFQ-{typedRfq.id.slice(0, 8)}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Klant · <span className="font-semibold text-foreground/80">{typedRfq.customer_name || '-'}</span>
              {' | '}Aangemaakt {new Date(typedRfq.created_at).toLocaleDateString('nl-BE')}
              {typedRfq.sent_at && ` | Verzonden ${new Date(typedRfq.sent_at).toLocaleDateString('nl-BE')}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-7 items-center gap-2 rounded-full px-3 text-[12.5px] font-semibold ${status.color}`}>
              <span className="size-1.5 rounded-full bg-current" />
              {status.label}
            </span>
            <RfqActions
              rfqId={rfqId}
              status={typedRfq.status}
              productType={typedRfq.product_type}
              materialId={typedRfq.material_id}
              materialIdTableTop={typedRfq.material_id_table_top}
              materialIdTableFoot={typedRfq.material_id_table_foot}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="sempre-metric-card-primary">
          <div className="sempre-label text-primary">Retail price</div>
          <div className="sempre-metric-value text-primary">{formatEuro(bestQuote?.final_price_calculated)}</div>
          <div className="mt-1 text-xs text-primary/80">Klantprijs incl. marge & transport</div>
        </div>
        <div className="sempre-metric-card">
          <div className="sempre-label">Supplier basisprijs</div>
          <div className="sempre-metric-value">{supplierBasePriceLabel(bestQuote)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Beste offerte · {supplierSummary}</div>
        </div>
        <div className="sempre-metric-card">
          <div className="sempre-label">Levertijd</div>
          <div className="sempre-metric-value">{leadTimeSummary}</div>
          <div className="mt-1 text-xs text-muted-foreground">Gebaseerd op goedkoopste/actieve offerte</div>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <RfqDirectDetailsCard
            rfq={typedRfq}
            userRole={user.role}
            invites={typedInvites}
          />

          <Card>
            <CardHeader>
              <CardTitle>Notities</CardTitle>
            </CardHeader>
            <CardContent>
              <RfqNotesEditor
                key={`rfq-notes-${rfqId}`}
                rfqId={rfqId}
                initialNotes={typedRfq.notes}
                disabled={typedRfq.status === 'closed'}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bijlagen</CardTitle>
            </CardHeader>
            <CardContent>
              <RfqAttachmentList
                rfqId={rfqId}
                attachments={(attachments as RfqAttachment[]) ?? []}
                canOpen={canManageRfq}
                canDelete={canManageRfq && typedRfq.status !== 'closed'}
              />
              {typedRfq.status !== 'closed' && (
                <div className="mt-4">
                  <AttachmentUpload rfqId={rfqId} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {typedRfq.status !== 'draft' && (
            <QuoteComparison
              invites={typedInvites as (RfqInvite & { supplier: Supplier })[]}
              quotes={typedQuotes}
            />
          )}

          <RfqSupplierThreads
            key={`rfq-threads-${rfqId}`}
            rfqId={rfqId}
            rfqStatus={typedRfq.status}
            invites={typedInvites}
            initialComments={(comments as RfqComment[]) ?? []}
          />
        </div>
      </div>
    </div>
  );
}
