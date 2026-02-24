import { requireRole } from '@/lib/auth';
import { getMaterials } from '@/actions/materials';
import { getProductTypes } from '@/actions/product-types';
import { getSuppliers } from '@/actions/suppliers';
import { listUsersWithRoles } from '@/actions/users';
import { MaterialManagement } from '@/components/material-management';
import { ProductTypeManagement } from '@/components/product-type-management';
import { SupplierManagement } from '@/components/supplier-management';
import { UserRoleManagement } from '@/components/user-role-management';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default async function ManagementPage() {
  const currentUser = await requireRole('admin');

  const [materials, suppliers, users, productTypesResult] = await Promise.all([
    getMaterials(),
    getSuppliers(),
    listUsersWithRoles(),
    getProductTypes(),
  ]);
  const productTypes = 'data' in productTypesResult ? productTypesResult.data : [];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Management</h1>
        <p className="text-muted-foreground">Manage materials, suppliers, product types, and user roles.</p>
      </div>

      <Tabs defaultValue="materials">
        <TabsList>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="product-types">Product types</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="materials">
          <MaterialManagement materials={materials} suppliers={suppliers} />
        </TabsContent>
        <TabsContent value="suppliers">
          <SupplierManagement suppliers={suppliers} materials={materials} />
        </TabsContent>
        <TabsContent value="product-types">
          <ProductTypeManagement productTypes={productTypes} />
        </TabsContent>
        <TabsContent value="users">
          <UserRoleManagement users={users} currentUserId={currentUser.id} />
        </TabsContent>
      </Tabs>
    </>
  );
}
