import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RfqCreateDialog } from '@/components/rfq-create-dialog';
import type { Rfq } from '@/types';

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'Concept', color: 'bg-gray-100 text-gray-700' },
  sent: { label: 'Verzonden', color: 'bg-blue-100 text-blue-700' },
  closed: { label: 'Gesloten', color: 'bg-green-100 text-green-700' },
};

export default async function DashboardPage() {
  await requireAuth();
  const supabase = await createClient();

  const { data: rfqs } = await supabase
    .from('rfqs')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Prijsaanvragen</h1>
        <RfqCreateDialog />
      </div>

      {!rfqs || rfqs.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Nog geen prijsaanvragen.</p>
          <p className="text-gray-400 text-sm mt-1">
            Maak een nieuwe aanvraag aan om te beginnen.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Materiaal</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Vorm</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Afmetingen</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Klant</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Datum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(rfqs as Rfq[]).map((rfq) => {
                const status = statusLabels[rfq.status] || statusLabels.draft;
                return (
                  <tr key={rfq.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/rfqs/${rfq.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {rfq.material}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{rfq.shape}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {rfq.length}x{rfq.width}x{rfq.height} (d:{rfq.thickness})
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {rfq.customer_name || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(rfq.created_at).toLocaleDateString('nl-NL')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
