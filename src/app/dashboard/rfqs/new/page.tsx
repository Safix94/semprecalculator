import { requireAuth } from '@/lib/auth';
import { getOwnFabrics } from '@/actions/own-fabrics';
import { RfqCreateWizard } from '@/components/rfq-create-wizard';

export default async function NewRfqPage() {
  await requireAuth();
  const ownFabrics = await getOwnFabrics();

  return <RfqCreateWizard ownFabrics={ownFabrics} />;
}
