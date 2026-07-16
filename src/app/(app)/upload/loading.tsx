import { Skeleton } from "@/components/ui/skeleton";

// Route-level skeleton shaped like the Upload form (eyebrow + four numbered
// steps separated by dividers).
const stepKeys = ["01", "02", "03", "04"];

export default function UploadLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-3 w-24" />
      <div className="max-w-3xl space-y-5">
        {stepKeys.map((key, index) => (
          <div key={key}>
            <div className="flex gap-4">
              <Skeleton className="h-4 w-5 shrink-0" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-9 w-full max-w-sm rounded-md" />
              </div>
            </div>
            {index < stepKeys.length - 1 && <div className="mt-5 border-t" />}
          </div>
        ))}
      </div>
    </div>
  );
}
