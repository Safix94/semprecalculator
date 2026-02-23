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
  draft: { label: 'Concept', color: 'bg-secondary text-secondary-foreground' },
  sent: { label: 'Verzonden', color: 'bg-primary/15 text-primary' },
  closed: { label: 'Gesloten', color: 'bg-accent text-accent-foreground' },
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
        <h1 className="text-2xl font-bold tracking-tight">Prijsaanvragen</h1>
        <RfqCreateWizard />
      </div>

      {!rfqs || rfqs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Nog geen prijsaanvragen.</p>
            <p className="text-muted-foreground/80 text-sm mt-1">Maak een nieuwe aanvraag aan om te beginnen.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Materiaal</TableHead>
                  <TableHead>Afwerking</TableHead>
                  <TableHead>Vorm</TableHead>
                  <TableHead>Afmetingen</TableHead>
                  <TableHead>Klant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Datum</TableHead>
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
                        {new Date(rfq.created_at).toLocaleDateString('nl-NL')}
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
