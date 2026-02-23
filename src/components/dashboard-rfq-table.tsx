'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Rfq, RfqStatus } from '@/types';

interface DashboardRfqTableProps {
  rfqs: Rfq[];
  creatorEmailById: Record<string, string>;
  currentPage: number;
  totalPages: number;
  selectedRfqId: string | null;
}

const statusLabels: Record<RfqStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-secondary text-secondary-foreground' },
  sent_to_supplier: { label: 'Sent to supplier', color: 'bg-primary/15 text-primary' },
  waiting_for_technical_drawing: { label: 'Waiting for technical drawing', color: 'bg-chart-4/15 text-chart-4' },
  closed: { label: 'Closed', color: 'bg-accent text-accent-foreground' },
};

export function DashboardRfqTable({
  rfqs,
  creatorEmailById,
  currentPage,
  totalPages,
  selectedRfqId,
}: DashboardRfqTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const searchParamsString = useMemo(() => searchParams.toString(), [searchParams]);

  const buildHref = (page: number, rfqId: string | null) => {
    const params = new URLSearchParams(searchParamsString);

    if (page > 1) {
      params.set('page', String(page));
    } else {
      params.delete('page');
    }

    if (rfqId) {
      params.set('rfq', rfqId);
    } else {
      params.delete('rfq');
    }

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const openRfq = (rfqId: string) => {
    router.push(buildHref(currentPage, rfqId));
  };

  const goToPage = (page: number) => {
    router.push(buildHref(page, selectedRfqId));
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>Material</TableHead>
            <TableHead>Finish</TableHead>
            <TableHead>Shape</TableHead>
            <TableHead>Dimensions</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Requested by</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date & time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rfqs.map((rfq) => {
            const status = statusLabels[rfq.status] ?? {
              label: rfq.status,
              color: 'bg-muted text-muted-foreground',
            };

            return (
              <TableRow
                key={rfq.id}
                className={`cursor-pointer ${selectedRfqId === rfq.id ? 'bg-accent/30 hover:bg-accent/40' : ''}`}
                onClick={() => openRfq(rfq.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openRfq(rfq.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <TableCell className="font-medium text-primary">{rfq.material}</TableCell>
                <TableCell className="text-muted-foreground">{rfq.finish || '-'}</TableCell>
                <TableCell className="text-muted-foreground">{rfq.shape}</TableCell>
                <TableCell className="text-muted-foreground">
                  {rfq.length}x{rfq.width}x{rfq.height} (d:{rfq.thickness})
                </TableCell>
                <TableCell className="text-muted-foreground">{rfq.customer_name || '-'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {creatorEmailById[rfq.created_by] ?? 'Unknown'}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${status.color}`}>
                    {status.label}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(rfq.created_at).toLocaleString('nl-NL', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between border-t px-4 py-3">
        <span className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
