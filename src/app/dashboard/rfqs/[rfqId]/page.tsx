import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RfqActions } from '@/components/rfq-actions';
import { RfqDeleteButton, RfqRestoreButton } from '@/components/rfq-delete-controls';
import { RfqInternalChat } from '@/components/rfq-internal-chat';
import { RfqNotesEditor } from '@/components/rfq-notes-editor';
import { RfqSupplierThreads } from '@/components/rfq-supplier-threads';
import { AttachmentUpload } from '@/components/attachment-upload';
import { RfqAttachmentList } from '@/components/rfq-attachment-list';
import { RfqDirectDetailsCard } from '@/components/rfq-direct-details-card';
import type { Rfq, RfqAttachment, RfqComment, RfqInternalMessage, RfqQuote, Supplier, RfqInvite, RfqStatus } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatSupplierInputAmount } from '@/lib/currency';
import { isVolumelessQuoteFormula } from '@/lib/natuursteen-vos-pricing';
import { buildDashboardBackHref } from '@/lib/dashboard-back-link';

interface PageProps {
  params: Promise<{ rfqId: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
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

// Vos-chain, Sanne Juk and no-transport (Jardinico) quotes store no supplier volume (volume_m3 = 0).
function hasSupplierVolume(quote: RfqQuote | undefined) {
  return Boolean(quote) && !isVolumelessQuoteFormula(quote?.pricing_formula_version) && Number(quote?.volume_m3) > 0;
}

// Automatic (Sanne Vos) quotes have no supplier input; their base_price is the
// calculated purchase price, shown like any other supplier's base price.
function supplierBasePriceLabel(quote: RfqQuote | undefined) {
  if (!quote) return '-';
  if (quote.supplier_input_currency && quote.supplier_input_currency !== 'EUR' && quote.supplier_input_price) {
    return formatSupplierInputAmount(quote.supplier_input_price, quote.supplier_input_currency);
  }
  return formatEuro(quote.base_price);
}

export default async function RfqDetailPage({ params, searchParams }: PageProps) {
  const user = await requireAuth();
  const { rfqId } = await params;
  const backHref = buildDashboardBackHref((await searchParams)?.from);
  const supabase = await createClient();

  const { data: rfq, error } = await supabase
    .from('rfqs')
    .select('*')
    .eq('id', rfqId)
    .single();

  if (error || !rfq) notFound();
  // Soft-deleted requests are only reachable for admins (to restore them).
  if (rfq.deleted_at && user.role !== 'admin') notFound();

  const [
    { data: attachments },
    { data: invites },
    { data: quotes },
    { data: comments },
    { data: internalMessages, error: internalMessagesError },
    { data: internalRead },
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
    supabase
      .from('rfq_internal_messages')
      .select('*')
      .eq('rfq_id', rfqId)
      .order('created_at', { ascending: true }),
    supabase
      .from('rfq_internal_message_reads')
      .select('last_read_at')
      .eq('rfq_id', rfqId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  if (internalMessagesError) {
    console.error('Failed to fetch internal messages:', internalMessagesError.message);
  }

  const typedRfq = rfq as Rfq;
  const canManageRfq = user.role === 'admin' || user.role === 'sales';
  const typedInternalMessages = (internalMessages as RfqInternalMessage[]) ?? [];
  const typedComments = (comments as RfqComment[]) ?? [];
  const typedAttachments = (attachments as RfqAttachment[]) ?? [];
  const lastInternalReadAt = internalRead?.last_read_at ? new Date(internalRead.last_read_at) : null;
  const unreadInternalCount = typedInternalMessages.filter(
    (message) =>
      message.author_id !== user.id && (!lastInternalReadAt || new Date(message.created_at) > lastInternalReadAt)
  ).length;
  const canDeleteRfq = user.role === 'admin' || typedRfq.created_by === user.id;
  const isDeleted = Boolean(typedRfq.deleted_at);
  const requestTitle = [typedRfq.product_type, typedRfq.material, typedRfq.shape].filter(Boolean).join(' - ');
  const status = statusLabels[typedRfq.status] ?? {
    label: typedRfq.status,
    color: 'bg-muted text-muted-foreground',
  };
  const typedQuotes = (quotes as (RfqQuote & { supplier: Supplier })[]) ?? [];
  const typedInvites = (invites as (RfqInvite & { supplier: Supplier | null })[]) ?? [];
  const bestQuote = typedQuotes[0];
  const supplierSummary = bestQuote?.supplier?.name ?? typedInvites[0]?.supplier?.name ?? '-';
  const quoteVolumeLabel =
    bestQuote && hasSupplierVolume(bestQuote) && bestQuote.volume_m3
      ? `${parseFloat(Number(bestQuote.volume_m3).toFixed(3))} m³`
      : null;
  // Own fabric: the fabric cost Sempre adds to the supplier's price before margin and multiplier.
  const quoteFabricLabel =
    bestQuote && bestQuote.fabric_cost_eur && Number(bestQuote.fabric_cost_eur) > 0
      ? `+ ${formatEuro(bestQuote.fabric_cost_eur)} fabric (${Number(bestQuote.fabric_meters ?? 0).toFixed(2)} m × ${formatEuro(bestQuote.fabric_price_per_meter_eur)}${typedRfq.own_fabric ? `, ${typedRfq.own_fabric}` : ''})`
      : null;

  return (
    <div className="space-y-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to requests
      </Link>

      {isDeleted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <span>
            This request was deleted on {new Date(typedRfq.deleted_at as string).toLocaleDateString('en-GB')} and is
            hidden from all lists.
          </span>
          <RfqRestoreButton rfqId={rfqId} />
        </div>
      )}

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
              Customer · <span className="font-semibold text-foreground/80">{typedRfq.customer_name || '-'}</span>
              {' | '}Created {new Date(typedRfq.created_at).toLocaleDateString('en-GB')}
              {typedRfq.sent_at && ` | Sent ${new Date(typedRfq.sent_at).toLocaleDateString('en-GB')}`}
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
            {canDeleteRfq && !isDeleted && <RfqDeleteButton rfqId={rfqId} />}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sempre-metric-card-primary">
          <div className="sempre-label text-primary">Retail price</div>
          <div className="sempre-metric-value text-primary">{formatEuro(bestQuote?.final_price_calculated)}</div>
          <div className="mt-1 text-xs text-primary/80">Customer price incl. margin & transport</div>
        </div>
        <div className="sempre-metric-card">
          <div className="sempre-label">Supplier base price</div>
          <div className="sempre-metric-value">{supplierBasePriceLabel(bestQuote)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {bestQuote ? 'Best quote' : 'No quote yet'}
            {quoteVolumeLabel && <> · {quoteVolumeLabel}</>}
            {quoteFabricLabel && <> · {quoteFabricLabel}</>}
          </div>
        </div>
        <div className="sempre-metric-card">
          <div className="sempre-label">Supplier</div>
          <div className="truncate text-[17px] font-bold">{supplierSummary}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {typedInvites.length === 1 ? '1 supplier invited' : `${typedInvites.length} suppliers invited`}
            {' · '}
            {typedQuotes.length === 1 ? '1 quote' : `${typedQuotes.length} quotes`}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="supplier">
            Supplier communication
            {typedComments.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[11px] font-semibold">{typedComments.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="internal">
            Internal chat
            {unreadInternalCount > 0 ? (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {unreadInternalCount} new
              </span>
            ) : (
              typedInternalMessages.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[11px] font-semibold">
                  {typedInternalMessages.length}
                </span>
              )
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <RfqDirectDetailsCard rfq={typedRfq} userRole={user.role} invites={typedInvites} />

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Internal notes</CardTitle>
                  <p className="text-xs text-muted-foreground">For Sempre staff only, never shown to the supplier.</p>
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
                  <CardTitle>Attachments ({typedAttachments.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <RfqAttachmentList
                    rfqId={rfqId}
                    attachments={typedAttachments}
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
          </div>
        </TabsContent>

        <TabsContent value="supplier">
          <RfqSupplierThreads
            key={`rfq-threads-${rfqId}`}
            rfqId={rfqId}
            rfqStatus={typedRfq.status}
            invites={typedInvites}
            initialComments={typedComments}
          />
        </TabsContent>

        <TabsContent value="internal">
          <div className="max-w-3xl">
            <RfqInternalChat
              key={`rfq-internal-chat-${rfqId}`}
              rfqId={rfqId}
              currentUserId={user.id}
              initialMessages={typedInternalMessages}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
