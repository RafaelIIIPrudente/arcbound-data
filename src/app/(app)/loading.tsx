import { Skeleton } from "@/components/ui/skeleton";

// Suspense fallback for the (app) group. Shaped like the dashboard (its primary
// consumer: KPI grid + charts + recent-posts table); it also serves as the
// fallback for any segment without its own loading.tsx. Per-feature loading.tsx
// files (clients, upload, resources, …) mirror their own layouts.
const kpiKeys = ["k1", "k2", "k3", "k4"];
const rowKeys = ["r1", "r2", "r3", "r4", "r5"];

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Eyebrow + subline / filters */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2.5">
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
      </div>

      {/* KPI grid: hero (2×2) + four cards */}
      <div className="grid grid-cols-2 gap-3.5 md:auto-rows-fr md:grid-cols-4">
        <Skeleton className="col-span-2 h-40 rounded-lg md:row-span-2 md:h-full" />
        {kpiKeys.map((key) => (
          <Skeleton key={key} className="h-28 rounded-lg" />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-3.5 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-[264px] rounded-lg" />
        <Skeleton className="h-[264px] rounded-lg" />
      </div>

      {/* Recent posts */}
      <div className="rounded-lg border">
        <div className="border-b px-5 py-4">
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="space-y-3 p-4">
          {rowKeys.map((key) => (
            <Skeleton key={key} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
