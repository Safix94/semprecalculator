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
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(value);
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
                <Label htmlFor="history-q" className="sempre-label">Zoeken</Label>
                <Input
                  id="history-q"
                  type="search"
                  value={form.q}
                  onChange={(event) => updateField('q', event.target.value)}
                  placeholder="Klant, leverancier, materiaal…"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="sempre-label">Leverancier</Label>
                <Select value={form.supplier || 'all'} onValueChange={(value) => updateField('supplier', value === 'all' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alle leveranciers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle leveranciers</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="sempre-label">Producttype</Label>
                <Select value={form.productType || 'all'} onValueChange={(value) => updateField('productType', value === 'all' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alle producttypes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle producttypes</SelectItem>
                    {productTypes.map((productType) => (
                      <SelectItem key={productType} value={productType}>
                        {productType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="history-material" className="sempre-label">Materiaal</Label>
                <Input id="history-material" value={form.material} onChange={(event) => updateField('material', event.target.value)} placeholder="Material" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="history-finish" className="sempre-label">Afwerking</Label>
                <Input id="history-finish" value={form.finish} onChange={(event) => updateField('finish', event.target.value)} placeholder="Finish" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="history-model" className="sempre-label">Model</Label>
                <Input id="history-model" value={form.model} onChange={(event) => updateField('model', event.target.value)} placeholder="Model name / reference" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="history-shape" className="sempre-label">Vorm</Label>
                <Input id="history-shape" value={form.shape} onChange={(event) => updateField('shape', event.target.value)} placeholder="Round, Rectangular..." />
              </div>

              <div className="space-y-1.5">
                <Label className="sempre-label">Status</Label>
                <Select value={form.status || 'all'} onValueChange={(value) => updateField('status', value === 'all' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alle statussen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle statussen</SelectItem>
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
                Datum en afmetingen
              </summary>
              <div className="mt-3 grid gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="history-created-from" className="sempre-label">Van</Label>
                  <Input id="history-created-from" type="date" value={form.createdFrom} onChange={(event) => updateField('createdFrom', event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-created-to" className="sempre-label">Tot</Label>
                  <Input id="history-created-to" type="date" value={form.createdTo} onChange={(event) => updateField('createdTo', event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-length" className="sempre-label">Lengte / diameter</Label>
                  <Input id="history-length" type="number" step="any" min="0" value={form.length} onChange={(event) => updateField('length', event.target.value)} placeholder="cm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-width" className="sempre-label">Breedte</Label>
                  <Input id="history-width" type="number" step="any" min="0" value={form.width} onChange={(event) => updateField('width', event.target.value)} placeholder="cm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-height" className="sempre-label">Hoogte</Label>
                  <Input id="history-height" type="number" step="any" min="0" value={form.height} onChange={(event) => updateField('height', event.target.value)} placeholder="cm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="history-thickness" className="sempre-label">Dikte blad</Label>
                  <Input id="history-thickness" type="number" step="any" min="0" value={form.thickness} onChange={(event) => updateField('thickness', event.target.value)} placeholder="cm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="sempre-label">Sorteren op</Label>
                  <Select value={form.sortBy || 'created_at'} onValueChange={(value) => updateField('sortBy', value === 'created_at' ? '' : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Date" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="created_at">Date</SelectItem>
                      <SelectItem value="dimensions">Dimensions (L×W×H)</SelectItem>
                      <SelectItem value="length">Length / diameter</SelectItem>
                      <SelectItem value="width">Width</SelectItem>
                      <SelectItem value="height">Height</SelectItem>
                      <SelectItem value="thickness">Thickness top</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="sempre-label">Richting</Label>
                  <Select value={form.sortDirection || 'desc'} onValueChange={(value) => updateField('sortDirection', value === 'desc' ? '' : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Descending" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Descending</SelectItem>
                      <SelectItem value="asc">Ascending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit">Zoeken</Button>
              <Button type="button" variant="outline" onClick={resetFilters}>
                Filters wissen
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
              Pagina {search.currentPage} van {search.totalPages}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => goToPage(search.currentPage - 1)} disabled={search.currentPage <= 1}>
                Vorige
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => goToPage(search.currentPage + 1)} disabled={search.currentPage >= search.totalPages}>
                Volgende
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Datum</TableHead>
                <TableHead>Producttype</TableHead>
                <TableHead>Leverancier(s)</TableHead>
                <TableHead>Materiaal / afwerking</TableHead>
                <TableHead>Afmetingen</TableHead>
                <TableHead>Klant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Supplier basisprijs</TableHead>
                <TableHead>Retail price</TableHead>
                <TableHead className="text-right">Actie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {search.results.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                    Geen RFQ&apos;s gevonden voor deze filters.
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
                  const supplierBasePrices = supplierBasePriceLabel(result);

                  return (
                    <TableRow key={rfq.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        <FormattedDate value={rfq.created_at} dateStyle="short" />
                      </TableCell>
                      <TableCell className="max-w-[160px] font-medium" title={[rfq.product_type, rfq.model].filter(Boolean).join(' | ') || '-'}>
                        <span className="block truncate">{rfq.product_type || '-'}</span>
                        {rfq.model && <span className="block truncate text-xs font-normal text-muted-foreground">Model: {rfq.model}</span>}
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
                        <span className={`sempre-status ${status.color}`}>
                          {status.label}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground" title={supplierBasePrices}>
                        {supplierBasePrices}
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
