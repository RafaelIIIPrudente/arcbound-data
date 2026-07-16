import { Skeleton } from "@/components/ui/skeleton";

// Route-level skeleton shaped like the Client detail (back link, header + KPI
// cards, upload-history block).
const kpiKeys = ["k1", "k2", "k3"];

export default function ClientDetailLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-4 w-28" />

      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="flex flex-wrap gap-3.5">
          {kpiKeys.map((key) => (
            <div key={key} className="min-w-[120px] flex-1 rounded-lg border bg-card p-5">
              <Skeleton className="h-8 w-12" />
              <Skeleton className="mt-3 h-3 w-16" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="border-b px-5 py-4">
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="px-5 py-12">
          <Skeleton className="mx-auto h-4 w-40" />
        </div>
      </div>
    </div>
  );
}
