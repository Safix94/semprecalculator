'use client';

import { useSyncExternalStore } from 'react';
import type { RfqInvite, RfqQuote, Supplier } from '@/types';
import { formatSupplierInputAmount } from '@/lib/currency';
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

function isAutomaticSanneVosQuote(quote: RfqQuote | undefined) {
  return quote?.pricing_formula_version === 'sanne_vos_bluestone_v1';
}

function formatQuoteVolume(quote: RfqQuote | undefined) {
  if (!quote || isAutomaticSanneVosQuote(quote)) {
    return '-';
  }

  return `${Number(quote.volume_m3).toFixed(3)} m\u00b3`;
}

function formatCurrency(value: number | string | null | undefined, decimals = 2) {
  if (value === null || value === undefined) {
    return '-';
  }

  return `\u20ac${Number(value).toFixed(decimals)}`;
}

function formatNumber(value: number | string | null | undefined, decimals = 3) {
  if (value === null || value === undefined) {
    return '-';
  }

  return Number(value).toFixed(decimals);
}

function formatPricingMethod(quote: RfqQuote | undefined) {
  if (isAutomaticSanneVosQuote(quote)) return 'Automatic';
  if (!quote?.pricing_method) {
    return '-';
  }

  if (quote.pricing_method === 'none') return 'Geen transport';
  if (quote.pricing_method === 'container') return 'Container';
  if (quote.pricing_method === 'truck') return 'Camion';
  return 'Legacy container';
}

function formatSupplierBasePrice(quote: RfqQuote | undefined) {
  if (!quote) {
    return '-';
  }

  if (isAutomaticSanneVosQuote(quote)) {
    return 'Automatic';
  }

  if (quote.supplier_input_currency && quote.supplier_input_currency !== 'EUR' && quote.supplier_input_price) {
    return `${formatSupplierInputAmount(quote.supplier_input_price, quote.supplier_input_currency)} → ${formatCurrency(quote.base_price)}`;
  }

  return formatCurrency(quote.base_price);
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
                <TableHead>Transport</TableHead>
                <TableHead className="text-right">Supplier base price</TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead className="text-right">Transport cost / truck multiplier</TableHead>
                <TableHead className="text-right">Calculation base</TableHead>
                <TableHead className="text-right">Retail price</TableHead>
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
                const calculationBase = quote?.pricing_method === 'truck'
                  ? quote.transport_adjusted_base_price
                  : quote?.cost_including_transport ??
                    (quote ? Number(quote.base_price) + Number(quote.shipping_cost_calculated) : null);
                const transportDetail = isAutomaticSanneVosQuote(quote)
                  ? '-'
                  : quote?.pricing_method === 'truck'
                    ? `×${formatNumber(quote.truck_multiplier_factor, 3)}`
                    : quote
                      ? formatCurrency(quote.transport_cost_calculated ?? quote.shipping_cost_calculated, 3)
                      : '-';

                return (
                  <TableRow
                    key={invite.id}
                    className={isLowest ? 'bg-accent/40 hover:bg-accent/50' : undefined}
                  >
                    <TableCell className="font-medium">{invite.supplier?.name ?? 'Unknown'}</TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${status.color}`}>{status.label}</span>
                    </TableCell>
                    <TableCell>{formatPricingMethod(quote)}</TableCell>
                    <TableCell className="text-right">
                      {quote ? formatSupplierBasePrice(quote) : '-'}
                    </TableCell>
                    <TableCell className="text-right">{formatQuoteVolume(quote)}</TableCell>
                    <TableCell className="text-right">
                      {transportDetail}
                    </TableCell>
                    <TableCell className="text-right">
                      {quote ? formatCurrency(calculationBase) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {quote ? (
                        <span className={`font-semibold ${isLowest ? 'text-primary' : ''}`}>
                          {formatCurrency(quote.final_price_calculated)}
                          {isLowest && ' \u2605'}
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
