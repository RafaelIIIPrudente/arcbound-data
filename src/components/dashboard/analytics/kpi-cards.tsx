import type { Kpi } from "@/services/types";

function Delta({ kpi }: { kpi: Kpi }) {
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
        <div className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          {hero.label}
        </div>
        <div className="mt-4 flex items-end gap-3.5">
          <div className="font-display text-5xl leading-[0.9] font-extrabold tracking-tight tabular-nums sm:text-6xl">
            {hero.value.toLocaleString()}
          </div>
          <div className="pb-2 text-xs">
            <Delta kpi={hero} />
          </div>
        </div>
        <div className="mt-3 font-mono text-[11px] tracking-wide text-muted-foreground">
          vs. prior {rangeLabel}
        </div>
      </div>

      {kpis.map((kpi) => (
        <div key={kpi.label} className="overflow-hidden rounded-lg border bg-card p-5">
          <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
            {kpi.label}
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
