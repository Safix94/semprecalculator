'use client';

import type { ComponentType, ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, ScrollText, Settings } from 'lucide-react';
import { LogoutButton } from '@/components/logout-button';
import { RfqCreateWizard } from '@/components/rfq-create-wizard';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import type { AuthUser } from '@/types';

interface AppSidebarLayoutProps {
  user: AuthUser;
  children: ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Price request', href: '/dashboard', icon: FileText },
  { label: 'Management', href: '/admin/management', icon: Settings, adminOnly: true },
  { label: 'Audit Logs', href: '/admin/logs', icon: ScrollText, adminOnly: true },
];

function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebarLayout({ user, children }: AppSidebarLayoutProps) {
  const pathname = usePathname();
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || user.role === 'admin');

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="sidebar">
        <SidebarHeader>
          <Link
            href="/dashboard"
            className="focus-visible:ring-ring flex h-9 items-center rounded-md px-2 outline-none focus-visible:ring-2"
          >
            <Image
              src="/sempre-logo-word.svg"
              alt="Sempre"
              width={130}
              height={17}
              className="h-5 w-auto group-data-[collapsible=icon]:hidden"
              priority
            />
            <span className="bg-primary text-primary-foreground hidden size-7 items-center justify-center rounded-md text-xs font-semibold group-data-[collapsible=icon]:inline-flex">
              S
            </span>
          </Link>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleNavItems.map((item) => {
                  const active = isNavItemActive(pathname, item.href);
                  const Icon = item.icon;

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link href={item.href}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarSeparator />
        <SidebarFooter>
          <p className="text-sidebar-foreground/70 truncate px-2 text-xs group-data-[collapsible=icon]:hidden">
            {user.email}
          </p>
          <SidebarTrigger className="mt-2 w-full justify-center" />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground sm:hidden">Sempre</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <span className="hidden text-sm text-muted-foreground md:inline">
                {user.email} ({user.role})
              </span>
              <RfqCreateWizard>
                <Button size="sm">New request</Button>
              </RfqCreateWizard>
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
