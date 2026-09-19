export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Banner Skeleton */}
      <div className="h-44 w-full rounded-2xl bg-brand-ink/10" />

      {/* Services Title Skeleton */}
      <div className="h-6 w-36 rounded-md bg-muted" />

      {/* Services List Skeleton */}
      <div className="space-y-3">
        <div className="h-4 w-28 rounded-md bg-muted" />
        <div className="space-y-2 rounded-xl border border-border p-4">
          <div className="flex justify-between items-center py-2">
            <div className="space-y-1.5">
              <div className="h-4 w-40 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted/60" />
            </div>
            <div className="h-4 w-14 rounded bg-muted" />
          </div>
          <div className="flex justify-between items-center py-2 border-t border-border/50">
            <div className="space-y-1.5">
              <div className="h-4 w-36 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted/60" />
            </div>
            <div className="h-4 w-16 rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
