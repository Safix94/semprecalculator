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

interface PageProps {
  params: Promise<{ rfqId: string }>;
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {requestTitle}
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

      <RfqDirectDetailsCard rfq={typedRfq} userRole={user.role} />

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
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
          <CardTitle>Attachments</CardTitle>
        </CardHeader>
        <CardContent>
          <RfqAttachmentList
            rfqId={rfqId}
            attachments={(attachments as RfqAttachment[]) ?? []}
            canOpen={canManageRfq}
          />
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
