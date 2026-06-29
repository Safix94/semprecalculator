import { getSupplierTranslations, normalizeSupplierLanguage, SUPPLIER_LANGUAGE_LOCALES } from '@/lib/supplier-language';
import { formatIdrAmount } from '@/lib/currency';
import type { RfqQuote, SupplierLanguage } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SupplierQuoteReadOnlyProps {
  quote: RfqQuote;
  language: SupplierLanguage;
}

export function SupplierQuoteReadOnly({ quote, language }: SupplierQuoteReadOnlyProps) {
  const normalizedLanguage = normalizeSupplierLanguage(language);
  const t = getSupplierTranslations(normalizedLanguage);
  const volumeValue = Number(quote.volume_m3).toFixed(3);
  const isIdrQuote = quote.supplier_input_currency === 'IDR' && quote.supplier_input_price;
  const submittedBasePrice = isIdrQuote
    ? formatIdrAmount(quote.supplier_input_price)
    : `€${Number(quote.base_price).toFixed(2)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.yourSubmittedQuote}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t.submittedOn}{' '}
          {new Date(quote.submitted_at).toLocaleDateString(SUPPLIER_LANGUAGE_LOCALES[normalizedLanguage], {
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
            <dt className="text-xs uppercase text-muted-foreground">{t.basePrice}</dt>
            <dd className="mt-1 text-sm font-medium">{submittedBasePrice}</dd>
            {isIdrQuote && (
              <dd className="mt-1 text-xs text-muted-foreground">
                Converted: €{Number(quote.base_price).toFixed(2)}
              </dd>
            )}
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">{t.volumeM3}</dt>
            <dd className="mt-1 text-sm font-medium">{volumeValue}</dd>
          </div>
          {quote.lead_time_days && (
            <div>
              <dt className="text-xs uppercase text-muted-foreground">{t.leadTime}</dt>
              <dd className="mt-1 text-sm font-medium">{quote.lead_time_days} {t.days}</dd>
            </div>
          )}
          {quote.comment && (
            <div className="col-span-2">
              <dt className="text-xs uppercase text-muted-foreground">{t.comment}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm">{quote.comment}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
