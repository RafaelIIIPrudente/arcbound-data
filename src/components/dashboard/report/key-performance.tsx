import type { ClientReport, ReportFigure } from "@/services/types";

/**
 * The 3x3 figure grid. Rows are distinguished by WEIGHT and muted-foreground,
 * never by hue: the source report encodes its time window in colour
 * (black/orange/blue), but ArcBase already spends colour on the brand accent and
 * on chart magnitude, so a third colour language here would collide.
 */

function Figure({ figure, emphasis }: { figure: ReportFigure; emphasis: "strong" | "muted" }) {
  const display =
    figure.value === null
      ? "—"
      : `${figure.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${figure.unit ?? ""}`;

  return (
    <div className="rounded-lg border bg-card p-5">
      <div
        className={
          emphasis === "strong"
            ? "font-display text-2xl leading-none font-extrabold tracking-tight tabular-nums sm:text-3xl"
            : "font-display text-xl leading-none font-semibold tracking-tight text-muted-foreground tabular-nums sm:text-2xl"
        }
      >
        {display}
      </div>
      <div className="mt-2 font-mono text-[10px] leading-relaxed tracking-[0.12em] text-muted-foreground uppercase">
        {figure.label}
        {figure.approximate ? <span className="ml-1 normal-case opacity-70">(approx.)</span> : null}
      </div>
    </div>
  );
}

function Row({
  caption,
  figures,
  emphasis,
}: {
  caption: string;
  figures: ReportFigure[];
  emphasis: "strong" | "muted";
}) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        {caption}
      </div>
      <div className="grid gap-3.5 sm:grid-cols-3">
        {figures.map((figure) => (
          <Figure key={figure.label} figure={figure} emphasis={emphasis} />
        ))}
      </div>
    </div>
  );
}

export function KeyPerformance({
  keyPerformance,
  periodLabel,
  hasPosts,
}: {
  keyPerformance: ClientReport["keyPerformance"];
  periodLabel: string;
  hasPosts: boolean;
}) {
  if (!hasPosts) {
    return (
      <div className="rounded-lg border bg-card py-14 text-center">
        <p className="font-display text-base font-semibold">No posts in this period</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a different period to see key performance.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Row caption={periodLabel} figures={keyPerformance.selected} emphasis="strong" />
      <Row caption="All-time averages" figures={keyPerformance.allTime} emphasis="muted" />
      <Row caption="All-time maximums" figures={keyPerformance.allTimeMax} emphasis="muted" />
    </div>
  );
}
