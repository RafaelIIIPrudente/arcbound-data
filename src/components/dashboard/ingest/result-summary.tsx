import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { paths } from "@/paths";
import type { IngestSummary } from "@/services/types";

export function ResultSummary({
  summary,
  warning,
  onReset,
}: {
  summary: IngestSummary;
  /** Non-blocking notice (e.g. scraped authors that won't match the client). */
  warning?: string;
  onReset: () => void;
}) {
  const stats = [
    { label: "Inserted", value: summary.inserted, tone: "text-primary" },
    { label: "Updated", value: summary.updated, tone: "" },
    { label: "Unchanged", value: summary.unchanged, tone: "text-muted-foreground" },
  ];

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-lg border bg-card p-7">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="size-2.5 rounded-full bg-emerald-500" aria-hidden />
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            Upload complete
          </span>
        </div>
        <div className="flex flex-wrap gap-10">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div
                className={cn(
                  "font-display text-5xl leading-none font-extrabold tracking-tight tabular-nums",
                  stat.tone,
                )}
              >
                {stat.value.toLocaleString()}
              </div>
              <div className="mt-2 font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
      {warning && (
        <p
          role="status"
          className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
          {warning}
        </p>
      )}
      <div className="flex gap-3">
        <Button onClick={onReset}>Upload another</Button>
        <Button asChild variant="outline">
          <Link href={paths.home}>View analytics</Link>
        </Button>
      </div>
    </div>
  );
}
