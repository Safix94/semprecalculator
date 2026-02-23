import { requireRole } from '@/lib/auth';
import { getMaterials } from '@/actions/materials';
import { createClient } from '@/lib/supabase/server';
import { MaterialManagement } from '@/components/material-management';
import type { Supplier } from '@/types';

export default async function MaterialsPage() {
  await requireRole('admin');
  
  // Fetch materials and suppliers
  const [materials, suppliers] = await Promise.all([
    getMaterials(),
    getSuppliers()
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Materiaalbeheer</h1>
        <p className="text-muted-foreground">Beheer materialen en koppel ze aan leveranciers.</p>
      </div>

      <MaterialManagement materials={materials} suppliers={suppliers} />
    </div>
  );
}

async function getSuppliers(): Promise<Supplier[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) {
    throw new Error(`Failed to fetch suppliers: ${error.message}`);
  }

  return data;
}