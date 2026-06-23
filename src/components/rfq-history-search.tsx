'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormattedDate } from '@/components/formatted-date';
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
import { formatRfqDimensions } from '@/lib/rfq-format';
import type { RfqSearchResponse, RfqStatus, Supplier } from '@/types';

export interface RfqHistoryFilters {
  q: string;
  supplier: string;
  productType: string;
  material: string;
  finish: string;
  shape: string;
  status: string;
  createdFrom: string;
  createdTo: string;
  length: string;
  width: string;
  height: string;
  thickness: string;
}

interface RfqHistorySearchProps {
  search: RfqSearchResponse;
  filters: RfqHistoryFilters;
  productTypes: string[];
  suppliers: Pick<Supplier, 'id' | 'name'>[];
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

const statusOptions: RfqStatus[] = [
  'draft',
  'sent_to_pricing',
  'sent_to_supplier',
  'supplier_replied',
  'waiting_for_technical_drawing',
  'quotes_received',
  'sent_to_pricing_crm',
  'closed',
];

function materialSummary(rfq: RfqSearchResponse['results'][number]['rfq']): string {
  const parts = [
    rfq.material,
    rfq.material_table_top ? `Top: ${rfq.material_table_top}` : null,
    rfq.material_table_foot ? `Foot: ${rfq.material_table_foot}` : null,
  ].filter(Boolean);

  return parts.join(' / ') || '-';
}

function finishSummary(rfq: RfqSearchResponse['results'][number]['rfq']): string {
  const parts = [
    rfq.finish,
    rfq.finish_top ? `Top: ${rfq.finish_top}` : null,
    rfq.finish_edge ? `Edge: ${rfq.finish_edge}` : null,
    rfq.finish_color ? `Color: ${rfq.finish_color}` : null,
    rfq.finish_table_top ? `Table top: ${rfq.finish_table_top}` : null,
    rfq.finish_table_foot ? `Table foot: ${rfq.finish_table_foot}` : null,
  ].filter(Boolean);

  return parts.join(' / ') || '-';
}

function priceLabel(value: number | null): string {
  if (value === null) return '-';
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(value);
}

function sanitizeFilters(filters: RfqHistoryFilters): RfqHistoryFilters {
  return Object.fromEntries(
    Object.entries(filters).map(([key, value]) => [key, value.trim()])
  ) as RfqHistoryFilters;
}

export function RfqHistorySearch({ search, filters, productTypes, suppliers }: RfqHistorySearchProps) {
  const router = useRouter();
  const [form, setForm] = useState<RfqHistoryFilters>(filters);

  const activeFilterCount = useMemo(
    () => Object.values(sanitizeFilters(form)).filter(Boolean).length,
    [form]
  );

  const updateField = (field: keyof RfqHistoryFilters, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const buildQuery = (nextFilters: RfqHistoryFilters, page = 1) => {
    const params = new URLSearchParams();
    const cleanFilters = sanitizeFilters(nextFilters);

    Object.entries(cleanFilters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    if (page > 1) {
      params.set('page', String(page));
    }

    const query = params.toString();
    return query ? `/dashboard/history?${query}` : '/dashboard/history';
  };

  const submitFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push(buildQuery(form));
  };

  const resetFilters = () => {
    const emptyFilters: RfqHistoryFilters = {
      q: '',
      supplier: '',
      productType: '',
      material: '',
      finish: '',
      shape: '',
      status: '',
      createdFrom: '',
      createdTo: '',
      length: '',
      width: '',
      height: '',
      thickness: '',
    };
    setForm(emptyFilters);
    router.push('/dashboard/history');
  };

  const goToPage = (page: number) => {
    router.push(buildQuery(form, page));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitFilters} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="history-q">Search requests</Label>
                <Input
                  id="history-q"
                  type="search"
                  value={form.q}
                  onChange={(event) => updateField('q', event.target.value)}
                  placeholder="Search customer, supplier, material, finish, notes..."
                />
              </div>

              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Select value={form.supplier || 'all'} onValueChange={(value) => updateField('supplier', value === 'all' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All suppliers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All suppliers</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Product type</Label>
                <Select value={form.productType || 'all'} onValueChange={(value) => updateField('productType', value === 'all' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All product types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All product types</SelectItem>
                    {productTypes.map((productType) => (
                      <SelectItem key={productType} value={productType}>
                        {productType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="history-material">Material</Label>
                <Input id="history-material" value={form.material} onChange={(event) => updateField('material', event.target.value)} placeholder="Material" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="history-finish">Finish</Label>
                <Input id="history-finish" value={form.finish} onChange={(event) => updateField('finish', event.target.value)} placeholder="Finish" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="history-shape">Shape</Label>
                <Input id="history-shape" value={form.shape} onChange={(event) => updateField('shape', event.target.value)} placeholder="Round, Rectangular..." />
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status || 'all'} onValueChange={(value) => updateField('status', value === 'all' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusLabels[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                Advanced filters: date and dimensions
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="history-created-from">Date from</Label>
                  <Input id="history-created-from" type="date" value={form.createdFrom} onChange={(event) => updateField('createdFrom', event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-created-to">Date to</Label>
                  <Input id="history-created-to" type="date" value={form.createdTo} onChange={(event) => updateField('createdTo', event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-length">Length / diameter</Label>
                  <Input id="history-length" type="number" step="any" min="0" value={form.length} onChange={(event) => updateField('length', event.target.value)} placeholder="cm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-width">Width</Label>
                  <Input id="history-width" type="number" step="any" min="0" value={form.width} onChange={(event) => updateField('width', event.target.value)} placeholder="cm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-height">Height</Label>
                  <Input id="history-height" type="number" step="any" min="0" value={form.height} onChange={(event) => updateField('height', event.target.value)} placeholder="cm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-thickness">Thickness top</Label>
                  <Input id="history-thickness" type="number" step="any" min="0" value={form.thickness} onChange={(event) => updateField('thickness', event.target.value)} placeholder="cm" />
                </div>
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit">Search</Button>
              <Button type="button" variant="outline" onClick={resetFilters}>
                Reset
              </Button>
              <span className="text-sm text-muted-foreground">
                {search.totalCount} result{search.totalCount === 1 ? '' : 's'} · {activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Page {search.currentPage} of {search.totalPages}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => goToPage(search.currentPage - 1)} disabled={search.currentPage <= 1}>
                Previous
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => goToPage(search.currentPage + 1)} disabled={search.currentPage >= search.totalPages}>
                Next
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Date</TableHead>
                <TableHead>Product type</TableHead>
                <TableHead>Supplier(s)</TableHead>
                <TableHead>Material / finish</TableHead>
                <TableHead>Dimensions</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Best price</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {search.results.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    No RFQs found for these filters.
                  </TableCell>
                </TableRow>
              ) : (
                search.results.map((result) => {
                  const rfq = result.rfq;
                  const status = statusLabels[rfq.status] ?? {
                    label: rfq.status,
                    color: 'bg-muted text-muted-foreground',
                  };
                  const material = materialSummary(rfq);
                  const finish = finishSummary(rfq);
                  const dimensions = formatRfqDimensions(rfq);
                  const suppliersLabel = result.supplierNames.join(', ') || '-';

                  return (
                    <TableRow key={rfq.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        <FormattedDate value={rfq.created_at} dateStyle="short" />
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate font-medium" title={rfq.product_type || '-'}>
                        {rfq.product_type || '-'}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-muted-foreground" title={suppliersLabel}>
                        {suppliersLabel}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground" title={`${material} | ${finish}`}>
                        <span className="font-medium text-foreground/90">{material}</span>
                        <br />
                        <span className="text-xs">{finish}</span>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-muted-foreground" title={dimensions}>
                        {dimensions}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-muted-foreground" title={rfq.customer_name || '-'}>
                        {rfq.customer_name || '-'}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex max-w-full items-center truncate rounded px-2 py-0.5 text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {priceLabel(result.bestFinalPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/rfqs/${rfq.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
