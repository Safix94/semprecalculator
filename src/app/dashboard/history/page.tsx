import { getProductTypes } from '@/actions/product-types';
import { searchRfqs, type SearchRfqsInput } from '@/actions/rfq-search';
import { getSuppliers } from '@/actions/suppliers';
import { RfqHistorySearch, type RfqHistoryFilters } from '@/components/rfq-history-search';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface HistoryPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function getStringParam(value?: string | string[]): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function getFilters(params: Record<string, string | string[] | undefined>): RfqHistoryFilters {
  return {
    q: getStringParam(params.q).trim(),
    supplier: getStringParam(params.supplier).trim(),
    productType: getStringParam(params.productType).trim(),
    material: getStringParam(params.material).trim(),
    finish: getStringParam(params.finish).trim(),
    shape: getStringParam(params.shape).trim(),
    status: getStringParam(params.status).trim(),
    createdFrom: getStringParam(params.createdFrom).trim(),
    createdTo: getStringParam(params.createdTo).trim(),
    length: getStringParam(params.length).trim(),
    width: getStringParam(params.width).trim(),
    height: getStringParam(params.height).trim(),
    thickness: getStringParam(params.thickness).trim(),
  };
}

function getPage(params: Record<string, string | string[] | undefined>): number {
  const parsed = Number.parseInt(getStringParam(params.page), 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
}

export default async function RfqHistoryPage({ searchParams }: HistoryPageProps) {
  const params = searchParams ? await searchParams : {};
  const filters = getFilters(params);
  const page = getPage(params);

  const [searchResult, productTypeResult, suppliers] = await Promise.all([
    searchRfqs({
      ...filters,
      page,
    } satisfies SearchRfqsInput),
    getProductTypes(),
    getSuppliers(),
  ]);

  const productTypes = 'data' in productTypeResult
    ? productTypeResult.data.map((productType) => productType.name)
    : [];

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">RFQ history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search previous requests by supplier, product type, material, finish, dimensions, date, and status.
        </p>
      </div>

      {'error' in searchResult ? (
        <Alert variant="destructive">
          <AlertDescription>{searchResult.error}</AlertDescription>
        </Alert>
      ) : (
        <RfqHistorySearch
          search={searchResult.data}
          filters={filters}
          productTypes={productTypes}
          suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
        />
      )}
    </div>
  );
}
