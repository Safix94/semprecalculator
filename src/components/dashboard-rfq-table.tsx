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
import { formatRfqDimensions, isTablesProductType } from '@/lib/rfq-format';
import type { Rfq, RfqInvite, RfqStatus, Supplier } from '@/types';

export type DashboardRfqInvite = Pick<RfqInvite, 'id' | 'rfq_id' | 'supplier_id' | 'invite_part'> & {
  supplier: Pick<Supplier, 'id' | 'name'> | null;
};

interface DashboardRfqTableProps {
  rfqs: Rfq[];
  invitesByRfqId: Record<string, DashboardRfqInvite[]>;
  creatorEmailById: Record<string, string>;
  currentPage: number;
  totalPages: number;
  selectedRfqId: string | null;
  productTypeFilter: string | null;
  productTypes: string[];
  supplierFilter: string | null;
  supplierOptions: Pick<Supplier, 'id' | 'name'>[];
  statusFilter: RfqStatus | null;
  statusOptions: RfqStatus[];
  searchQuery: string | null;
}

const statusLabels: Record<RfqStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-secondary text-secondary-foreground' },
  sent_to_pricing: { label: 'Sent to pricing', color: 'bg-chart-4/15 text-chart-4' },
  sent_to_supplier: { label: 'Sent to supplier', color: 'bg-primary/15 text-primary' },
  supplier_replied: { label: 'Supplier replied', color: 'bg-chart-2/15 text-chart-2' },
  waiting_for_technical_drawing: { label: 'Waiting for technical drawing', color: 'bg-chart-4/15 text-chart-4' },
  quotes_received: { label: 'Quotes received', color: 'bg-chart-2/15 text-chart-2' },
  sent_to_pricing_crm: { label: 'Sent to pricing (CRM)', color: 'bg-chart-4/15 text-chart-4' },
  closed: { label: 'Closed', color: 'bg-accent text-accent-foreground' },
};

function supplierPartLabel(part: DashboardRfqInvite['invite_part']): string | null {
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

function formatSupplierNames(invites: DashboardRfqInvite[], rfq: Rfq): string[] {
  const isTablesType = isTablesProductType(rfq.product_type);
  const names = new Set<string>();

  invites.forEach((invite) => {
    const name = invite.supplier?.name?.trim();
    if (!name) return;

    const partLabel = isTablesType ? supplierPartLabel(invite.invite_part) : null;
    names.add(partLabel ? `${partLabel}: ${name}` : name);
  });

  return [...names];
}

export function DashboardRfqTable({
  rfqs,
  invitesByRfqId,
  creatorEmailById,
  currentPage,
  totalPages,
  selectedRfqId,
  productTypeFilter,
  productTypes,
  supplierFilter,
  supplierOptions,
  statusFilter,
  statusOptions,
  searchQuery,
}: DashboardRfqTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchParamsString = useMemo(() => searchParams.toString(), [searchParams]);
  const selectedProductTypeValue =
    productTypeFilter && productTypes.includes(productTypeFilter) ? productTypeFilter : 'all';
  const selectedSupplierValue = supplierFilter && supplierOptions.some((supplier) => supplier.id === supplierFilter)
    ? supplierFilter
    : 'all';
  const selectedStatusValue = statusFilter && statusOptions.includes(statusFilter) ? statusFilter : 'all';

  const pushParams = (params: URLSearchParams) => {
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const setFilter = (key: 'product_type' | 'supplier' | 'status', value: string) => {
    const params = new URLSearchParams(searchParamsString);
    if (value && value !== 'all') {
      params.set(key, value);
      params.set('page', '1');
    } else {
      params.delete(key);
      params.delete('page');
    }
    params.delete('rfq');
    pushParams(params);
  };

  const resetFilters = () => {
    const params = new URLSearchParams(searchParamsString);
    ['search', 'product_type', 'supplier', 'status', 'page', 'rfq'].forEach((key) => params.delete(key));
    pushParams(params);
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
    params.delete('rfq');
    pushParams(params);
  };

  const openRfq = (rfqId: string) => {
    router.push(buildHref(currentPage, rfqId));
  };

  const goToPage = (page: number) => {
    router.push(buildHref(page, selectedRfqId));
  };

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <form onSubmit={handleSearchSubmit} className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="customer-search" className="text-xs text-muted-foreground">
                Customer
              </Label>
              <Input
                key={`search-${searchQuery ?? ''}`}
                id="customer-search"
                ref={searchInputRef}
                type="search"
                name="search"
                defaultValue={searchQuery ?? ''}
                placeholder="Search customer"
                className="w-[190px]"
                aria-label="Search by customer"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">
              Search
            </Button>
          </form>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={selectedProductTypeValue} onValueChange={(value) => setFilter('product_type', value)}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {productTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Supplier</Label>
            <Select value={selectedSupplierValue} onValueChange={(value) => setFilter('supplier', value)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All suppliers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suppliers</SelectItem>
                {supplierOptions.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={selectedStatusValue} onValueChange={(value) => setFilter('status', value)}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusLabels[status]?.label ?? status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
            Reset filters
          </Button>

          <span className="pb-2 text-sm text-muted-foreground">
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

      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-[17%]">Request</TableHead>
            <TableHead className="w-[18%]">Material / Finish</TableHead>
            <TableHead className="w-[13%]">Dimensions</TableHead>
            <TableHead className="w-[18%]">Supplier(s)</TableHead>
            <TableHead className="w-[11%]">Customer</TableHead>
            <TableHead className="w-[9%]">Req. by</TableHead>
            <TableHead className="w-[8%]">Status</TableHead>
            <TableHead className="w-[6%]">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rfqs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                No requests match the current filters.
              </TableCell>
            </TableRow>
          ) : (
            rfqs.map((rfq) => {
              const status = statusLabels[rfq.status] ?? {
                label: rfq.status,
                color: 'bg-muted text-muted-foreground',
              };
              const customer = rfq.customer_name || '-';
              const requestedBy = creatorEmailById[rfq.created_by] ?? 'Unknown';
              const dimensions = formatRfqDimensions(rfq);
              const supplierNames = formatSupplierNames(invitesByRfqId[rfq.id] ?? [], rfq);
              const supplierLabel = supplierNames.join(', ') || '-';
              const materialLabel = isTablesProductType(rfq.product_type)
                ? [
                    rfq.material_table_top ? `Top: ${[rfq.material_table_top, rfq.finish_table_top].filter(Boolean).join(' — ')}` : null,
                    rfq.material_table_foot ? `Foot: ${[rfq.material_table_foot, rfq.finish_table_foot].filter(Boolean).join(' — ')}` : null,
                  ].filter(Boolean).join(' | ')
                : [rfq.material, rfq.finish].filter(Boolean).join(' — ');

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
                  <TableCell title={[rfq.product_type, rfq.model, rfq.shape].filter(Boolean).join(' | ') || '-'}>
                    <div className="truncate font-medium">{rfq.product_type || '-'}</div>
                    {rfq.model && <div className="truncate text-xs text-muted-foreground">Model: {rfq.model}</div>}
                    <div className="truncate text-xs text-muted-foreground">{rfq.shape}</div>
                  </TableCell>
                  <TableCell className="truncate text-muted-foreground" title={materialLabel || '-'}>
                    {materialLabel || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground" title={dimensions}>
                    <div className="truncate">{dimensions}</div>
                    <div className="text-xs text-muted-foreground">Qty: {rfq.quantity}</div>
                  </TableCell>
                  <TableCell className="truncate font-medium text-primary" title={supplierLabel}>
                    {supplierLabel}
                  </TableCell>
                  <TableCell className="truncate text-muted-foreground" title={customer}>
                    {customer}
                  </TableCell>
                  <TableCell className="truncate text-muted-foreground" title={requestedBy}>
                    {requestedBy}
                  </TableCell>
                  <TableCell className="truncate" title={status.label}>
                    <span className={`inline-flex max-w-full items-center truncate rounded px-2 py-0.5 text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </TableCell>
                  <TableCell className="truncate text-muted-foreground">
                    <FormattedDate
                      value={rfq.created_at}
                      locale="nl-NL"
                      dateStyle="short"
                    />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
