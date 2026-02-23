import { validateSupplierToken } from '@/actions/quote';
import { SupplierQuoteForm } from '@/components/supplier-quote-form';
import { SupplierQuoteReadOnly } from '@/components/supplier-quote-readonly';
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="text-xl font-bold text-destructive mb-2">Invalid link</h1>
            <p className="text-muted-foreground">This link is invalid. Check the link in your email.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const result = await validateSupplierToken(rfqId, token);

  if (result.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="text-xl font-bold text-destructive mb-2">Access denied</h1>
            <p className="text-muted-foreground">{result.error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { rfq, supplier, existingQuote } = result.data!;

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-2xl mx-auto px-4">
        <Card className="mb-6">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">Request for quotation</h1>
              <span className="text-sm text-muted-foreground">{supplier?.name}</span>
            </div>

            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-muted-foreground uppercase">Material</dt>
                <dd className="text-sm font-medium mt-1">{rfq.material}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase">Shape</dt>
                <dd className="text-sm font-medium mt-1">{rfq.shape}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase">Dimensions (L×W×H)</dt>
                <dd className="text-sm font-medium mt-1">
                  {rfq.length} x {rfq.width} x {rfq.height} mm
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase">Thickness</dt>
                <dd className="text-sm font-medium mt-1">{rfq.thickness} mm</dd>
              </div>
              {rfq.notes && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground uppercase">Notes</dt>
                  <dd className="text-sm mt-1 whitespace-pre-wrap">{rfq.notes}</dd>
                </div>
              )}
            </dl>

            {rfq.attachments && rfq.attachments.length > 0 && (
              <div className="pt-4 border-t border-border">
                <h3 className="text-xs text-muted-foreground uppercase mb-2">Attachments</h3>
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

        {existingQuote ? <SupplierQuoteReadOnly quote={existingQuote} /> : <SupplierQuoteForm rfqId={rfqId} token={token} />}
      </div>
    </div>
  );
}
