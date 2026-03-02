import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AppSidebarLayout } from '@/components/app-sidebar-layout';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return <AppSidebarLayout user={user}>{children}</AppSidebarLayout>;
}
