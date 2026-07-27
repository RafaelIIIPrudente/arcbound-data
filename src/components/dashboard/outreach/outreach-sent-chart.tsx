"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SentTrendPoint } from "@/services/types";

const config = {
  count: { label: "Requests sent", color: "var(--primary)" },
} satisfies ChartConfig;

/**
 * Requests sent per calendar month, from `Date Sent`.
 *
 * ⚠️ TITLED AS A MEASUREMENT, NEVER AS A RECOMMENDATION — the same discipline
 * binding every other panel on this page. This chart reports how many requests
 * carried a send date in each month. It does not annotate a peak, infer a
 * cadence, name a best month, or compute a share of anything, and a test greps
 * its whole rendered text for those words.
 *
 * ⚠️ AN EMPTY MONTH DRAWS A REAL 0, AND THIS IS THE ONE PLACE ON THE PAGE WHERE
 * THAT IS RIGHT. Everywhere else an absent value renders as a gap and never as
 * zero — a blank Stage gets its own named bar, an unreadable follow-up count
 * never lands in the "0" bucket. Here the date range is KNOWN, so "no requests
 * were sent in February" is an observation rather than a measurement nobody
 * took. The inversion is deliberate; see `fillSentMonths`, which is where it is
 * enforced, so that nobody later "fixes" it back.
 *
 * ⚠️ THE AXIS IS BROKEN, AND IT SAYS SO WHERE IT BREAKS. This Client's send
 * dates run from a single `2020-12-04` row to 2026 — 68 months, most of them
 * empty. The outlier is real and is neither filtered nor hidden (S3 decided
 * that; `sentDateRange` publishes it in the disclosure below). So the long
 * dormancy is COLLAPSED into one point that states its own length in words,
 * rather than the two dishonest alternatives: 61 blank bars that bury the six
 * months of actual outreach, or a quietly trimmed axis that deletes a genuine
 * observation to make the picture nicer.
 *
 * ⚠️ NO DISCLOSURE HERE. Undated rows, unreadable `Date Sent` values and the
 * full span are already reported by `OutreachDisclosure` on this same page.
 * Repeating them would give a reader two places to reconcile and one more place
 * to fall out of step.
 */
export function OutreachSentChart({ points }: { points: SentTrendPoint[] }) {
  // Every request that reached a month bucket. Not the funnel's "Requests sent"
  // — that counts non-blank `Date Sent` including text no month could be read
  // from — which is exactly why the caption says "dated".
  const dated = points.reduce((n, p) => n + (p.kind === "month" ? p.count : 0), 0);
  const collapsed = points.some((p) => p.kind === "gap");

  const chartData = points.map((p) => ({
    // Short on the axis, full in the list below: an axis tick has no room for a
    // sentence, and the sentence is what makes the break auditable.
    tick: p.kind === "gap" ? `${p.months} months` : p.label,
    count: p.count,
  }));

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          Requests sent by month
        </div>
        <div className="font-mono text-[10.5px] whitespace-nowrap text-muted-foreground">
          Date Sent
          <span className="opacity-70">
            {" · "}
            {dated.toLocaleString("en-US")} dated
          </span>
        </div>
      </div>

      {points.length === 0 ? (
        // An honest sentence, not an empty axis — a chart frame with no bars
        // reads as a rendering failure.
        <p className="py-14 text-center text-sm text-muted-foreground">
          No prospect in this snapshot carries a readable send date.
        </p>
      ) : (
        <>
          <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
            <BarChart data={chartData} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="tick"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                tick={{ fontSize: 10 }}
              />
              <YAxis hide />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              {/* A gap carries `count: null`, so recharts draws nothing for it —
                  which is the point. A 0 there would put one bar where sixty-one
                  months are hiding. */}
              <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>

          {/* ⚠️ THE CHART'S TEXT EQUIVALENT, AND IT IS NOT OPTIONAL. A recharts
              SVG is invisible to a screen reader and unassertable in jsdom, so a
              chart with no text alternative is one nobody can verify and some
              people cannot read at all — the pattern the breakdown charts and
              `asset-legend.tsx` already establish. */}
          <ul
            data-chart-values
            className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t pt-3 font-mono text-[10.5px] text-muted-foreground"
          >
            {points.map((point) =>
              point.kind === "month" ? (
                <li key={point.date} className="flex items-baseline gap-1.5">
                  <span>{point.label}</span>
                  <span className="text-foreground tabular-nums">
                    {point.count.toLocaleString("en-US")}
                  </span>
                </li>
              ) : (
                // ⚠️ NO NUMBER BESIDE IT. A collapsed range is not one bucket that
                // measured zero; its label carries the whole fact.
                <li key={`gap-${point.from}`} className="flex items-baseline gap-1.5">
                  <span className="border-b border-dashed">{point.label}</span>
                </li>
              ),
            )}
          </ul>
        </>
      )}

      {points.length > 0 ? (
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
          {collapsed
            ? "Months with no requests are shown as 0. Runs of three or more empty months are collapsed into a single labelled point, so the axis is not to scale across it — nothing has been filtered out."
            : "Months with no requests are shown as 0 — a month with none really had none. Nothing has been filtered out."}
        </p>
      ) : null}
    </div>
  );
}
