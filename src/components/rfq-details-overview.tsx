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
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value || '-'}</dd>
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
    <div className="grid gap-4 xl:grid-cols-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Request overview</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <InfoItem label="Product type" value={rfq.product_type || '-'} />
            <InfoItem label="Customer" value={rfq.customer_name || '-'} />
            {status && (
              <InfoItem
                label="Status"
                value={(
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
                    {status.label}
                  </span>
                )}
              />
            )}
            {showDates && (
              <>
                <InfoItem
                  label="Created"
                  value={(
                    <FormattedDate
                      value={rfq.created_at}
                      locale="nl-NL"
                      dateStyle="short"
                      timeStyle="short"
                    />
                  )}
                />
                {rfq.sent_at && (
                  <InfoItem
                    label="Sent"
                    value={(
                      <FormattedDate
                        value={rfq.sent_at}
                        locale="nl-NL"
                        dateStyle="short"
                        timeStyle="short"
                      />
                    )}
                  />
                )}
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Product details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {isTablesType ? (
              <>
                {rfq.model && <InfoItem label="Model" value={rfq.model} />}
                <InfoItem
                  label={isTableTopsType ? 'Tafelblad' : 'Tafelblad'}
                  value={[rfq.material_table_top, rfq.finish_table_top].filter(Boolean).join(' — ') || '-'}
                />
                {!isTableTopsType && (
                  <InfoItem
                    label="Tafelpoot"
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
                {rfq.finish_color && <InfoItem label="Color finish" value={rfq.finish_color} />}
              </>
            )}
            <InfoItem label="Shape" value={rfq.shape || '-'} />
            <InfoItem label="Use" value={rfq.usage_environment || '-'} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dimensions</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <InfoItem
              label={isRound ? 'Dimensions (Ø x H)' : 'Dimensions (LxWxH)'}
              value={formatRfqDimensionsWithOptions(rfq, { includeThickness: false })}
            />
            <InfoItem label="Thickness top" value={`${rfq.thickness} cm`} />
            <InfoItem label="Quantity" value={rfq.quantity} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Supplier(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {suppliers.length > 0 ? (
            <ul className="space-y-2 text-sm font-medium">
              {suppliers.map((supplier) => (
                <li key={supplier} className="break-words rounded-md bg-muted/40 px-2 py-1">
                  {supplier}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">-</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
