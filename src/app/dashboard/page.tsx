import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { RfqCreateWizard } from '@/components/rfq-create-wizard';
import { RfqDetailModal } from '@/components/rfq-detail-modal';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Rfq, RfqStatus } from '@/types';

interface DashboardPageProps {
  searchParams?: Promise<{
    page?: string | string[];
    rfq?: string | string[];
  }>;
}

const PAGE_SIZE = 20;

const statusLabels: Record<RfqStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-secondary text-secondary-foreground' },
  sent_to_supplier: { label: 'Sent to supplier', color: 'bg-primary/15 text-primary' },
  waiting_for_technical_drawing: { label: 'Waiting for technical drawing', color: 'bg-chart-4/15 text-chart-4' },
  closed: { label: 'Closed', color: 'bg-accent text-accent-foreground' },
};

function getStringParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function buildDashboardHref(page: number, rfqId?: string | null) {
  const params = new URLSearchParams();
  if (page > 1) {
    params.set('page', String(page));
  }
  if (rfqId) {
    params.set('rfq', rfqId);
  }

  const query = params.toString();
  return query ? `/dashboard?${query}` : '/dashboard';
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  await requireAuth();
  const params = searchParams ? await searchParams : {};
  const pageParam = getStringParam(params.page) ?? '1';
  const selectedRfqId = getStringParam(params.rfq) ?? null;
  const parsedPage = Number.parseInt(pageParam, 10);
  const requestedPage = Number.isNaN(parsedPage) ? 1 : parsedPage;
  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from('rfqs')
    .select('id', { count: 'exact', head: true });

  if (countError) {
    console.error('Failed to count RFQs:', countError.message);
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: rfqsData, error: rfqsError } = await supabase
    .from('rfqs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (rfqsError) {
    console.error('Failed to fetch paginated RFQs:', rfqsError.message);
  }

  const rfqs = (rfqsData ?? []) as Rfq[];
  const creatorEmailById: Record<string, string> = {};
  const creatorIds = [...new Set(rfqs.map((rfq) => rfq.created_by).filter(Boolean))];

  if (creatorIds.length > 0) {
    try {
      const serviceClient = createServiceRoleClient();
      await Promise.all(
        creatorIds.map(async (creatorId) => {
          const { data, error } = await serviceClient.auth.admin.getUserById(creatorId);
          if (error) {
            return;
          }
          if (data.user?.email) {
            creatorEmailById[creatorId] = data.user.email;
          }
        })
      );
    } catch (error) {
      console.error('Failed to resolve RFQ creator emails:', error);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Requests for quotation</h1>
        <RfqCreateWizard />
      </div>

      {rfqs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No requests for quotation yet.</p>
            <p className="mt-1 text-sm text-muted-foreground/80">Create a new request to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
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
                      className={selectedRfqId === rfq.id ? 'bg-accent/30 hover:bg-accent/40' : undefined}
                    >
                      <TableCell>
                        <Link
                          href={buildDashboardHref(currentPage, rfq.id)}
                          className="font-medium text-primary hover:underline"
                        >
                          {rfq.material}
                        </Link>
                      </TableCell>
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
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${status.color}`}
                        >
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
                {currentPage === 1 ? (
                  <Button type="button" variant="outline" size="sm" disabled>
                    Previous
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={buildDashboardHref(currentPage - 1, selectedRfqId)}>Previous</Link>
                  </Button>
                )}

                {currentPage === totalPages ? (
                  <Button type="button" variant="outline" size="sm" disabled>
                    Next
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={buildDashboardHref(currentPage + 1, selectedRfqId)}>Next</Link>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <RfqDetailModal rfqId={selectedRfqId} refreshToken={new Date().toISOString()} />
    </div>
  );
}
