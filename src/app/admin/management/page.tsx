import { requireRole } from '@/lib/auth';
import { getFinishOptions } from '@/actions/finish-options';
import { getMaterials } from '@/actions/materials';
import { getProductTypes } from '@/actions/product-types';
import { getPricingSettings } from '@/actions/pricing-settings';
import { getSuppliers } from '@/actions/suppliers';
import { listUsersWithRoles } from '@/actions/users';
import { FinishOptionManagement } from '@/components/finish-option-management';
import { MaterialManagement } from '@/components/material-management';
import { PricingSettingsManagement } from '@/components/pricing-settings-management';
import { ProductTypeManagement } from '@/components/product-type-management';
import { SupplierManagement } from '@/components/supplier-management';
import { UserRoleManagement } from '@/components/user-role-management';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default async function ManagementPage() {
  const currentUser = await requireRole('sales');

  const [materials, suppliers, productTypesResult, pricingSettings, finishOptions, users] = await Promise.all([
    getMaterials(),
    getSuppliers(),
    getProductTypes(),
    getPricingSettings(),
    getFinishOptions(),
    currentUser.role === 'admin' ? listUsersWithRoles() : Promise.resolve([]),
  ]);
  const productTypes = 'data' in productTypesResult ? productTypesResult.data : [];

  return (
    <>
      <div className="mb-[18px]">
        <h1 className="sempre-page-title">Beheer</h1>
        <p className="sempre-page-subtitle">
          Beheer pricing, materialen, afwerkingen, leveranciers, producttypes en gebruikersrollen.
        </p>
      </div>

      <Tabs defaultValue="pricing" className="gap-[18px]">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="materials">Materialen</TabsTrigger>
          <TabsTrigger value="finishes">Afwerkingen</TabsTrigger>
          <TabsTrigger value="suppliers">Leveranciers</TabsTrigger>
          <TabsTrigger value="product-types">Producttypes</TabsTrigger>
          {currentUser.role === 'admin' && <TabsTrigger value="users">Gebruikers</TabsTrigger>}
        </TabsList>
        <TabsContent value="pricing">
          <PricingSettingsManagement settings={pricingSettings} />
        </TabsContent>
        <TabsContent value="materials">
          <MaterialManagement
            materials={materials}
            suppliers={suppliers}
            productTypes={productTypes}
            finishOptions={finishOptions}
          />
        </TabsContent>
        <TabsContent value="finishes">
          <FinishOptionManagement finishOptions={finishOptions} />
        </TabsContent>
        <TabsContent value="suppliers">
          <SupplierManagement suppliers={suppliers} materials={materials} />
        </TabsContent>
        <TabsContent value="product-types">
          <ProductTypeManagement productTypes={productTypes} />
        </TabsContent>
        {currentUser.role === 'admin' && (
          <TabsContent value="users">
            <UserRoleManagement users={users} currentUserId={currentUser.id} />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
