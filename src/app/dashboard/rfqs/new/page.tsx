import { requireAuth } from '@/lib/auth';
import { RfqCreateWizard } from '@/components/rfq-create-wizard';

export default async function NewRfqPage() {
  await requireAuth();

  return <RfqCreateWizard />;
}
