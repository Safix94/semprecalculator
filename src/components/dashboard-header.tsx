"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Sheet, SheetContent, SheetFooter } from "@/components/ui/sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { MenuToggle } from "@/components/ui/menu-toggle";
import { LogoutButton } from "@/components/logout-button";
import { RfqCreateWizard } from "@/components/rfq-create-wizard";
import type { AuthUser } from "@/types";

interface DashboardHeaderProps {
  user: AuthUser;
}

const navLinks = [
  { label: "Price request", href: "/dashboard" },
  { label: "Management", href: "/admin/management", adminOnly: true },
  { label: "Audit Logs", href: "/admin/logs", adminOnly: true },
];

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const [open, setOpen] = React.useState(false);
  const isAdmin = user.role === "admin";
  const links = navLinks.filter((link) => !link.adminOnly || isAdmin);

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-50 w-full border-b border-border backdrop-blur-lg">
      <nav className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6 lg:gap-8">
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
          <div className="hidden items-center gap-1 lg:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <span className="text-sm text-muted-foreground">
            {user.email} ({user.role})
          </span>
          <RfqCreateWizard>
            <Button size="sm">New request</Button>
          </RfqCreateWizard>
          <LogoutButton />
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            <MenuToggle
              strokeWidth={2.5}
              open={open}
              onOpenChange={setOpen}
              className="size-6"
            />
          </Button>
          <SheetContent
            side="left"
            showClose={false}
            className="flex flex-col gap-0 bg-background/95 supports-[backdrop-filter]:bg-background/80 backdrop-blur-lg"
          >
            <div className="grid gap-1 overflow-y-auto px-4 pt-12 pb-4">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={buttonVariants({
                    variant: "ghost",
                    className: "justify-start",
                  })}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="mt-auto border-t border-border px-4 py-4">
              <p className="mb-3 text-sm text-muted-foreground">
                {user.email} ({user.role})
              </p>
              <SheetFooter className="flex-row gap-2">
                <RfqCreateWizard>
                  <Button size="sm" className="flex-1">
                    New request
                  </Button>
                </RfqCreateWizard>
                <LogoutButton />
              </SheetFooter>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}
