import type { RfqQuote } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SupplierQuoteReadOnlyProps {
  quote: RfqQuote;
}

export function SupplierQuoteReadOnly({ quote }: SupplierQuoteReadOnlyProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Uw ingediende offerte</CardTitle>
        <p className="text-sm text-muted-foreground">
          Ingediend op {new Date(quote.submitted_at).toLocaleDateString('nl-NL', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-muted-foreground uppercase">Basisprijs</dt>
            <dd className="text-sm font-medium mt-1">€{Number(quote.base_price).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground uppercase">Volume</dt>
            <dd className="text-sm font-medium mt-1">{Number(quote.volume_m3).toFixed(3)} m³</dd>
          </div>
          {quote.lead_time_days && (
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Levertijd</dt>
              <dd className="text-sm font-medium mt-1">{quote.lead_time_days} dagen</dd>
            </div>
          )}
          {quote.comment && (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground uppercase">Opmerking</dt>
              <dd className="text-sm mt-1 whitespace-pre-wrap">{quote.comment}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
