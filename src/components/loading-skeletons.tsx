import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function TablePageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="min-w-0">
      <div className="mb-6">
        <Skeleton className="h-8 w-56" />
      </div>
      <Card className="min-w-0 overflow-hidden">
        <CardContent className="min-w-0 space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-40" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: rows }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="min-w-0 space-y-6">
      <Skeleton className="h-8 w-72" />
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
