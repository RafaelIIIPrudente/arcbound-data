import { Skeleton } from "@/components/ui/skeleton";

// Route-level skeleton shaped like the Outreach tab (back link, header + tab
// row, five KPI cards, then the funnel/breakdown grid).
//
// It exists because `[id]/loading.tsx` is shaped like the client DETAIL page —
// three KPI cards and an upload-history block — which would flash a layout this
// route never renders and then reflow.
const kpiKeys = ["k1", "k2", "k3", "k4", "k5"];
const panelKeys = ["p1", "p2"];

export default function ClientOutreachLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-4 w-28" />

      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-56" />
      </div>

      <Skeleton className="h-9 w-full max-w-md" />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-5">
        {kpiKeys.map((key) => (
          <div key={key} className="rounded-lg border bg-card p-5">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="mt-3 h-3 w-20" />
            <Skeleton className="mt-2 h-2.5 w-14" />
          </div>
        ))}
      </div>

      <div className="grid gap-3.5 xl:grid-cols-2">
        {panelKeys.map((key) => (
          <div key={key} className="rounded-lg border bg-card p-5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-5 h-[220px] w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
