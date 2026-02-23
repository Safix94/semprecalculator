'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { AuditLog } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
  const [action, setAction] = useState(filters.action || 'all');
  const [entityId, setEntityId] = useState(filters.entity_id || '');

  function applyFilters() {
    const params = new URLSearchParams();
    if (action && action !== 'all') params.set('action', action);
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
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="action-filter" className="text-xs text-muted-foreground">
                Actie
              </Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger id="action-filter" className="w-[220px]">
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {ACTIONS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entity-filter" className="text-xs text-muted-foreground">
                Entity ID
              </Label>
              <Input
                id="entity-filter"
                type="text"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="RFQ of Supplier ID"
              />
            </div>
            <Button onClick={applyFilters}>Filteren</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Datum</TableHead>
                <TableHead>Actie</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Metadata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Geen logs gevonden.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('nl-NL')}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs font-medium">
                        {log.action}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <span className="text-muted-foreground/70">{log.actor_type}:</span>{' '}
                      {log.actor_id.substring(0, 8)}...
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.entity_type}: {log.entity_id.substring(0, 8)}...
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                      {JSON.stringify(log.metadata)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {currentPage} van {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              variant="outline"
              size="sm"
            >
              Vorige
            </Button>
            <Button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              variant="outline"
              size="sm"
            >
              Volgende
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
