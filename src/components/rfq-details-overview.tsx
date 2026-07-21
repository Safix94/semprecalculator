'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormattedDate } from '@/components/formatted-date';
import {
  formatRfqDimensionsWithOptions,
  isRoundShape,
  isTableTopsProductType,
  isTablesProductType,
} from '@/lib/rfq-format';
import type { Rfq, RfqInvite, Supplier } from '@/types';

export type RfqInviteWithSupplier = RfqInvite & { supplier: Supplier | null };

interface RfqDetailsOverviewProps {
  rfq: Rfq;
  invites?: RfqInviteWithSupplier[];
  status?: {
    label: string;
    color: string;
  };
  showDates?: boolean;
}

function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="sempre-info-label">{label}</dt>
      <dd className="sempre-info-value">{value || '-'}</dd>
    </div>
  );
}

function supplierPartLabel(part: RfqInvite['invite_part']): string | null {
  switch (part) {
    case 'table_top':
      return 'Top';
    case 'table_foot':
      return 'Foot';
    case 'table_both':
      return 'Top + foot';
    default:
      return null;
  }
}

function supplierLabels(invites: RfqInviteWithSupplier[], isTablesType: boolean): string[] {
  const labels = new Set<string>();

  invites.forEach((invite) => {
    const supplierName = invite.supplier?.name?.trim();
    if (!supplierName) return;

    const partLabel = isTablesType ? supplierPartLabel(invite.invite_part) : null;
    labels.add(partLabel ? `${partLabel}: ${supplierName}` : supplierName);
  });

  return [...labels];
}

export function RfqDetailsOverview({ rfq, invites = [], status, showDates = true }: RfqDetailsOverviewProps) {
  const isRound = isRoundShape(rfq.shape);
  const isTablesType = isTablesProductType(rfq.product_type);
  const isTableTopsType = isTableTopsProductType(rfq.product_type);
  const suppliers = supplierLabels(invites, isTablesType);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Specificaties</CardTitle>
          {status && <span className={`sempre-status ${status.color}`}>{status.label}</span>}
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          {rfq.model && <InfoItem label="Model" value={rfq.model} />}
          <InfoItem label="Product type" value={rfq.product_type || '-'} />
          <InfoItem label="Customer" value={rfq.customer_name || '-'} />
          {isTablesType ? (
            <>
              <InfoItem
                label={isTableTopsType ? 'Table top' : 'Table top'}
                value={[rfq.material_table_top, rfq.finish_table_top].filter(Boolean).join(' — ') || '-'}
              />
              {!isTableTopsType && (
                <InfoItem
                  label="Table base"
                  value={[rfq.material_table_foot, rfq.finish_table_foot].filter(Boolean).join(' — ') || '-'}
                />
              )}
            </>
          ) : (
            <>
              <InfoItem label="Material" value={rfq.material || '-'} />
              <InfoItem label="Finish" value={rfq.finish || '-'} />
              {rfq.finish_top && <InfoItem label="Top finish" value={rfq.finish_top} />}
              {rfq.finish_edge && <InfoItem label="Edge finish" value={rfq.finish_edge} />}
              {rfq.finish_color && <InfoItem label="Colour finish" value={rfq.finish_color} />}
            </>
          )}
          <InfoItem label="Shape" value={rfq.shape || '-'} />
          <InfoItem label="Usage" value={rfq.usage_environment || '-'} />
          <InfoItem
            label={isRound ? 'Dimensions (Ø×H)' : 'Dimensions (L×W×H)'}
            value={formatRfqDimensionsWithOptions(rfq, { includeThickness: false })}
          />
          <InfoItem label="Top thickness" value={`${rfq.thickness} cm`} />
          <InfoItem label="Quantity" value={`${rfq.quantity} units`} />
          {showDates && (
            <>
              <InfoItem
                label="Created"
                value={<FormattedDate value={rfq.created_at} locale="en-GB" dateStyle="short" timeStyle="short" />}
              />
              {rfq.sent_at && (
                <InfoItem
                  label="Sent"
                  value={<FormattedDate value={rfq.sent_at} locale="en-GB" dateStyle="short" timeStyle="short" />}
                />
              )}
            </>
          )}
          <div className="sm:col-span-2">
            <dt className="sempre-info-label">Supplier(s)</dt>
            {suppliers.length > 0 ? (
              <dd className="mt-2 flex flex-wrap gap-2">
                {suppliers.map((supplier) => (
                  <span key={supplier} className="rounded-md border bg-muted/60 px-2.5 py-1 text-[12.5px] font-semibold text-foreground/80">
                    {supplier}
                  </span>
                ))}
              </dd>
            ) : (
              <dd className="sempre-info-value">-</dd>
            )}
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
