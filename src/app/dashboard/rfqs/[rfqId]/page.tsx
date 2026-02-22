import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RfqActions } from '@/components/rfq-actions';
import { QuoteComparison } from '@/components/quote-comparison';
import { AttachmentUpload } from '@/components/attachment-upload';
import type { Rfq, RfqAttachment, RfqQuote, Supplier, RfqInvite } from '@/types';

interface PageProps {
  params: Promise<{ rfqId: string }>;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'Concept', color: 'bg-gray-100 text-gray-700' },
  sent: { label: 'Verzonden', color: 'bg-blue-100 text-blue-700' },
  closed: { label: 'Gesloten', color: 'bg-green-100 text-green-700' },
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{typedRfq.material} - {typedRfq.shape}</h1>
          <p className="text-sm text-gray-500 mt-1">
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

      {/* RFQ Details */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Details</h2>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <dt className="text-xs text-gray-500 uppercase">Materiaal</dt>
            <dd className="text-sm font-medium mt-1">{typedRfq.material}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 uppercase">Vorm</dt>
            <dd className="text-sm font-medium mt-1">{typedRfq.shape}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 uppercase">Klant</dt>
            <dd className="text-sm font-medium mt-1">{typedRfq.customer_name || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 uppercase">Afmetingen (LxBxH)</dt>
            <dd className="text-sm font-medium mt-1">
              {typedRfq.length} x {typedRfq.width} x {typedRfq.height} mm
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 uppercase">Dikte</dt>
            <dd className="text-sm font-medium mt-1">{typedRfq.thickness} mm</dd>
          </div>
          {typedRfq.notes && (
            <div className="col-span-2 md:col-span-3">
              <dt className="text-xs text-gray-500 uppercase">Opmerkingen</dt>
              <dd className="text-sm mt-1 whitespace-pre-wrap">{typedRfq.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Attachments */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Bijlagen</h2>
        {attachments && attachments.length > 0 ? (
          <ul className="space-y-2">
            {(attachments as RfqAttachment[]).map((att) => (
              <li key={att.id} className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">📎</span>
                <span>{att.file_name}</span>
                <span className="text-xs text-gray-400">({att.mime_type})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Geen bijlagen.</p>
        )}
        {typedRfq.status === 'draft' && (
          <div className="mt-4">
            <AttachmentUpload rfqId={rfqId} />
          </div>
        )}
      </div>

      {/* Quote Comparison */}
      {typedRfq.status !== 'draft' && (
        <QuoteComparison
          invites={(invites as (RfqInvite & { supplier: Supplier })[]) ?? []}
          quotes={(quotes as (RfqQuote & { supplier: Supplier })[]) ?? []}
        />
      )}
    </div>
  );
}
