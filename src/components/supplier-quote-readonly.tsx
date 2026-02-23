import type { RfqQuote } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SupplierQuoteReadOnlyProps {
  quote: RfqQuote;
}

export function SupplierQuoteReadOnly({ quote }: SupplierQuoteReadOnlyProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your submitted quote</CardTitle>
        <p className="text-sm text-muted-foreground">
          Submitted on {new Date(quote.submitted_at).toLocaleDateString('en-GB', {
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
            <dt className="text-xs text-muted-foreground uppercase">Base price</dt>
            <dd className="text-sm font-medium mt-1">€{Number(quote.base_price).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground uppercase">Volume</dt>
            <dd className="text-sm font-medium mt-1">{Number(quote.volume_m3).toFixed(3)} m³</dd>
          </div>
          {quote.lead_time_days && (
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Lead time</dt>
              <dd className="text-sm font-medium mt-1">{quote.lead_time_days} days</dd>
            </div>
          )}
          {quote.comment && (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground uppercase">Comment</dt>
              <dd className="text-sm mt-1 whitespace-pre-wrap">{quote.comment}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
