'use client';

import type { RfqInvite, RfqQuote, Supplier } from '@/types';

interface QuoteComparisonProps {
  invites: (RfqInvite & { supplier: Supplier })[];
  quotes: (RfqQuote & { supplier: Supplier })[];
}

function getInviteStatus(invite: RfqInvite, hasQuote: boolean): { label: string; color: string } {
  if (invite.revoked_at) return { label: 'Ingetrokken', color: 'text-red-600' };
  if (hasQuote) return { label: 'Beantwoord', color: 'text-green-600' };
  if (new Date(invite.expires_at) < new Date()) return { label: 'Verlopen', color: 'text-orange-600' };
  return { label: 'In afwachting', color: 'text-blue-600' };
}

export function QuoteComparison({ invites, quotes }: QuoteComparisonProps) {
  // Find lowest final price
  const lowestPrice = quotes.length > 0
    ? Math.min(...quotes.map((q) => q.final_price_calculated))
    : null;

  // Map quotes by supplier
  const quoteBySupplier = new Map(quotes.map((q) => [q.supplier_id, q]));

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Offertevergelijking</h2>

      {invites.length === 0 ? (
        <p className="text-sm text-gray-500">Geen leveranciers uitgenodigd.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Leverancier</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Status</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Basisprijs</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Volume (m3)</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Verzendkosten</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Eindprijs</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Levertijd</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Opmerking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {invites.map((invite) => {
                const quote = quoteBySupplier.get(invite.supplier_id);
                const status = getInviteStatus(invite, !!quote);
                const isLowest = quote && quote.final_price_calculated === lowestPrice;

                return (
                  <tr
                    key={invite.id}
                    className={isLowest ? 'bg-green-50' : 'hover:bg-gray-50'}
                  >
                    <td className="px-4 py-3 text-sm font-medium">
                      {invite.supplier?.name ?? 'Onbekend'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {quote ? `€${Number(quote.base_price).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {quote ? Number(quote.volume_m3).toFixed(3) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {quote ? `€${Number(quote.shipping_cost_calculated).toFixed(3)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {quote ? (
                        <span className={`text-sm font-bold ${isLowest ? 'text-green-700' : ''}`}>
                          €{Number(quote.final_price_calculated).toFixed(2)}
                          {isLowest && ' ★'}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {quote?.lead_time_days ? `${quote.lead_time_days} dagen` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                      {quote?.comment || '-'}
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
