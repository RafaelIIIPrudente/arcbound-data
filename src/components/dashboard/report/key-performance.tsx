import type { ReactNode } from "react";

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

/**
 * How a caller supplies the ⓘ that sits beside a figure's label.
 *
 * ⚠️ A RENDER PROP, NOT A BOOLEAN, AND THE REASON IS THE BUNDLE — NOT TASTE.
 * This file used to import `MetricInfo` ("use client" → Radix Popover) and gate
 * it on a `showDefinitions` boolean. The boolean was correct about RENDERING:
 * the print export and `/r/[token]` never drew a popover. It was powerless about
 * BUNDLING, because a static import is an edge in the module graph and the
 * bundler resolves it long before any prop is read — so Radix shipped to both
 * surfaces anyway, and `/r/[token]`, the report a CLIENT downloads, carried 4 kB
 * of code it could never run. A prop cannot fix that. Not having the edge can.
 *
 * So this module no longer knows that `MetricInfo` exists. The ONE caller that
 * wants definitions — `app/(app)/clients/[id]/report/page.tsx` — passes them in.
 *
 * ⚠️ THE NARROW SURFACE IS STILL THE DEFAULT, WHICH IS THE PROPERTY THAT MATTERS.
 * `renderInfo` is optional and undefined means no ⓘ, so `print-report.tsx` and
 * `public-report.tsx` get the safe behaviour by saying NOTHING — they never had
 * to remember to opt out, and they still don't. Same shape as `DateRangePicker`'s
 * `allowCustom`: forget the prop and you ship the narrower thing.
 *
 * Returning `null` for a label with no definition is the CALLER's branch now.
 *
 * ⚠️ THIS MODULE MUST STAY A SERVER COMPONENT — no `"use client"`. A function
 * prop passed RSC → RSC is fine; the moment this file became a Client Component
 * `renderInfo` would be an unserializable value crossing the boundary, and the
 * fix would have to become a dynamic `import()` instead.
 */
type RenderInfo = (label: string) => ReactNode;

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

function Row({ row, renderInfo }: { row: MatrixRow; renderInfo?: RenderInfo }) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,6.5rem))] sm:items-baseline sm:gap-y-0">
      {/* Below sm the row header owns its own line above the cells; from sm it
          becomes the first column of a true matrix. */}
      {/* ⓘ ON THE ROW, NOT IN THE CELLS. One sentence covers a row's three
          figures, six triggers inside right-aligned numeric cells would be
          clutter, and the maxima row's em dash can only be explained at row
          level anyway. */}
      <div className="col-span-3 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase sm:col-span-1">
        {row.label}
        {renderInfo?.(row.label)}
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
  renderInfo,
}: {
  keyPerformance: ClientReport["keyPerformance"];
  hasPosts: boolean;
  /**
   * ⚠️ STAFF ONLY, AND ABSENCE IS THE SAFE DEFAULT ON PURPOSE. See `RenderInfo`
   * above: this component is also the print export and the Client's own
   * `/r/[token]` report, and neither may gain an interactive popover — nor ship
   * the code for one. Only `app/(app)/clients/[id]/report/page.tsx` passes this.
   */
  renderInfo?: RenderInfo;
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

  const { selected, matrix, perThousandFollowers, connections } = keyPerformance;

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
            <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] leading-relaxed tracking-[0.12em] text-muted-foreground uppercase">
              {figure.label}
              {renderInfo?.(figure.label)}
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
            <Row key={row.label} row={row} renderInfo={renderInfo} />
          ))}
        </div>
      </div>

      {/* An AVERAGE, so it stands outside the matrix rather than sitting in the
          maxima row where it used to hide. */}
      <FooterLine
        figure={perThousandFollowers}
        qualifier="· all time"
        approximate
        renderInfo={renderInfo}
      />

      {/* ⚠️ A DIFFERENT KIND OF FIGURE, SO DIFFERENT CHROME. This is a count read
          off one scrape — exact, and about a single moment. Routing it through
          the average's rendering would stamp it "· all time" (it is not a total
          over the window) and "(approx.)" (it is not an estimate): two false
          claims, on a document that gets printed and handed to a client. It also
          carries no window qualifier at all, because the upload that recorded it
          may be OLDER than the latest scrape and the page cannot honestly say
          when without plumbing that upload's date through.

          ⚠️ AND THE LINE IS ALWAYS PRESENT, EVEN WHEN IT IS AN EM DASH. Hiding it
          when no connection count was captured would leave a reader unable to
          tell "we don't measure this" from "this report happens not to show it" —
          the labelled em dash says which. */}
      <FooterLine figure={connections} renderInfo={renderInfo} />
    </div>
  );
}

/**
 * One figure in the footer beneath the matrix.
 *
 * `qualifier` and `approximate` are opt-in per figure rather than assumed: they
 * are true of the follower AVERAGE and false of the connection COUNT, and the
 * two sit one above the other.
 */
function FooterLine({
  figure,
  qualifier,
  approximate = false,
  renderInfo,
}: {
  figure: ReportFigure;
  qualifier?: string;
  approximate?: boolean;
  renderInfo?: RenderInfo;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t py-3">
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {figure.label}
        {qualifier ? <span className="opacity-70">{qualifier}</span> : null}
        {renderInfo?.(figure.label)}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-base leading-none font-semibold tracking-tight tabular-nums sm:text-lg">
          {format(figure)}
        </span>
        {approximate ? <ApproxMark figure={figure} /> : null}
      </div>
    </div>
  );
}
