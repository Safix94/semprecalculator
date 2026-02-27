import { requireAuth } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { DashboardRfqTable } from '@/components/dashboard-rfq-table';
import { RfqDetailModal } from '@/components/rfq-detail-modal';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { getProductTypes } from '@/actions/product-types';
import type { Rfq } from '@/types';

interface DashboardPageProps {
  searchParams?: Promise<{
    page?: string | string[];
    rfq?: string | string[];
    product_type?: string | string[];
    search?: string | string[];
    admin_required?: string | string[];
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
  const user = await requireAuth();
  const params = searchParams ? await searchParams : {};
  const pageParam = getStringParam(params.page) ?? '1';
  const adminRequired = getStringParam(params.admin_required) === '1';
  const selectedRfqId = getStringParam(params.rfq) ?? null;
  const productTypeParam = getStringParam(params.product_type) ?? null;
  const searchQuery = getStringParam(params.search)?.trim() ?? null;
  const productTypeResult = await getProductTypes();
  const productTypes = 'data' in productTypeResult
    ? productTypeResult.data.map((productType) => productType.name)
    : [];
  const productTypeNameSet = new Set(productTypes);
  const productTypeFilter = productTypeParam
    ? (productTypes.length === 0 || productTypeNameSet.has(productTypeParam) ? productTypeParam : null)
    : null;

  const parsedPage = Number.parseInt(pageParam, 10);
  const requestedPage = Number.isNaN(parsedPage) ? 1 : parsedPage;
  const supabase = await createClient();

  let countQuery = supabase.from('rfqs').select('id', { count: 'exact', head: true });
  if (productTypeFilter) {
    countQuery = countQuery.eq('product_type', productTypeFilter);
  }
  if (searchQuery) {
    countQuery = countQuery.ilike('customer_name', `%${searchQuery}%`);
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
  if (searchQuery) {
    rfqsQuery = rfqsQuery.ilike('customer_name', `%${searchQuery}%`);
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
    <div className="min-w-0">
      {adminRequired && (
        <Alert variant="default" className="mb-6 border-amber-500/50 bg-amber-500/10">
          <AlertDescription>
            Je hebt geen adminrechten voor Management of Audit Logs. Jouw rol is nu{' '}
            <strong>{user.role === 'sales' ? 'Sales' : user.role ?? 'onbekend'}</strong>. Vraag een
            beheerder om je rol onder Management → Users te wijzigen, of zet in Supabase in de
            tabel <code className="rounded bg-muted px-1">user_roles</code> je <code className="rounded bg-muted px-1">user_id</code> op{' '}
            <code className="rounded bg-muted px-1">role = &apos;admin&apos;</code>.
          </AlertDescription>
        </Alert>
      )}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Price request</h1>
      </div>

      {rfqs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No requests for quotation yet.</p>
            <p className="mt-1 text-sm text-muted-foreground/80">Create a new request to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="min-w-0 overflow-hidden">
          <CardContent className="min-w-0 overflow-hidden p-0">
            <DashboardRfqTable
              rfqs={rfqs}
              creatorEmailById={creatorEmailById}
              currentPage={currentPage}
              totalPages={totalPages}
              selectedRfqId={selectedRfqId}
              productTypeFilter={productTypeFilter}
              productTypes={productTypes}
              searchQuery={searchQuery}
            />
          </CardContent>
        </Card>
      )}

      <RfqDetailModal rfqId={selectedRfqId} refreshToken={new Date().toISOString()} userRole={user.role} />
    </div>
  );
}
