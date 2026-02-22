import type { RfqQuote } from '@/types';

interface SupplierQuoteReadOnlyProps {
  quote: RfqQuote;
}

export function SupplierQuoteReadOnly({ quote }: SupplierQuoteReadOnlyProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Uw ingediende offerte</h2>
      <p className="text-sm text-gray-500 mb-4">
        Ingediend op {new Date(quote.submitted_at).toLocaleDateString('nl-NL', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>

      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs text-gray-500 uppercase">Basisprijs</dt>
          <dd className="text-sm font-medium mt-1">€{Number(quote.base_price).toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500 uppercase">Volume</dt>
          <dd className="text-sm font-medium mt-1">{Number(quote.volume_m3).toFixed(3)} m³</dd>
        </div>
        {quote.lead_time_days && (
          <div>
            <dt className="text-xs text-gray-500 uppercase">Levertijd</dt>
            <dd className="text-sm font-medium mt-1">{quote.lead_time_days} dagen</dd>
          </div>
        )}
        {quote.comment && (
          <div className="col-span-2">
            <dt className="text-xs text-gray-500 uppercase">Opmerking</dt>
            <dd className="text-sm mt-1 whitespace-pre-wrap">{quote.comment}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
