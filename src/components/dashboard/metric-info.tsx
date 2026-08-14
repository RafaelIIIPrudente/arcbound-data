"use client";

import { Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { metricDefinition } from "@/lib/metric-definitions";
import { cn } from "@/lib/utils";

/**
 * The ⓘ beside a figure: what this metric actually measures, on demand.
 *
 * ⚠️ A POPOVER ON CLICK, NOT A HOVER TOOLTIP. `ui/tooltip.tsx` exists and is the
 * wrong control here: hover does not exist on the tablet this dashboard gets
 * reviewed on, and a definition nobody on mobile can open is not a definition.
 * The trigger is a real `<button>`, so it is in the tab order and opens on Enter
 * or Space with no extra handling.
 *
 * ⚠️ AN UNMAPPED METRIC RENDERS NOTHING — never an ⓘ that opens onto an empty
 * panel, and never a plausible sentence assembled on the spot. Absence disclosed
 * is honest; an invented definition is a fabricated figure in prose. See
 * `metricDefinition`, which returns `undefined` for exactly this branch.
 *
 * ⚠️ THE ACCESSIBLE NAME NAMES THE METRIC ("What is Engagement rate?"), because
 * a screen full of buttons all called "More information" tells a screen-reader
 * user which control they have found but not what it is about. Where this sits
 * inside an element that computes its own name from content — a `<th>` — that
 * element must state its name explicitly so this button stays out of it; see
 * `posts-table.tsx`.
 */
export function MetricInfo({ metric, className }: { metric: string; className?: string }) {
  const entry = metricDefinition(metric);
  // The one branch that must never become a rendered empty popover.
  if (entry === undefined) return null;

  return <MetricInfoInline term={entry.term} definition={entry.definition} className={className} />;
}

/**
 * The same ⓘ, for a figure whose rule the SERVICE already computes.
 *
 * ⚠️ USE THIS ONLY WHERE THE PROSE IS DERIVED FROM THE COMPUTATION, NEVER TO
 * HAND-WRITE A DEFINITION AT A CALL SITE. The outreach funnel is the case it
 * exists for: each step arrives from `buildOutreachAnalytics` carrying its own
 * `source` column and `rule` text, so restating those in
 * `metric-definitions.ts` would be a SECOND copy of a rule this repo already
 * keeps in one place — the exact drift hazard the funnel's SQL/TypeScript twins
 * are commented about. A definition assembled from the step itself cannot fall
 * behind the step.
 *
 * Anything whose meaning is NOT computed belongs in `metric-definitions.ts` and
 * reaches the screen through `MetricInfo` above.
 */
export function MetricInfoInline({
  term,
  definition,
  className,
}: {
  term: string;
  definition: string;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What is ${term}?`}
          data-slot="metric-info"
          className={cn(
            // Inline and baseline-aligned so it rides along with the label it
            // annotates. ⚠️ NO margin or block display: the KPI grid tiles 4 hero
            // cells + 5 cards into 3×3 exactly, and a control that changed a
            // card's height would orphan one of them onto a fourth row.
            "inline-flex shrink-0 cursor-pointer items-center align-middle text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
            className,
          )}
        >
          <Info className="size-3" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        {/* Normal case, not the mono uppercase of the label it hangs off: this
            is prose to be read, not a column heading to be scanned. */}
        <p className="text-sm font-medium">{term}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{definition}</p>
      </PopoverContent>
    </Popover>
  );
}
