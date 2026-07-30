function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-ct-line rounded ${className}`} />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Shimmer className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-4 w-1/3 rounded-md" />
          <Shimmer className="h-3 w-1/2 rounded-md" />
        </div>
      </div>
      <Shimmer className="h-4 w-full rounded-md" />
      <Shimmer className="h-4 w-3/4 rounded-md" />
      <div className="flex gap-3">
        <Shimmer className="h-8 w-20 rounded-ct-sm" />
        <Shimmer className="h-8 w-20 rounded-ct-sm" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 bg-ct-surface rounded-ct-lg border border-ct-line">
          <Shimmer className="w-12 h-12 rounded-ct-md flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-4 w-2/5 rounded-md" />
            <Shimmer className="h-3 w-3/5 rounded-md" />
          </div>
          <Shimmer className="h-8 w-24 rounded-ct-sm flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-ct-surface rounded-ct-lg border border-ct-line p-6">
          <div className="flex items-center gap-4">
            <Shimmer className="w-12 h-12 rounded-ct-md" />
            <div className="space-y-2 flex-1">
              <Shimmer className="h-3 w-2/3 rounded-md" />
              <Shimmer className="h-7 w-1/3 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Shimmer className="h-5 w-5 rounded" />
        <Shimmer className="h-5 w-32 rounded-md" />
        <Shimmer className="h-5 w-5 rounded" />
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <Shimmer key={`h-${i}`} className="h-4 rounded" />
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <Shimmer key={i} className="aspect-square rounded-ct-sm" />
        ))}
      </div>
    </div>
  );
}
