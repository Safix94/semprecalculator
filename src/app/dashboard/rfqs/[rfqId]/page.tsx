import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RfqActions } from '@/components/rfq-actions';
import { RfqNotesEditor } from '@/components/rfq-notes-editor';
import { RfqSupplierThreads } from '@/components/rfq-supplier-threads';
import { QuoteComparison } from '@/components/quote-comparison';
import { AttachmentUpload } from '@/components/attachment-upload';
import { formatRfqDimensionsWithOptions, isRoundShape } from '@/lib/rfq-format';
import type { Rfq, RfqAttachment, RfqComment, RfqQuote, Supplier, RfqInvite, RfqStatus } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PageProps {
  params: Promise<{ rfqId: string }>;
}

const statusLabels: Record<RfqStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-secondary text-secondary-foreground' },
  sent_to_pricing: { label: 'Sent to pricing', color: 'bg-chart-4/15 text-chart-4' },
  sent_to_supplier: { label: 'Sent to supplier', color: 'bg-primary/15 text-primary' },
  waiting_for_technical_drawing: { label: 'Waiting for technical drawing', color: 'bg-chart-4/15 text-chart-4' },
  quotes_received: { label: 'Supplier replied', color: 'bg-chart-2/15 text-chart-2' },
  closed: { label: 'Closed', color: 'bg-accent text-accent-foreground' },
};

export default async function RfqDetailPage({ params }: PageProps) {
  await requireAuth();
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
  const isRound = isRoundShape(typedRfq.shape);
  const isTablesType = typedRfq.product_type === 'Tables';
  const status = statusLabels[typedRfq.status] ?? {
    label: typedRfq.status,
    color: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {typedRfq.material} - {typedRfq.shape}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Created on {new Date(typedRfq.created_at).toLocaleDateString('en-GB')}
            {typedRfq.sent_at && ` | Sent on ${new Date(typedRfq.sent_at).toLocaleDateString('en-GB')}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${status.color}`}>
            {status.label}
          </span>
          <RfqActions rfqId={rfqId} status={typedRfq.status} materialId={typedRfq.material_id} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {!isTablesType && (
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Material</dt>
                <dd className="mt-1 text-sm font-medium">{typedRfq.material}</dd>
              </div>
            )}
            {isTablesType && typedRfq.material_table_top && (
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Tafelblad</dt>
                <dd className="mt-1 text-sm font-medium">
                  {typedRfq.material_table_top}
                  {typedRfq.finish_table_top ? ` (${typedRfq.finish_table_top})` : ''}
                </dd>
              </div>
            )}
            {isTablesType && typedRfq.material_table_foot && (
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Tafelpoot</dt>
                <dd className="mt-1 text-sm font-medium">
                  {typedRfq.material_table_foot}
                  {typedRfq.finish_table_foot ? ` (${typedRfq.finish_table_foot})` : ''}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Shape</dt>
              <dd className="mt-1 text-sm font-medium">{typedRfq.shape}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Customer</dt>
              <dd className="mt-1 text-sm font-medium">{typedRfq.customer_name || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">
                {isRound ? 'Dimensions (Ø x H)' : 'Dimensions (LxWxH)'}
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {formatRfqDimensionsWithOptions(typedRfq, { includeThickness: false })}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Quantity</dt>
              <dd className="mt-1 text-sm font-medium">{typedRfq.quantity}</dd>
            </div>
            {(!isRound || typedRfq.thickness > 0) && (
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Thickness</dt>
                <dd className="mt-1 text-sm font-medium">{typedRfq.thickness} cm</dd>
              </div>
            )}
          </dl>

          <div className="mt-4 border-t pt-4">
            <h3 className="mb-2 text-xs uppercase text-muted-foreground">Notes</h3>
            <RfqNotesEditor
              key={`rfq-notes-${rfqId}`}
              rfqId={rfqId}
              initialNotes={typedRfq.notes}
              disabled={typedRfq.status === 'closed'}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attachments</CardTitle>
        </CardHeader>
        <CardContent>
          {attachments && attachments.length > 0 ? (
            <ul className="space-y-2">
              {(attachments as RfqAttachment[]).map((att) => (
                <li key={att.id} className="flex items-center gap-2 text-sm">
                  <span>{att.file_name}</span>
                  <span className="text-xs text-muted-foreground">({att.mime_type})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No attachments.</p>
          )}
          {typedRfq.status !== 'closed' && (
            <div className="mt-4">
              <AttachmentUpload rfqId={rfqId} />
            </div>
          )}
        </CardContent>
      </Card>

      {typedRfq.status !== 'draft' && (
        <QuoteComparison
          invites={(invites as (RfqInvite & { supplier: Supplier })[]) ?? []}
          quotes={(quotes as (RfqQuote & { supplier: Supplier })[]) ?? []}
        />
      )}

      <RfqSupplierThreads
        key={`rfq-threads-${rfqId}`}
        rfqId={rfqId}
        rfqStatus={typedRfq.status}
        invites={(invites as (RfqInvite & { supplier: Supplier | null })[]) ?? []}
        initialComments={(comments as RfqComment[]) ?? []}
      />
    </div>
  );
}
