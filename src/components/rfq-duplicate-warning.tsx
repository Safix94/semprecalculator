'use client';

import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormattedDate } from '@/components/formatted-date';
import { formatRfqDimensions } from '@/lib/rfq-format';
import type { RfqDuplicateMatch, RfqDuplicateWarning as RfqDuplicateWarningData } from '@/lib/rfq-match';

interface RfqDuplicateWarningProps {
  warning: RfqDuplicateWarningData;
  loading?: boolean;
  error?: string | null;
}

function materialSummary(match: RfqDuplicateMatch): string {
  const rfq = match.rfq;
  return [
    rfq.material,
    rfq.material_table_top ? `Top: ${rfq.material_table_top}` : null,
    rfq.material_table_foot ? `Foot: ${rfq.material_table_foot}` : null,
  ].filter(Boolean).join(' / ') || '-';
}

function finishSummary(match: RfqDuplicateMatch): string {
  const rfq = match.rfq;
  return [
    rfq.finish,
    rfq.finish_top ? `Top: ${rfq.finish_top}` : null,
    rfq.finish_edge ? `Edge: ${rfq.finish_edge}` : null,
    rfq.finish_color ? `Color: ${rfq.finish_color}` : null,
    rfq.finish_table_top ? `Table top: ${rfq.finish_table_top}` : null,
    rfq.finish_table_foot ? `Table foot: ${rfq.finish_table_foot}` : null,
  ].filter(Boolean).join(' / ') || '-';
}

function MatchRow({ match }: { match: RfqDuplicateMatch }) {
  const suppliers = match.supplierNames.join(', ') || '-';
  const dimensions = formatRfqDimensions(match.rfq);

  return (
    <div className="rounded-md border bg-background/70 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-medium">
            {match.rfq.product_type || 'Product'} · {suppliers}
          </div>
          <div className="text-muted-foreground">
            <FormattedDate value={match.rfq.created_at} dateStyle="medium" /> · {match.rfq.status}
          </div>
          <div className="text-muted-foreground">
            {materialSummary(match)} · {finishSummary(match)}
          </div>
          <div className="text-muted-foreground">{dimensions}</div>
          <div className="text-xs text-amber-700 dark:text-amber-300">{match.reason}</div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/dashboard/rfqs/${match.rfq.id}`} target="_blank" rel="noreferrer">
            Open existing request
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function RfqDuplicateWarning({ warning, loading, error }: RfqDuplicateWarningProps) {
  const matches = [...warning.exact, ...warning.similar];
  if (!loading && !error && matches.length === 0) {
    return null;
  }

  const title = loading
    ? 'Controle op dubbele aanvragen'
    : error
      ? 'Duplicate check niet gelukt'
      : warning.exact.length > 0
        ? 'Mogelijke dubbele aanvraag gevonden'
        : 'Gelijkaardige aanvragen gevonden';

  return (
    <Alert className="border-amber-500/50 bg-amber-500/10">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-3">
        {loading && <p>Checking previous requests...</p>}
        {error && <p className="text-destructive">{error}</p>}
        {warning.exact.length > 0 && (
          <p>
            Deze combinatie werd al eerder aangevraagd. Controleer de bestaande request voordat je opnieuw aanmaakt.
          </p>
        )}
        {warning.exact.map((match) => (
          <MatchRow key={`exact-${match.rfq.id}`} match={match} />
        ))}
        {warning.similar.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium">Gelijkaardige requests</p>
            {warning.similar.map((match) => (
              <MatchRow key={`similar-${match.rfq.id}`} match={match} />
            ))}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
