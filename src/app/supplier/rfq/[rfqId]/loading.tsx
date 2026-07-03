import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function SupplierRfqLoading() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 supports-[backdrop-filter]:bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center px-4">
          <Image
            src="/sempre-logo-word.svg"
            alt="Sempre"
            width={130}
            height={17}
            className="h-5 w-auto"
            priority
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <Card className="mb-6">
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="h-6 w-64" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-1/2" />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
