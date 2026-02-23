import type { RfqQuote } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SupplierQuoteReadOnlyProps {
  quote: RfqQuote;
}

export function SupplierQuoteReadOnly({ quote }: SupplierQuoteReadOnlyProps) {
  const hasAreaM2 = quote.area_m2 !== null && quote.area_m2 !== undefined;
  const volumeLabel = hasAreaM2 ? 'Volume (m\u00b2)' : 'Volume (m\u00b3)';
  const volumeValue = hasAreaM2
    ? Number(quote.area_m2).toFixed(3)
    : Number(quote.volume_m3).toFixed(3);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your submitted quote</CardTitle>
        <p className="text-sm text-muted-foreground">
          Submitted on{' '}
          {new Date(quote.submitted_at).toLocaleDateString('en-GB', {
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
            <dt className="text-xs uppercase text-muted-foreground">Base price</dt>
            <dd className="mt-1 text-sm font-medium">{`\u20ac${Number(quote.base_price).toFixed(2)}`}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">{volumeLabel}</dt>
            <dd className="mt-1 text-sm font-medium">{volumeValue}</dd>
          </div>
          {quote.lead_time_days && (
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Lead time</dt>
              <dd className="mt-1 text-sm font-medium">{quote.lead_time_days} days</dd>
            </div>
          )}
          {quote.comment && (
            <div className="col-span-2">
              <dt className="text-xs uppercase text-muted-foreground">Comment</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm">{quote.comment}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
