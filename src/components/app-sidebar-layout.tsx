'use client';

import type { CSSProperties, ComponentType, ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Plus, Search, ScrollText, Settings } from 'lucide-react';
import { LogoutButton } from '@/components/logout-button';
import { RfqCreateWizardLazy } from '@/components/rfq-create-wizard-lazy';
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
  { label: 'RFQ history', href: '/dashboard/history', icon: Search },
  { label: 'Management', href: '/admin/management', icon: Settings },
  { label: 'Audit Logs', href: '/admin/logs', icon: ScrollText, adminOnly: true },
];

function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebarLayout({ user, children }: AppSidebarLayoutProps) {
  const pathname = usePathname();
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || user.role === 'admin');

  return (
    <SidebarProvider
      style={{
        '--sidebar-width': '238px',
        '--sidebar-width-icon': '52px',
      } as CSSProperties}
    >
      <Sidebar collapsible="icon" variant="sidebar" className="border-sidebar-border bg-sidebar">
        <SidebarHeader className="h-[60px] justify-center border-b border-sidebar-border px-5">
          <Link
            href="/dashboard"
            className="focus-visible:ring-ring flex h-9 items-center rounded-md outline-none focus-visible:ring-2"
          >
            <Image
              src="/sempre-logo-word.svg"
              alt="Sempre"
              width={130}
              height={17}
              className="h-5 w-auto group-data-[collapsible=icon]:hidden"
              priority
            />
            <Image
              src="/icon.svg"
              alt="Sempre"
              width={28}
              height={28}
              className="hidden size-7 rounded-md object-contain group-data-[collapsible=icon]:block"
            />
          </Link>
        </SidebarHeader>
        <SidebarContent className="bg-sidebar">
          <SidebarGroup className="px-3 py-3">
            <div className="sempre-label px-3 pb-2 pt-1 group-data-[collapsible=icon]:hidden">Menu</div>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {visibleNavItems.map((item) => {
                  const active = isNavItemActive(pathname, item.href);
                  const Icon = item.icon;

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className="h-[38px] rounded-lg px-3 text-[13.5px] font-medium data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground"
                      >
                        <Link href={item.href}>
                          <Icon className="size-[17px]" />
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
        <SidebarFooter className="gap-0 px-4 py-3">
          <p className="truncate text-xs text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden">
            {user.email}
          </p>
          <p className="mt-0.5 text-[11px] capitalize text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
            {user.role}
          </p>
          <SidebarTrigger className="mt-3 w-full justify-center" />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-30 h-[60px] border-b border-border bg-card">
          <div className="flex h-full w-full max-w-[1520px] items-center justify-between px-7">
            <span className="sempre-label">Sempre pricing</span>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <span className="hidden text-[12.5px] text-muted-foreground md:inline">
                {user.email} · <span className="capitalize">{user.role}</span>
              </span>
              <RfqCreateWizardLazy>
                <Button size="sm">
                  <Plus className="size-[15px]" />
                  Nieuwe aanvraag
                </Button>
              </RfqCreateWizardLazy>
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="w-full max-w-[1520px] flex-1 px-[30px] py-[26px]">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
