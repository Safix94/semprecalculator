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
        <h1 className="text-2xl font-bold tracking-tight">Material management</h1>
        <p className="text-muted-foreground">Manage materials and link them to suppliers.</p>
      </div>

      <MaterialManagement materials={materials} suppliers={suppliers} />
    </div>
  );
}

async function getSuppliers(): Promise<Supplier[]> {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Failed to fetch suppliers:', error.message);
      return [];
    }

    return data ?? [];
  } catch (error) {
    console.error('Failed to fetch suppliers:', error);
    return [];
  }
}
