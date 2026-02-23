import { requireAuth } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { RfqCreateWizard } from '@/components/rfq-create-wizard';
import { DashboardRfqTable } from '@/components/dashboard-rfq-table';
import { RfqDetailModal } from '@/components/rfq-detail-modal';
import { Card, CardContent } from '@/components/ui/card';
import { isProductType } from '@/lib/product-types';
import type { Rfq } from '@/types';

interface DashboardPageProps {
  searchParams?: Promise<{
    page?: string | string[];
    rfq?: string | string[];
    product_type?: string | string[];
  }>;
}

const PAGE_SIZE = 20;

function getStringParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  await requireAuth();
  const params = searchParams ? await searchParams : {};
  const pageParam = getStringParam(params.page) ?? '1';
  const selectedRfqId = getStringParam(params.rfq) ?? null;
  const productTypeParam = getStringParam(params.product_type) ?? null;
  const productTypeFilter = productTypeParam && isProductType(productTypeParam) ? productTypeParam : null;

  const parsedPage = Number.parseInt(pageParam, 10);
  const requestedPage = Number.isNaN(parsedPage) ? 1 : parsedPage;
  const supabase = await createClient();

  let countQuery = supabase.from('rfqs').select('id', { count: 'exact', head: true });
  if (productTypeFilter) {
    countQuery = countQuery.eq('product_type', productTypeFilter);
  }
  const { count, error: countError } = await countQuery;

  if (countError) {
    console.error('Failed to count RFQs:', countError.message);
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let rfqsQuery = supabase
    .from('rfqs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, to);
  if (productTypeFilter) {
    rfqsQuery = rfqsQuery.eq('product_type', productTypeFilter);
  }
  const { data: rfqsData, error: rfqsError } = await rfqsQuery;

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
        <h1 className="text-2xl font-bold tracking-tight">Prijs request</h1>
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
            <DashboardRfqTable
              rfqs={rfqs}
              creatorEmailById={creatorEmailById}
              currentPage={currentPage}
              totalPages={totalPages}
              selectedRfqId={selectedRfqId}
              productTypeFilter={productTypeFilter}
            />
          </CardContent>
        </Card>
      )}

      <RfqDetailModal rfqId={selectedRfqId} refreshToken={new Date().toISOString()} />
    </div>
  );
}
