import { Skeleton } from "@/components/ui/skeleton";

// Suspense fallback for dashboard route transitions. The dashboard layout (shell)
// stays mounted; only this content area swaps in while the next page loads.
// Per-feature loading.tsx files (e.g. a customers-table skeleton) follow this
// same pattern — copy this file into a segment to add one.
const statCardKeys = ["stat-1", "stat-2", "stat-3"];
const rowKeys = ["row-1", "row-2", "row-3", "row-4", "row-5"];

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Stat-card row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCardKeys.map((key) => (
          <Skeleton key={key} className="h-28 w-full rounded-xl" />
        ))}
      </div>

      {/* Content / table block */}
      <div className="space-y-3">
        {rowKeys.map((key) => (
          <Skeleton key={key} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
