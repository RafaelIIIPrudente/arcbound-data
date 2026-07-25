import { Skeleton } from "@/components/ui/skeleton";

// Route-level skeleton shaped like the Posts drill-down (back link, header +
// period picker, tab row, then the table).
const rowKeys = ["r1", "r2", "r3", "r4", "r5", "r6"];

export default function ClientPostsLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-4 w-28" />

      <div className="space-y-3">
        <Skeleton className="h-3 w-16" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-9 w-44" />
        </div>
      </div>

      <Skeleton className="h-8 w-72" />

      <div className="space-y-4">
        <Skeleton className="h-3 w-40" />
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
