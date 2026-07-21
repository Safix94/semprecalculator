import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getUserEmailMap } from '@/lib/user-directory';
import { DashboardRfqTable, type DashboardRfqInvite } from '@/components/dashboard-rfq-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { getProductTypes } from '@/actions/product-types';
import type { Rfq, RfqStatus, Supplier } from '@/types';

interface DashboardPageProps {
  searchParams?: Promise<{
    page?: string | string[];
    rfq?: string | string[];
    product_type?: string | string[];
    supplier?: string | string[];
    status?: string | string[];
    search?: string | string[];
    admin_required?: string | string[];
  }>;
}

const PAGE_SIZE = 20;
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

function getStringParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function isRfqStatus(value: string | null): value is RfqStatus {
  return Boolean(value && statusOptions.includes(value as RfqStatus));
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireAuth();
  const params = searchParams ? await searchParams : {};
  const pageParam = getStringParam(params.page) ?? '1';
  const adminRequired = getStringParam(params.admin_required) === '1';
  const selectedRfqId = getStringParam(params.rfq) ?? null;
  const productTypeParam = getStringParam(params.product_type) ?? null;
  const supplierFilter = getStringParam(params.supplier)?.trim() || null;
  const rawStatusFilter = getStringParam(params.status)?.trim() || null;
  const statusFilter = isRfqStatus(rawStatusFilter) ? rawStatusFilter : null;
  const searchQuery = getStringParam(params.search)?.trim() ?? null;
  const parsedPage = Number.parseInt(pageParam, 10);
  const requestedPage = Number.isNaN(parsedPage) ? 1 : Math.max(parsedPage, 1);
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Stage A: independent lookups in parallel.
  const [productTypeResult, supplierOptionsResult, supplierInviteResult, thisMonthCountResult] = await Promise.all([
    getProductTypes(),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supplierFilter
      ? supabase.from('rfq_invites').select('rfq_id').eq('supplier_id', supplierFilter)
      : Promise.resolve(null),
    supabase
      .from('rfqs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString()),
  ]);

  const thisMonthCount = thisMonthCountResult.count ?? 0;

  const productTypes = 'data' in productTypeResult
    ? productTypeResult.data.map((productType) => productType.name)
    : [];
  const productTypeNameSet = new Set(productTypes);
  const productTypeFilter = productTypeParam
    ? (productTypes.length === 0 || productTypeNameSet.has(productTypeParam) ? productTypeParam : null)
    : null;

  const { data: supplierOptionsData, error: supplierOptionsError } = supplierOptionsResult;

  if (supplierOptionsError) {
    console.error('Failed to fetch supplier filter options:', supplierOptionsError.message);
  }

  let supplierRfqIds: string[] | null = null;
  if (supplierFilter && supplierInviteResult) {
    const { data: supplierInviteRows, error: supplierInviteError } = supplierInviteResult;

    if (supplierInviteError) {
      console.error('Failed to fetch RFQs for supplier filter:', supplierInviteError.message);
      supplierRfqIds = [];
    } else {
      supplierRfqIds = [...new Set((supplierInviteRows ?? []).map((row) => row.rfq_id).filter(Boolean))];
    }
  }

  const hasNoSupplierMatches = Boolean(supplierFilter && supplierRfqIds && supplierRfqIds.length === 0);

  let totalCount = 0;
  let currentPage = 1;
  let rfqs: Rfq[] = [];

  if (!hasNoSupplierMatches) {
    const fetchRfqPage = async (page: number): Promise<Rfq[]> => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let rfqsQuery = supabase
        .from('rfqs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);
      if (productTypeFilter) {
        rfqsQuery = rfqsQuery.eq('product_type', productTypeFilter);
      }
      if (statusFilter) {
        rfqsQuery = rfqsQuery.eq('status', statusFilter);
      }
      if (searchQuery) {
        rfqsQuery = rfqsQuery.ilike('customer_name', `%${searchQuery}%`);
      }
      if (supplierRfqIds) {
        rfqsQuery = rfqsQuery.in('id', supplierRfqIds);
      }
      const { data: rfqsData, error: rfqsError } = await rfqsQuery;

      if (rfqsError) {
        console.error('Failed to fetch paginated RFQs:', rfqsError.message);
      }

      return (rfqsData ?? []) as Rfq[];
    };

    let countQuery = supabase.from('rfqs').select('id', { count: 'exact', head: true });
    if (productTypeFilter) {
      countQuery = countQuery.eq('product_type', productTypeFilter);
    }
    if (statusFilter) {
      countQuery = countQuery.eq('status', statusFilter);
    }
    if (searchQuery) {
      countQuery = countQuery.ilike('customer_name', `%${searchQuery}%`);
    }
    if (supplierRfqIds) {
      countQuery = countQuery.in('id', supplierRfqIds);
    }

    // Stage B: count and the requested page in parallel; only refetch when the
    // requested page turns out to be beyond the last page (rare).
    const [{ count, error: countError }, requestedRows] = await Promise.all([
      countQuery,
      fetchRfqPage(requestedPage),
    ]);

    if (countError) {
      console.error('Failed to count RFQs:', countError.message);
    }

    totalCount = count ?? 0;
    const totalPagesForFetch = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    currentPage = Math.min(requestedPage, totalPagesForFetch);
    rfqs = currentPage === requestedPage ? requestedRows : await fetchRfqPage(currentPage);
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const creatorEmailById: Record<string, string> = {};
  const creatorIds = [...new Set(rfqs.map((rfq) => rfq.created_by).filter(Boolean))];

  const invitesByRfqId: Record<string, DashboardRfqInvite[]> = {};
  const rfqIds = rfqs.map((rfq) => rfq.id);

  // Stage C: both depend only on the fetched RFQ page — run them in parallel.
  await Promise.all([
    (async () => {
      if (rfqIds.length === 0) {
        return;
      }

      const { data: inviteRows, error: inviteRowsError } = await supabase
        .from('rfq_invites')
        .select('id, rfq_id, supplier_id, invite_part, supplier:suppliers(id, name)')
        .in('rfq_id', rfqIds)
        .order('created_at', { ascending: true });

      if (inviteRowsError) {
        console.error('Failed to fetch RFQ suppliers:', inviteRowsError.message);
      } else {
        (inviteRows ?? []).forEach((invite) => {
          const supplier = Array.isArray(invite.supplier) ? invite.supplier[0] ?? null : invite.supplier ?? null;
          const typedInvite: DashboardRfqInvite = {
            id: invite.id,
            rfq_id: invite.rfq_id,
            supplier_id: invite.supplier_id,
            invite_part: invite.invite_part,
            supplier,
          };
          invitesByRfqId[typedInvite.rfq_id] = [...(invitesByRfqId[typedInvite.rfq_id] ?? []), typedInvite];
        });
      }
    })(),
    (async () => {
      if (creatorIds.length === 0) {
        return;
      }

      try {
        const emailMap = await getUserEmailMap();
        creatorIds.forEach((creatorId) => {
          const email = emailMap.get(creatorId);
          if (email) {
            creatorEmailById[creatorId] = email;
          }
        });
      } catch (error) {
        console.error('Failed to resolve RFQ creator emails:', error);
      }
    })(),
  ]);

  return (
    <div className="min-w-0">
      {adminRequired && (
        <Alert variant="default" className="mb-6 border-amber-500/50 bg-amber-500/10">
          <AlertDescription>
            You do not have admin access to Audit Logs and user management. Your current role is{' '}
            <strong>{user.role === 'sales' ? 'Sales' : user.role ?? 'unknown'}</strong>. Ask an
            administrator to change your role under Management → Users, or set your <code className="rounded bg-muted px-1">user_id</code> in the Supabase{' '}
            <code className="rounded bg-muted px-1">user_roles</code> table to{' '}
            <code className="rounded bg-muted px-1">role = &apos;admin&apos;</code>.
          </AlertDescription>
        </Alert>
      )}
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="sempre-page-title">Price requests</h1>
          <p className="sempre-page-subtitle">Overview of all RFQs · each request is sent to one supplier</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="text-right">
            <div className="sempre-label">Open</div>
            <div className="text-[19px] font-bold text-[oklch(0.42_0.07_150)]">
              {rfqs.filter((rfq) => rfq.status !== 'closed').length}
            </div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-right">
            <div className="sempre-label">Awaiting quote</div>
            <div className="text-[19px] font-bold">
              {rfqs.filter((rfq) => rfq.status === 'sent_to_supplier' || rfq.status === 'supplier_replied').length}
            </div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-right">
            <div className="sempre-label">This month</div>
            <div className="text-[19px] font-bold">{thisMonthCount}</div>
          </div>
        </div>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardContent className="min-w-0 overflow-hidden p-0">
          <DashboardRfqTable
            rfqs={rfqs}
            invitesByRfqId={invitesByRfqId}
            creatorEmailById={creatorEmailById}
            currentPage={currentPage}
            totalPages={totalPages}
            selectedRfqId={selectedRfqId}
            productTypeFilter={productTypeFilter}
            productTypes={productTypes}
            supplierFilter={supplierFilter}
            supplierOptions={(supplierOptionsData as Pick<Supplier, 'id' | 'name'>[]) ?? []}
            statusFilter={statusFilter}
            statusOptions={statusOptions}
            searchQuery={searchQuery}
          />
        </CardContent>
      </Card>
    </div>
  );
}
