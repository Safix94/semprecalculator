import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { LogoutButton } from '@/components/logout-button';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 items-center">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="flex items-center">
                <Image
                  src="/sempre-logo-word.svg"
                  alt="Sempre"
                  width={130}
                  height={17}
                  className="h-5 w-auto"
                  priority
                />
              </Link>
              <div className="flex gap-4">
                <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  RFQs
                </Link>
                {user.role === 'admin' && (
                  <>
                    <Link
                      href="/admin/management"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Management
                    </Link>
                    <Link
                      href="/admin/logs"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Audit Logs
                    </Link>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {user.email} ({user.role})
              </span>
              <LogoutButton />
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
