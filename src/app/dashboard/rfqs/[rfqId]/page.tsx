import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RfqActions } from '@/components/rfq-actions';
import { QuoteComparison } from '@/components/quote-comparison';
import { AttachmentUpload } from '@/components/attachment-upload';
import type { Rfq, RfqAttachment, RfqQuote, Supplier, RfqInvite } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PageProps {
  params: Promise<{ rfqId: string }>;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'Concept', color: 'bg-secondary text-secondary-foreground' },
  sent: { label: 'Verzonden', color: 'bg-primary/15 text-primary' },
  closed: { label: 'Gesloten', color: 'bg-accent text-accent-foreground' },
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
  ]);

  const typedRfq = rfq as Rfq;
  const status = statusLabels[typedRfq.status] || statusLabels.draft;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {typedRfq.material} - {typedRfq.shape}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aangemaakt op {new Date(typedRfq.created_at).toLocaleDateString('nl-NL')}
            {typedRfq.sent_at && ` | Verzonden op ${new Date(typedRfq.sent_at).toLocaleDateString('nl-NL')}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${status.color}`}>
            {status.label}
          </span>
          <RfqActions rfqId={rfqId} status={typedRfq.status} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Materiaal</dt>
              <dd className="text-sm font-medium mt-1">{typedRfq.material}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Vorm</dt>
              <dd className="text-sm font-medium mt-1">{typedRfq.shape}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Klant</dt>
              <dd className="text-sm font-medium mt-1">{typedRfq.customer_name || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Afmetingen (LxBxH)</dt>
              <dd className="text-sm font-medium mt-1">
                {typedRfq.length} x {typedRfq.width} x {typedRfq.height} mm
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Dikte</dt>
              <dd className="text-sm font-medium mt-1">{typedRfq.thickness} mm</dd>
            </div>
            {typedRfq.notes && (
              <div className="col-span-2 md:col-span-3">
                <dt className="text-xs text-muted-foreground uppercase">Opmerkingen</dt>
                <dd className="text-sm mt-1 whitespace-pre-wrap">{typedRfq.notes}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bijlagen</CardTitle>
        </CardHeader>
        <CardContent>
          {attachments && attachments.length > 0 ? (
            <ul className="space-y-2">
              {(attachments as RfqAttachment[]).map((att) => (
                <li key={att.id} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">📎</span>
                  <span>{att.file_name}</span>
                  <span className="text-xs text-muted-foreground">({att.mime_type})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Geen bijlagen.</p>
          )}
          {typedRfq.status === 'draft' && (
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
    </div>
  );
}
