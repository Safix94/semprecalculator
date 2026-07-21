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
import { formatSupplierInputAmount } from '@/lib/currency';
import { formatRfqDimensions } from '@/lib/rfq-format';
import type { RfqSearchResponse, RfqStatus, Supplier } from '@/types';

export interface RfqHistoryFilters {
  q: string;
  supplier: string;
  productType: string;
  material: string;
  finish: string;
  model: string;
  shape: string;
  status: string;
  createdFrom: string;
  createdTo: string;
  length: string;
  width: string;
  height: string;
  thickness: string;
  sortBy: string;
  sortDirection: string;
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
  sent_to_supplier: { label: 'Sent to supplier', color: 'bg-chart-2/15 text-chart-2' },
  supplier_replied: { label: 'Supplier replied', color: 'bg-chart-2/15 text-chart-2' },
  waiting_for_technical_drawing: { label: 'Waiting for technical drawing', color: 'bg-chart-4/15 text-chart-4' },
  quotes_received: { label: 'Quotes received', color: 'bg-primary/15 text-primary' },
  sent_to_pricing_crm: { label: 'Sent to pricing (CRM)', color: 'bg-chart-4/15 text-chart-4' },
  closed: { label: 'Closed', color: 'bg-muted text-muted-foreground' },
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
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(value);
}

function supplierBasePriceLabel(result: RfqSearchResponse['results'][number]): string {
  if (result.supplierBasePrices.length === 0) return '-';

  return result.supplierBasePrices
    .map((price) => price.isAutomatic
      ? 'Automatic'
      : formatSupplierInputAmount(price.supplierInputPrice, price.supplierInputCurrency)
    )
    .join(' / ');
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
      model: '',
      shape: '',
      status: '',
      createdFrom: '',
      createdTo: '',
      length: '',
      width: '',
      height: '',
      thickness: '',
      sortBy: '',
      sortDirection: '',
    };
    setForm(emptyFilters);
    router.push('/dashboard/history');
  };

  const goToPage = (page: number) => {
    router.push(buildQuery(form, page));
  };

  const changeSort = (patch: Partial<Pick<RfqHistoryFilters, 'sortBy' | 'sortDirection'>>) => {
    const next = { ...filters, ...patch };
    setForm((current) => ({ ...current, ...patch }));
    router.push(buildQuery(next, 1));
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[264px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitFilters} className="space-y-4">
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="history-q" className="sempre-label">Search</Label>
                <Input
                  id="history-q"
                  type="search"
                  value={form.q}
                  onChange={(event) => updateField('q', event.target.value)}
                  placeholder="Customer, supplier, material…"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="sempre-label">Supplier</Label>
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
                <Label className="sempre-label">Product type</Label>
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
                <Label htmlFor="history-material" className="sempre-label">Material</Label>
                <Input id="history-material" value={form.material} onChange={(event) => updateField('material', event.target.value)} placeholder="Material" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="history-finish" className="sempre-label">Finish</Label>
                <Input id="history-finish" value={form.finish} onChange={(event) => updateField('finish', event.target.value)} placeholder="Finish" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="history-model" className="sempre-label">Model</Label>
                <Input id="history-model" value={form.model} onChange={(event) => updateField('model', event.target.value)} placeholder="Model name / reference" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="history-shape" className="sempre-label">Shape</Label>
                <Input id="history-shape" value={form.shape} onChange={(event) => updateField('shape', event.target.value)} placeholder="Round, Rectangular..." />
              </div>

              <div className="space-y-1.5">
                <Label className="sempre-label">Status</Label>
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

            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-[13px] font-semibold text-muted-foreground">
                Date and dimensions
              </summary>
              <div className="mt-3 grid gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="history-created-from" className="sempre-label">From</Label>
                  <Input id="history-created-from" type="date" value={form.createdFrom} onChange={(event) => updateField('createdFrom', event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-created-to" className="sempre-label">To</Label>
                  <Input id="history-created-to" type="date" value={form.createdTo} onChange={(event) => updateField('createdTo', event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-length" className="sempre-label">Length / diameter</Label>
                  <Input id="history-length" type="number" step="any" min="0" value={form.length} onChange={(event) => updateField('length', event.target.value)} placeholder="cm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-width" className="sempre-label">Width</Label>
                  <Input id="history-width" type="number" step="any" min="0" value={form.width} onChange={(event) => updateField('width', event.target.value)} placeholder="cm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-height" className="sempre-label">Height</Label>
                  <Input id="history-height" type="number" step="any" min="0" value={form.height} onChange={(event) => updateField('height', event.target.value)} placeholder="cm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-thickness" className="sempre-label">Top thickness</Label>
                  <Input id="history-thickness" type="number" step="any" min="0" value={form.thickness} onChange={(event) => updateField('thickness', event.target.value)} placeholder="cm" />
                </div>
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit">Search</Button>
              <Button type="button" variant="outline" onClick={resetFilters}>
                Clear filters
              </Button>
              <span className="text-sm text-muted-foreground xl:w-full">
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
              {search.totalCount} result{search.totalCount === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-2">
              <Label className="sempre-label hidden sm:block">Sort by</Label>
              <Select
                value={filters.sortBy || 'created_at'}
                onValueChange={(value) => changeSort({ sortBy: value === 'created_at' ? '' : value })}
              >
                <SelectTrigger size="sm" className="w-[168px]">
                  <SelectValue placeholder="Date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Date</SelectItem>
                  <SelectItem value="dimensions">Dimensions (L×W×H)</SelectItem>
                  <SelectItem value="length">Length / diameter</SelectItem>
                  <SelectItem value="width">Width</SelectItem>
                  <SelectItem value="height">Height</SelectItem>
                  <SelectItem value="thickness">Top thickness</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.sortDirection || 'desc'}
                onValueChange={(value) => changeSort({ sortDirection: value === 'desc' ? '' : value })}
              >
                <SelectTrigger size="sm" className="w-[128px]">
                  <SelectValue placeholder="Descending" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Newest first</SelectItem>
                  <SelectItem value="asc">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {search.results.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              No RFQs found for these filters.
            </p>
          ) : (
            <div className="divide-y">
              {search.results.map((result) => {
                const rfq = result.rfq;
                const status = statusLabels[rfq.status] ?? {
                  label: rfq.status,
                  color: 'bg-muted text-muted-foreground',
                };
                const material = materialSummary(rfq);
                const finish = finishSummary(rfq);
                const dimensions = formatRfqDimensions(rfq);
                const suppliersLabel = result.supplierNames.join(', ') || '-';
                const supplierBasePrices = supplierBasePriceLabel(result);

                return (
                  <Link
                    key={rfq.id}
                    href={`/dashboard/rfqs/${rfq.id}`}
                    className="grid items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-[oklch(0.975_0.01_152)] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="truncate font-semibold">{rfq.product_type || 'RFQ'}</span>
                        {rfq.model && <span className="truncate text-xs text-muted-foreground">· {rfq.model}</span>}
                      </div>
                      <div className="truncate text-[13px] text-muted-foreground">
                        {rfq.customer_name || 'Unknown customer'}
                        {material !== '-' && <> · {material}</>}
                        {finish !== '-' && <span className="text-muted-foreground/80"> · {finish}</span>}
                      </div>
                      {dimensions && dimensions !== '-' && (
                        <div className="truncate text-xs text-muted-foreground/80">{dimensions}</div>
                      )}
                    </div>

                    <div className="min-w-0 text-[13px]">
                      <div className="sempre-label">Supplier</div>
                      <div className="truncate text-foreground/80" title={suppliersLabel}>{suppliersLabel}</div>
                      {supplierBasePrices !== '-' && (
                        <div className="truncate text-xs text-muted-foreground">Base: {supplierBasePrices}</div>
                      )}
                    </div>

                    <div className="flex flex-col items-start gap-1 md:items-end md:text-right">
                      <span className={`sempre-status ${status.color}`}>{status.label}</span>
                      <span className="text-sm font-bold">{priceLabel(result.bestFinalPrice)}</span>
                      <span className="text-xs text-muted-foreground">
                        <FormattedDate value={rfq.created_at} dateStyle="short" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
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
        </CardContent>
      </Card>
    </div>
  );
}
