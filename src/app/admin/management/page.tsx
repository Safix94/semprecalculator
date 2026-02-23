import { requireRole } from '@/lib/auth';
import { getMaterials } from '@/actions/materials';
import { getSuppliers } from '@/actions/suppliers';
import { MaterialManagement } from '@/components/material-management';
import { SupplierManagement } from '@/components/supplier-management';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default async function ManagementPage() {
  await requireRole('admin');

  const [materials, suppliers] = await Promise.all([
    getMaterials(),
    getSuppliers(),
  ]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Management</h1>
        <p className="text-muted-foreground">Manage materials and suppliers.</p>
      </div>

      <Tabs defaultValue="materials">
        <TabsList>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
        </TabsList>
        <TabsContent value="materials">
          <MaterialManagement materials={materials} suppliers={suppliers} />
        </TabsContent>
        <TabsContent value="suppliers">
          <SupplierManagement suppliers={suppliers} />
        </TabsContent>
      </Tabs>
    </>
  );
}
