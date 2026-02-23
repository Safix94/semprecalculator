import { validateSupplierToken } from '@/actions/quote';
import { SupplierQuoteForm } from '@/components/supplier-quote-form';
import { SupplierQuoteReadOnly } from '@/components/supplier-quote-readonly';
import { formatRfqDimensionsWithOptions, isRoundShape } from '@/lib/rfq-format';
import { Card, CardContent } from '@/components/ui/card';

interface PageProps {
  params: Promise<{ rfqId: string }>;
  searchParams: Promise<{ t?: string }>;
}

export default async function SupplierRfqPage({ params, searchParams }: PageProps) {
  const { rfqId } = await params;
  const { t: token } = await searchParams;

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="mb-2 text-xl font-bold text-destructive">Invalid link</h1>
            <p className="text-muted-foreground">This link is invalid. Check the link in your email.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const result = await validateSupplierToken(rfqId, token);

  if (result.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="mb-2 text-xl font-bold text-destructive">Access denied</h1>
            <p className="text-muted-foreground">{result.error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { rfq, supplier, existingQuote } = result.data!;
  const isRound = isRoundShape(rfq.shape);

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="mx-auto max-w-2xl px-4">
        <Card className="mb-6">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">Request for quotation</h1>
              <span className="text-sm text-muted-foreground">{supplier?.name}</span>
            </div>

            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Material</dt>
                <dd className="mt-1 text-sm font-medium">{rfq.material}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Shape</dt>
                <dd className="mt-1 text-sm font-medium">{rfq.shape}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">
                  {isRound ? 'Dimensions (Ø x H)' : 'Dimensions (LxWxH)'}
                </dt>
                <dd className="mt-1 text-sm font-medium">
                  {formatRfqDimensionsWithOptions(rfq, { includeThickness: false })}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Quantity</dt>
                <dd className="mt-1 text-sm font-medium">{rfq.quantity}</dd>
              </div>
              {(!isRound || rfq.thickness > 0) && (
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Thickness</dt>
                  <dd className="mt-1 text-sm font-medium">{rfq.thickness} cm</dd>
                </div>
              )}
              {rfq.notes && (
                <div className="col-span-2">
                  <dt className="text-xs uppercase text-muted-foreground">Notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm">{rfq.notes}</dd>
                </div>
              )}
            </dl>

            {rfq.attachments && rfq.attachments.length > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="mb-2 text-xs uppercase text-muted-foreground">Attachments</h3>
                <ul className="space-y-1">
                  {rfq.attachments.map((att: { id: string; file_name: string }) => (
                    <li key={att.id} className="text-sm text-primary">
                      {att.file_name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {existingQuote ? (
          <SupplierQuoteReadOnly quote={existingQuote} />
        ) : (
          <SupplierQuoteForm rfqId={rfqId} token={token} />
        )}
      </div>
    </div>
  );
}
