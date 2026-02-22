'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createRfq } from '@/actions/rfq';

export function RfqCreateDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    const form = new FormData(e.currentTarget);
    const input = {
      customer_name: (form.get('customer_name') as string) || null,
      material: form.get('material') as string,
      length: Number(form.get('length')),
      width: Number(form.get('width')),
      height: Number(form.get('height')),
      thickness: Number(form.get('thickness')),
      shape: form.get('shape') as string,
      notes: (form.get('notes') as string) || null,
    };

    const result = await createRfq(input);

    if (result.error) {
      setErrors(result.error as Record<string, string[]>);
      setLoading(false);
      return;
    }

    setOpen(false);
    setLoading(false);
    if (result.data) {
      router.push(`/dashboard/rfqs/${result.data.id}`);
    }
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
      >
        Nieuwe aanvraag
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Nieuwe prijsaanvraag</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Klantnaam (optioneel)
            </label>
            <input
              name="customer_name"
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Materiaal *
              </label>
              <input
                name="material"
                type="text"
                required
                placeholder="bijv. teak, oak"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.material && (
                <p className="text-red-600 text-xs mt-1">{errors.material[0]}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vorm *
              </label>
              <input
                name="shape"
                type="text"
                required
                placeholder="bijv. plank, blok"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.shape && (
                <p className="text-red-600 text-xs mt-1">{errors.shape[0]}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Lengte (mm) *
              </label>
              <input
                name="length"
                type="number"
                step="any"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.length && (
                <p className="text-red-600 text-xs mt-1">{errors.length[0]}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Breedte (mm) *
              </label>
              <input
                name="width"
                type="number"
                step="any"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.width && (
                <p className="text-red-600 text-xs mt-1">{errors.width[0]}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hoogte (mm) *
              </label>
              <input
                name="height"
                type="number"
                step="any"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.height && (
                <p className="text-red-600 text-xs mt-1">{errors.height[0]}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dikte (mm) *
              </label>
              <input
                name="thickness"
                type="number"
                step="any"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.thickness && (
                <p className="text-red-600 text-xs mt-1">{errors.thickness[0]}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Opmerkingen
            </label>
            <textarea
              name="notes"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {errors._form && (
            <p className="text-red-600 text-sm">{errors._form[0]}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Bezig...' : 'Aanmaken'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
