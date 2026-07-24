import { Skeleton } from "@/components/ui/skeleton";

// Route-level skeleton shaped like the Data Quality page (eyebrow + heading,
// two summary cards, then the per-client table).
const cardKeys = ["k1", "k2"];
const rowKeys = ["r1", "r2", "r3", "r4", "r5", "r6"];

export default function DataQualityLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-52" />
      </div>

      <div className="space-y-5">
        <div className="flex flex-wrap gap-3.5">
          {cardKeys.map((key) => (
            <div key={key} className="min-w-52 rounded-lg border bg-card px-5 py-4">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-3 h-3 w-32" />
            </div>
          ))}
        </div>
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-3 w-20" />
        <div className="rounded-md border">
          <div className="border-b px-5 py-4">
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="space-y-4 px-5 py-5">
            {rowKeys.map((key) => (
              <Skeleton key={key} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
