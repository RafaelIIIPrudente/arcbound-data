import { CloudOff } from "lucide-react";

/**
 * Shown when the analytics source can't be read (e.g. the BI views aren't yet
 * reachable) — deliberately distinct from the "No posts yet" empty state, and
 * carrying no raw error/dev detail.
 */
export function AnalyticsUnavailable() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-muted/30 py-20 text-center">
      <CloudOff className="size-6 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-display text-lg font-semibold">Analytics unavailable</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          We couldn&rsquo;t load analytics right now. This usually clears once access is restored —
          try again shortly.
        </p>
      </div>
    </div>
  );
}
