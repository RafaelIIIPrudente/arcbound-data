import { Skeleton } from "@/components/ui/skeleton";

// Route-level skeleton shaped like the Clients list (header + filter + table).
const rowKeys = ["r1", "r2", "r3", "r4", "r5", "r6"];

export default function ClientsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-9 w-full max-w-sm" />
        <div className="rounded-md border">
          <div className="flex items-center gap-4 border-b px-4 py-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="ml-auto h-3 w-12" />
          </div>
          {rowKeys.map((key) => (
            <div key={key} className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="ml-auto h-4 w-10" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      </div>
    </div>
  );
}
