'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { AuditLog } from '@/types';

interface AuditLogTableProps {
  logs: AuditLog[];
  currentPage: number;
  totalPages: number;
  filters: {
    action?: string;
    entity_id?: string;
    actor_id?: string;
    from?: string;
    to?: string;
  };
}

const ACTIONS = [
  'RFQ_CREATED',
  'RFQ_UPDATED',
  'RFQ_SENT',
  'INVITE_CREATED',
  'INVITE_OPENED',
  'INVITE_REVOKED',
  'QUOTE_SUBMITTED',
  'EMAIL_SENT',
];

export function AuditLogTable({ logs, currentPage, totalPages, filters }: AuditLogTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [action, setAction] = useState(filters.action || '');
  const [entityId, setEntityId] = useState(filters.entity_id || '');

  function applyFilters() {
    const params = new URLSearchParams();
    if (action) params.set('action', action);
    if (entityId) params.set('entity_id', entityId);
    params.set('page', '1');
    router.push(`/admin/logs?${params.toString()}`);
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`/admin/logs?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Actie</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Alle</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Entity ID</label>
            <input
              type="text"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="RFQ of Supplier ID"
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={applyFilters}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
          >
            Filteren
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Datum</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Actie</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Actor</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Entity</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">
                  Geen logs gevonden.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('nl-NL')}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    <span className="text-gray-400">{log.actor_type}:</span>{' '}
                    {log.actor_id.substring(0, 8)}...
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {log.entity_type}: {log.entity_id.substring(0, 8)}...
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[300px] truncate">
                    {JSON.stringify(log.metadata)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Pagina {currentPage} van {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50 transition-colors"
            >
              Vorige
            </button>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50 transition-colors"
            >
              Volgende
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
