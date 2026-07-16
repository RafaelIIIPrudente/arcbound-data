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
  return (
    <div className="grid grid-cols-2 gap-3.5 md:auto-rows-fr md:grid-cols-4">
      <div className="relative col-span-2 overflow-hidden rounded-lg border bg-card p-6 md:row-span-2">
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
        <div key={kpi.label} className="rounded-lg border bg-card p-5">
          <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
            {kpi.label}
          </div>
          <div className="mt-3 font-display text-[34px] leading-none font-extrabold tracking-tight tabular-nums">
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
