import { validateSupplierToken } from '@/actions/quote';
import { listSupplierComments } from '@/actions/rfq-comments';
import { SupplierCommentThread } from '@/components/supplier-comment-thread';
import { SupplierQuoteForm } from '@/components/supplier-quote-form';
import { SupplierQuoteReadOnly } from '@/components/supplier-quote-readonly';
import {
  formatRfqDimensionsWithOptions,
  isRoundShape,
  isTableTopsProductType,
} from '@/lib/rfq-format';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import type { ReactNode } from 'react';

interface PageProps {
  params: Promise<{ rfqId: string }>;
  searchParams: Promise<{ t?: string; token?: string }>;
}

function SupplierPageShell({ children, centered = false }: { children: ReactNode; centered?: boolean }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 supports-[backdrop-filter]:bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center px-4">
          <Image
            src="/sempre-logo-word.svg"
            alt="Sempre"
            width={130}
            height={17}
            className="h-5 w-auto"
            priority
          />
        </div>
      </header>
      <main
        className={`mx-auto w-full max-w-2xl px-4 py-8 ${
          centered ? 'flex min-h-[calc(100vh-3.5rem)] items-center justify-center' : ''
        }`}
      >
        {children}
      </main>
    </div>
  );
}

function SupplierMessageCard({ title, message }: { title: string; message: string }) {
  return (
    <SupplierPageShell centered>
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          <h1 className="mb-2 text-xl font-bold text-destructive">{title}</h1>
          <p className="text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </SupplierPageShell>
  );
}

export default async function SupplierRfqPage({ params, searchParams }: PageProps) {
  const { rfqId } = await params;
  const { t, token } = await searchParams;
  const supplierToken = (t ?? token)?.trim();

  if (!supplierToken) {
    return (
      <SupplierMessageCard
        title="Invalid link"
        message="This link does not include an access token. Open the latest email invite and try again."
      />
    );
  }

  const result = await validateSupplierToken(rfqId, supplierToken);

  if (result.error) {
    return <SupplierMessageCard title="Access denied" message={result.error} />;
  }

  const { rfq, supplier, invite, existingQuote } = result.data!;
  const commentResult = await listSupplierComments(rfqId, supplierToken);
  const initialComments = 'data' in commentResult ? commentResult.data : [];
  const isRound = isRoundShape(rfq.shape);
  const isTablesType = rfq.product_type?.trim().toLowerCase() === 'tables';
  const isTableTopsType = isTableTopsProductType(rfq.product_type);
  const invitePart = invite.invite_part ?? 'default';
  const showTableTop = isTablesType && (invitePart === 'table_top' || invitePart === 'table_both' || invitePart === 'default');
  const showTableFoot = isTablesType && (invitePart === 'table_foot' || invitePart === 'table_both' || invitePart === 'default');
  const canSubmitOrUpdateQuote = !invite.used_at;
  const quoteInitialValues = existingQuote
    ? {
        basePrice: Number(existingQuote.base_price),
        areaM2: Number(existingQuote.area_m2 ?? existingQuote.volume_m3),
        leadTimeDays: existingQuote.lead_time_days,
        comment: existingQuote.comment,
      }
    : null;

  return (
    <SupplierPageShell>
      <div>
        <Card className="mb-6">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">Request for quotation</h1>
              <span className="text-sm text-muted-foreground">{supplier?.name}</span>
            </div>

            <dl className="grid grid-cols-2 gap-4">
              {!isTablesType && (
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Material</dt>
                  <dd className="mt-1 text-sm font-medium">{rfq.material}</dd>
                </div>
              )}
              {isTableTopsType && (
                <>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Top finish</dt>
                    <dd className="mt-1 text-sm font-medium">{rfq.finish_top || 'N/A'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Edge finish</dt>
                    <dd className="mt-1 text-sm font-medium">{rfq.finish_edge || 'N/A'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Color finish</dt>
                    <dd className="mt-1 text-sm font-medium">{rfq.finish_color || 'N/A'}</dd>
                  </div>
                </>
              )}
              {showTableTop && (
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Table top</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {rfq.material_table_top || 'N/A'}
                    {rfq.finish_table_top ? ` (${rfq.finish_table_top})` : ''}
                  </dd>
                </div>
              )}
              {showTableFoot && (
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Table foot</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {rfq.material_table_foot || 'N/A'}
                    {rfq.finish_table_foot ? ` (${rfq.finish_table_foot})` : ''}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Shape</dt>
                <dd className="mt-1 text-sm font-medium">{rfq.shape}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Use</dt>
                <dd className="mt-1 text-sm font-medium">{rfq.usage_environment || 'N/A'}</dd>
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

        {existingQuote && !canSubmitOrUpdateQuote ? (
          <SupplierQuoteReadOnly quote={existingQuote} />
        ) : (
          <SupplierQuoteForm
            rfqId={rfqId}
            token={supplierToken}
            initialValues={quoteInitialValues}
            isUpdate={Boolean(existingQuote)}
          />
        )}

        <div className="mt-6">
          <SupplierCommentThread
            rfqId={rfqId}
            token={supplierToken}
            initialComments={initialComments}
          />
        </div>
      </div>
    </SupplierPageShell>
  );
}
