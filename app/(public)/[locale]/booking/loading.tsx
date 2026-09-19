export default function BookingLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Page Title Skeleton */}
      <div className="h-8 w-48 rounded-md bg-muted" />

      {/* Steps Pill Indicator Skeleton */}
      <div className="flex gap-2">
        <div className="h-8 w-24 rounded-full bg-brand-gold/20" />
        <div className="h-8 w-24 rounded-full bg-muted" />
        <div className="h-8 w-24 rounded-full bg-muted" />
      </div>

      {/* Main Card Skeleton */}
      <div className="space-y-4 rounded-xl border border-border p-4">
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="space-y-3">
          <div className="h-14 w-full rounded-lg bg-muted/60" />
          <div className="h-14 w-full rounded-lg bg-muted/60" />
          <div className="h-14 w-full rounded-lg bg-muted/60" />
        </div>
      </div>
    </div>
  );
}
