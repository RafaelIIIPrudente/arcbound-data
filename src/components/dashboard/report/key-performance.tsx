import type { ClientReport, MatrixRow, ReportFigure } from "@/services/types";

/**
 * Key Performance: a hero row for the selected period, then a compact all-time
 * matrix beneath it.
 *
 * WHY NOT NINE CARDS. The previous layout gave all nine figures identical size,
 * weight and chrome, so the eye landed nowhere and the 3x3 structure — posts ·
 * per-post rate · interaction total, against selected · average · maximum — was
 * invisible. It also read as a fault when two figures legitimately coincided
 * (the selected month IS the maximum month, so numbers repeated across
 * apparently unrelated cards).
 *
 * The hierarchy comes from SCALE, WEIGHT and ONE accent. The hero is large,
 * unboxed and carries the brand colour; the matrix is small, quiet, neutral and
 * aligned for comparison.
 *
 * ⚠️ THE ACCENT IS LOAD-BEARING, SO IT STAYS ON THE HERO. The source Power BI
 * page ranked its three time windows by colour — one hue each. That is
 * deliberately NOT what happens here: colouring every window makes hue a
 * category label rather than an emphasis, which flattens the hierarchy back to
 * where it started and collides with the brand accent used by the wordmark,
 * nav and chart fills. One accent, one job: "this is the number that matters."
 * Do not extend `text-primary` into the matrix or the per-1K line.
 *
 * The accent is SOFTENED to 75%. Tailwind's opacity modifier compiles to
 * `color-mix(in oklab, …, transparent)` — the same construction ramp.ts uses —
 * so the figure mixes toward whatever it sits on: lighter over the light
 * ground, darker over the dark one. At full strength the brand red is too hot
 * for three 48px figures, and on paper it reads heavier still. The percentage
 * is the dial to turn if it wants more or less presence.
 */

/** Column headers, in the order `MatrixRow` declares its cells. */
const COLUMNS = ["Posts", "Per post", "Interactions"] as const;

/** A figure as text. An absent figure or value is an em dash — never a zero. */
function format(figure: ReportFigure | null): string {
  if (figure === null || figure.value === null) return "—";
  return `${figure.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${figure.unit ?? ""}`;
}

function ApproxMark({ figure }: { figure: ReportFigure }) {
  if (!figure.approximate) return null;
  return <span className="font-mono text-[9px] text-muted-foreground opacity-70">(approx.)</span>;
}

/**
 * One matrix cell. It carries its column name only below `sm`, where the row
 * has stacked and the header row is hidden — without it a bare number in a
 * stacked row would be unreadable.
 */
function Cell({ figure, column }: { figure: ReportFigure | null; column: string }) {
  return (
    <div className="sm:text-right">
      <div className="font-display text-base leading-none font-semibold tracking-tight tabular-nums sm:text-lg">
        {format(figure)}
      </div>
      <div className="mt-1 font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase sm:hidden">
        {column}
      </div>
    </div>
  );
}

function Row({ row }: { row: MatrixRow }) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,6.5rem))] sm:items-baseline sm:gap-y-0">
      {/* Below sm the row header owns its own line above the cells; from sm it
          becomes the first column of a true matrix. */}
      <div className="col-span-3 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase sm:col-span-1">
        {row.label}
      </div>
      <Cell figure={row.posts} column={COLUMNS[0]} />
      <Cell figure={row.perPost} column={COLUMNS[1]} />
      <Cell figure={row.interactions} column={COLUMNS[2]} />
    </div>
  );
}

export function KeyPerformance({
  keyPerformance,
  hasPosts,
}: {
  keyPerformance: ClientReport["keyPerformance"];
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

  const { selected, matrix, perThousandFollowers } = keyPerformance;

  return (
    <div>
      {/* HERO — the selected period. No card: it sits on the page ground so it
          reads as the anchor rather than as one panel among nine. The period is
          named by the section caption and the picker, so it is NOT repeated
          here. */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-6">
        {selected.map((figure) => (
          <div key={figure.label}>
            <div className="font-display text-3xl leading-none font-extrabold tracking-tight text-primary/75 tabular-nums sm:text-5xl">
              {format(figure)}
            </div>
            <div className="mt-2 font-mono text-[10px] leading-relaxed tracking-[0.12em] text-muted-foreground uppercase">
              {figure.label}
            </div>
          </div>
        ))}
      </div>

      {/* MATRIX — all-time context. Smaller and quieter than the hero by
          design: its job is comparison, not attention. */}
      <div className="mt-7 border-t">
        <div className="hidden pt-3 sm:grid sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,6.5rem))] sm:gap-x-4">
          <div />
          {COLUMNS.map((column) => (
            <div
              key={column}
              className="text-right font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase"
            >
              {column}
            </div>
          ))}
        </div>

        <div className="divide-y">
          {matrix.map((row) => (
            <Row key={row.label} row={row} />
          ))}
        </div>
      </div>

      {/* An AVERAGE, so it stands outside the matrix rather than sitting in the
          maxima row where it used to hide. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t py-3">
        <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          {perThousandFollowers.label}
          <span className="ml-1.5 opacity-70">· all time</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-base leading-none font-semibold tracking-tight tabular-nums sm:text-lg">
            {format(perThousandFollowers)}
          </span>
          <ApproxMark figure={perThousandFollowers} />
        </div>
      </div>
    </div>
  );
}
