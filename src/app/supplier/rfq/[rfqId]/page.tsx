import { validateSupplierToken } from '@/actions/quote';
import { SupplierQuoteForm } from '@/components/supplier-quote-form';
import { SupplierQuoteReadOnly } from '@/components/supplier-quote-readonly';

interface PageProps {
  params: Promise<{ rfqId: string }>;
  searchParams: Promise<{ t?: string }>;
}

export default async function SupplierRfqPage({ params, searchParams }: PageProps) {
  const { rfqId } = await params;
  const { t: token } = await searchParams;

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">Ongeldige link</h1>
          <p className="text-gray-600">Deze link is ongeldig. Controleer de link in uw e-mail.</p>
        </div>
      </div>
    );
  }

  const result = await validateSupplierToken(rfqId, token);

  if (result.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">Toegang geweigerd</h1>
          <p className="text-gray-600">{result.error}</p>
        </div>
      </div>
    );
  }

  const { rfq, supplier, existingQuote } = result.data!;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">Prijsaanvraag</h1>
            <span className="text-sm text-gray-500">
              {supplier?.name}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-gray-500 uppercase">Materiaal</dt>
              <dd className="text-sm font-medium mt-1">{rfq.material}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 uppercase">Vorm</dt>
              <dd className="text-sm font-medium mt-1">{rfq.shape}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 uppercase">Afmetingen (LxBxH)</dt>
              <dd className="text-sm font-medium mt-1">
                {rfq.length} x {rfq.width} x {rfq.height} mm
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 uppercase">Dikte</dt>
              <dd className="text-sm font-medium mt-1">{rfq.thickness} mm</dd>
            </div>
            {rfq.notes && (
              <div className="col-span-2">
                <dt className="text-xs text-gray-500 uppercase">Opmerkingen</dt>
                <dd className="text-sm mt-1 whitespace-pre-wrap">{rfq.notes}</dd>
              </div>
            )}
          </dl>

          {/* Attachments */}
          {rfq.attachments && rfq.attachments.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h3 className="text-xs text-gray-500 uppercase mb-2">Bijlagen</h3>
              <ul className="space-y-1">
                {rfq.attachments.map((att: { id: string; file_name: string }) => (
                  <li key={att.id} className="text-sm text-blue-600">
                    {att.file_name}
                    {/* TODO: Add download link via getAttachmentUrl */}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Quote form or read-only */}
        {existingQuote ? (
          <SupplierQuoteReadOnly quote={existingQuote} />
        ) : (
          <SupplierQuoteForm rfqId={rfqId} token={token} />
        )}
      </div>
    </div>
  );
}
