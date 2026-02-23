import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RfqCreateWizard } from '@/components/rfq-create-wizard';
import type { Rfq } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-secondary text-secondary-foreground' },
  sent: { label: 'Sent', color: 'bg-primary/15 text-primary' },
  closed: { label: 'Closed', color: 'bg-accent text-accent-foreground' },
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
        <h1 className="text-2xl font-bold tracking-tight">Requests for quotation</h1>
        <RfqCreateWizard />
      </div>

      {!rfqs || rfqs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No requests for quotation yet.</p>
            <p className="text-muted-foreground/80 text-sm mt-1">Create a new request to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Material</TableHead>
                  <TableHead>Finish</TableHead>
                  <TableHead>Shape</TableHead>
                  <TableHead>Dimensions</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rfqs as Rfq[]).map((rfq) => {
                  const status = statusLabels[rfq.status] || statusLabels.draft;
                  return (
                    <TableRow key={rfq.id}>
                      <TableCell>
                        <Link href={`/dashboard/rfqs/${rfq.id}`} className="text-primary hover:underline font-medium">
                          {rfq.material}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{rfq.finish || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{rfq.shape}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {rfq.length}x{rfq.width}x{rfq.height} (d:{rfq.thickness})
                      </TableCell>
                      <TableCell className="text-muted-foreground">{rfq.customer_name || '-'}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(rfq.created_at).toLocaleDateString('en-GB')}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
