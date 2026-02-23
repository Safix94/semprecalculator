'use client';

import { useSyncExternalStore } from 'react';
import type { RfqInvite, RfqQuote, Supplier } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface QuoteComparisonProps {
  invites: (RfqInvite & { supplier: Supplier })[];
  quotes: (RfqQuote & { supplier: Supplier })[];
}

function subscribe() {
  return () => {};
}

function getInviteStatus(invite: RfqInvite, hasQuote: boolean): { label: string; color: string } {
  if (invite.revoked_at) return { label: 'Revoked', color: 'text-destructive' };
  if (hasQuote) return { label: 'Replied', color: 'text-chart-2' };
  if (new Date(invite.expires_at) < new Date()) return { label: 'Expired', color: 'text-chart-4' };
  return { label: 'Pending', color: 'text-primary' };
}

export function QuoteComparison({ invites, quotes }: QuoteComparisonProps) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  const lowestPrice = quotes.length > 0
    ? Math.min(...quotes.map((q) => q.final_price_calculated))
    : null;

  const quoteBySupplier = new Map(quotes.map((q) => [q.supplier_id, q]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quote comparison</CardTitle>
      </CardHeader>
      <CardContent>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No suppliers invited.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Base price</TableHead>
                <TableHead className="text-right">Volume (m³)</TableHead>
                <TableHead className="text-right">Shipping</TableHead>
                <TableHead className="text-right">Final price</TableHead>
                <TableHead className="text-right">Lead time</TableHead>
                <TableHead>Comment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((invite) => {
                const quote = quoteBySupplier.get(invite.supplier_id);
                const status = mounted
                  ? getInviteStatus(invite, !!quote)
                  : invite.revoked_at
                    ? { label: 'Revoked', color: 'text-destructive' }
                    : quote
                      ? { label: 'Replied', color: 'text-chart-2' }
                      : { label: 'Pending', color: 'text-primary' };
                const isLowest = quote && quote.final_price_calculated === lowestPrice;

                return (
                  <TableRow
                    key={invite.id}
                    className={isLowest ? 'bg-accent/40 hover:bg-accent/50' : undefined}
                  >
                    <TableCell className="font-medium">{invite.supplier?.name ?? 'Unknown'}</TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${status.color}`}>{status.label}</span>
                    </TableCell>
                    <TableCell className="text-right">{quote ? `€${Number(quote.base_price).toFixed(2)}` : '-'}</TableCell>
                    <TableCell className="text-right">{quote ? Number(quote.volume_m3).toFixed(3) : '-'}</TableCell>
                    <TableCell className="text-right">
                      {quote ? `€${Number(quote.shipping_cost_calculated).toFixed(3)}` : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {quote ? (
                        <span className={`font-semibold ${isLowest ? 'text-primary' : ''}`}>
                          €{Number(quote.final_price_calculated).toFixed(2)}
                          {isLowest && ' ★'}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {quote?.lead_time_days ? `${quote.lead_time_days} days` : '-'}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {quote?.comment || '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
