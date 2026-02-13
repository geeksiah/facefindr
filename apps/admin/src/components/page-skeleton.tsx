interface PageSkeletonProps {
  titleWidthClass?: string;
}

export function PageSkeleton({ titleWidthClass = 'w-56' }: PageSkeletonProps) {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className={`h-8 animate-pulse rounded bg-muted ${titleWidthClass}`} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl border border-border bg-card" />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((key) => (
          <div key={key} className="h-56 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}

