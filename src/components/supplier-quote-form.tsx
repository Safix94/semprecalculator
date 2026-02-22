'use client';

import { useState } from 'react';
import { submitQuote } from '@/actions/quote';

interface SupplierQuoteFormProps {
  rfqId: string;
  token: string;
}

export function SupplierQuoteForm({ rfqId, token }: SupplierQuoteFormProps) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]> | string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrors(null);

    const form = new FormData(e.currentTarget);
    const input = {
      basePrice: Number(form.get('basePrice')),
      volumeM3: Number(form.get('volumeM3')),
      leadTimeDays: form.get('leadTimeDays') ? Number(form.get('leadTimeDays')) : null,
      comment: (form.get('comment') as string) || null,
    };

    const result = await submitQuote(rfqId, token, input);

    if (result.error) {
      setErrors(result.error);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-green-200 p-8 text-center">
        <div className="text-green-600 text-4xl mb-4">✓</div>
        <h2 className="text-lg font-bold text-green-700 mb-2">Offerte ingediend</h2>
        <p className="text-gray-600">
          Bedankt voor uw offerte. U kunt deze pagina sluiten.
        </p>
      </div>
    );
  }

  const errorMessage =
    typeof errors === 'string'
      ? errors
      : errors && '_form' in errors
        ? errors._form?.[0]
        : null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Offerte indienen</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Basisprijs (EUR) *
            </label>
            <input
              name="basePrice"
              type="number"
              step="0.01"
              min="0.01"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
            {typeof errors === 'object' && errors?.basePrice && (
              <p className="text-red-600 text-xs mt-1">{errors.basePrice[0]}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Volume (m³) *
            </label>
            <input
              name="volumeM3"
              type="number"
              step="0.001"
              min="0.001"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.000"
            />
            {typeof errors === 'object' && errors?.volumeM3 && (
              <p className="text-red-600 text-xs mt-1">{errors.volumeM3[0]}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Levertijd (dagen, optioneel)
          </label>
          <input
            name="leadTimeDays"
            type="number"
            min="1"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Opmerking (optioneel)
          </label>
          <textarea
            name="comment"
            rows={3}
            maxLength={2000}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {errorMessage && (
          <p className="text-red-600 text-sm">{errorMessage}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Bezig met indienen...' : 'Offerte indienen'}
        </button>
      </form>
    </div>
  );
}
