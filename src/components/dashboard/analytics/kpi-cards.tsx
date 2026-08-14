import { MetricInfo } from "@/components/dashboard/metric-info";
import type { Kpi } from "@/services/types";

/**
 * The ▲/▼ chip, or NOTHING when there is no prior period to compare against.
 *
 * ⚠️ ABSENCE IS THE THIRD STATE, AND IT RENDERS AS ABSENCE. `delta: 0` is a real
 * comparison that came out flat and still draws a chip; `delta: null` means no
 * comparable prior period exists at all (today: all-time). Drawing "0%" there
 * would claim the figure held steady against a period that never existed, and
 * drawing "—" would borrow this repo's reserved sign for "we tried to compute
 * this and could not" — a different statement again. So: no chip.
 */
function Delta({ kpi }: { kpi: Kpi }) {
  if (kpi.delta === null || kpi.direction === null) return null;
  // The comp renders deltas in the accent colour for both directions; the
  // ▲/▼ glyph carries the direction visually, and an sr-only word carries it
  // for assistive tech — direction is never conveyed by colour alone.
  return (
    <span className="font-mono text-primary tabular-nums">
      <span aria-hidden>{kpi.direction === "up" ? "▲" : "▼"}</span>
      <span className="sr-only">{kpi.direction === "up" ? "Up" : "Down"} </span> {kpi.delta}%
    </span>
  );
}

export function KpiCards({
  hero,
  kpis,
  rangeLabel,
}: {
  hero: Kpi;
  kpis: Kpi[];
  rangeLabel: string;
}) {
  // Mobile stacks single-column; desktop is 3 columns, not 4. The hero is a 2×2
  // block (4 cells) and there are five secondary KPIs (Posts · Likes · Comments ·
  // Shares · Saves) — 4 + 5 = 9, which tiles a 3×3 grid exactly. A 4-column grid
  // left the fifth card (Saves) orphaned alone on a third row with dead space
  // beside it; a 2-column mobile grid stranded it the same way, so mobile stacks.
  return (
    <div className="grid grid-cols-1 gap-3.5 md:auto-rows-fr md:grid-cols-3">
      {/* col-span-1 on mobile: in a single-column grid, col-span-2 would force an
          implicit second track and render the stacked cards at half width. */}
      <div className="relative col-span-1 overflow-hidden rounded-lg border bg-card p-6 md:col-span-2 md:row-span-2">
        <div
          className="pointer-events-none absolute -right-16 -bottom-24 h-64 w-64 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, var(--primary), transparent 65%)" }}
          aria-hidden
        />
        {/* ⚠️ THE ⓘ IS INLINE, INSIDE THE EXISTING LABEL ROW. The grid tiles 4
            hero cells + 5 cards into 3×3 exactly (see the comment above), so a
            control that added a row to a card would orphan one onto a fourth.
            `metric` is the LABEL the service emitted, and
            `metric-definitions.test.ts` fails if the service ever emits one this
            record does not define. */}
        <div className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          {hero.label}
          <MetricInfo metric={hero.label} />
        </div>
        <div className="mt-4 flex items-end gap-3.5">
          <div className="font-display text-5xl leading-[0.9] font-extrabold tracking-tight tabular-nums sm:text-6xl">
            {hero.value.toLocaleString()}
          </div>
          <div className="pb-2 text-xs">
            <Delta kpi={hero} />
          </div>
        </div>
        {/* Dropped entirely when there is no prior period: naming one ("vs.
            prior all time") would assert a comparison the figures do not carry.
            Keyed off the hero's own delta, the same signal the chip uses. */}
        {hero.delta === null ? null : (
          <div className="mt-3 flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-muted-foreground">
            vs. prior {rangeLabel}
            {/* The ⓘ for the ▲/▼ chips, sited on the line that explains what
                they are compared against. It defines the UNIT (percent change,
                not points), the ▲100% "grew from nothing" branch, and why an
                absent chip is not "unchanged". */}
            <MetricInfo metric="kpiDelta" />
          </div>
        )}
      </div>

      {kpis.map((kpi) => (
        <div key={kpi.label} className="overflow-hidden rounded-lg border bg-card p-5">
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
            {kpi.label}
            <MetricInfo metric={kpi.label} />
          </div>
          <div className="mt-3 font-display text-2xl leading-none font-extrabold tracking-tight tabular-nums sm:text-[34px]">
            {kpi.value.toLocaleString()}
            {kpi.unit && (
              <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">
                {kpi.unit}
              </span>
            )}
          </div>
          <div className="mt-2.5 text-[11.5px]">
            <Delta kpi={kpi} />
          </div>
        </div>
      ))}
    </div>
  );
}
