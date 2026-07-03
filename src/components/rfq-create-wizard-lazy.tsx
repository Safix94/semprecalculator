'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

// Loaded lazily so the large create wizard stays out of the initial dashboard bundle.
const LazyWizard = dynamic(
  () => import('@/components/rfq-create-wizard').then((mod) => mod.RfqCreateWizard),
  {
    ssr: false,
    loading: () => (
      <Button size="sm" disabled>
        New request
      </Button>
    ),
  }
);

export function RfqCreateWizardLazy({ children }: { children?: ReactNode }) {
  return <LazyWizard>{children}</LazyWizard>;
}
