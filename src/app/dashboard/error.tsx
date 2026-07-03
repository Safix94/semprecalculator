'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <Card className="mx-auto mt-12 w-full max-w-md">
      <CardContent className="space-y-4 p-8 text-center">
        <h1 className="text-xl font-bold text-destructive">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          The dashboard could not be loaded. Please try again.
        </p>
        <Button onClick={reset}>Try again</Button>
      </CardContent>
    </Card>
  );
}
