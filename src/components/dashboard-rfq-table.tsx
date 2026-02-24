'use client';

import { useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FormattedDate } from '@/components/formatted-date';
import { PRODUCT_TYPES } from '@/lib/product-types';
import { formatRfqDimensions } from '@/lib/rfq-format';
import type { Rfq, RfqStatus } from '@/types';

interface DashboardRfqTableProps {
  rfqs: Rfq[];
  creatorEmailById: Record<string, string>;
  currentPage: number;
  totalPages: number;
  selectedRfqId: string | null;
  productTypeFilter: string | null;
  searchQuery: string | null;
}

const statusLabels: Record<RfqStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-secondary text-secondary-foreground' },
  sent_to_pricing: { label: 'Sent to pricing', color: 'bg-chart-4/15 text-chart-4' },
  sent_to_supplier: { label: 'Sent to supplier', color: 'bg-primary/15 text-primary' },
  waiting_for_technical_drawing: { label: 'Waiting for technical drawing', color: 'bg-chart-4/15 text-chart-4' },
  quotes_received: { label: 'Supplier replied', color: 'bg-chart-2/15 text-chart-2' },
  closed: { label: 'Closed', color: 'bg-accent text-accent-foreground' },
};

export function DashboardRfqTable({
  rfqs,
  creatorEmailById,
  currentPage,
  totalPages,
  selectedRfqId,
  productTypeFilter,
  searchQuery,
}: DashboardRfqTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchParamsString = useMemo(() => searchParams.toString(), [searchParams]);

  const setProductTypeFilter = (value: string) => {
    const params = new URLSearchParams(searchParamsString);
    if (value && value !== 'all') {
      params.set('product_type', value);
      params.set('page', '1');
    } else {
      params.delete('product_type');
      params.delete('page');
    }
    if (selectedRfqId) params.set('rfq', selectedRfqId);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

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

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = searchInputRef.current?.value?.trim() ?? '';
    const params = new URLSearchParams(searchParamsString);
    if (value) {
      params.set('search', value);
      params.set('page', '1');
    } else {
      params.delete('search');
      params.delete('page');
    }
    if (selectedRfqId) params.set('rfq', selectedRfqId);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const openRfq = (rfqId: string) => {
    router.push(buildHref(currentPage, rfqId));
  };

  const goToPage = (page: number) => {
    router.push(buildHref(page, selectedRfqId));
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <Label htmlFor="customer-search" className="sr-only whitespace-nowrap text-sm text-muted-foreground">
              Search by customer
            </Label>
            <Input
              key={`search-${searchQuery ?? ''}`}
              id="customer-search"
              ref={searchInputRef}
              type="search"
              name="search"
              defaultValue={searchQuery ?? ''}
              placeholder="Search by customer..."
              className="w-[200px]"
              aria-label="Search by customer"
            />
            <Button type="submit" variant="secondary" size="sm">
              Search
            </Button>
          </form>
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-sm text-muted-foreground">Filter by type</span>
            <Select
              value={productTypeFilter ?? 'all'}
              onValueChange={setProductTypeFilter}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {PRODUCT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
        </div>
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

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>Type</TableHead>
            <TableHead>Material</TableHead>
            <TableHead>Finish</TableHead>
            <TableHead>Shape</TableHead>
            <TableHead>Dimensions</TableHead>
            <TableHead>Quantity</TableHead>
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
                <TableCell className="text-muted-foreground">{rfq.product_type || '-'}</TableCell>
                <TableCell className="font-medium text-primary">{rfq.material}</TableCell>
                <TableCell className="text-muted-foreground">{rfq.finish || '-'}</TableCell>
                <TableCell className="text-muted-foreground">{rfq.shape}</TableCell>
                <TableCell className="text-muted-foreground">{formatRfqDimensions(rfq)}</TableCell>
                <TableCell className="text-muted-foreground">{rfq.quantity}</TableCell>
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
                  <FormattedDate
                    value={rfq.created_at}
                    locale="nl-NL"
                    dateStyle="short"
                    timeStyle="short"
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
