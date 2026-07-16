import { Skeleton } from "@/components/ui/skeleton";

// Route-level skeleton shaped like the Resources list (header + link rows).
const rowKeys = ["r1", "r2", "r3"];

export default function ResourcesLoading() {
  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="overflow-hidden rounded-lg border">
        {rowKeys.map((key) => (
          <div key={key} className="flex items-center gap-4 border-t px-5 py-4 first:border-t-0">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="ml-auto size-4" />
          </div>
        ))}
      </div>
      <Skeleton className="h-3 w-72" />
    </div>
  );
}
