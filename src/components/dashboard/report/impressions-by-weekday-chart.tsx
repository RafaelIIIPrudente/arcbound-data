"use client";

import { MetricInfo } from "@/components/dashboard/metric-info";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ReportPeriod, SeriesPoint } from "@/services/types";

import { ChartScope } from "./chart-scope";

const config = {
  value: { label: "Avg impressions", color: "var(--primary)" },
} satisfies ChartConfig;

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THREE STATES, THREE SENTENCES, NEVER SUMMED.
//
// A post reaches this chart only if its publish date is precise TO THE DAY. Two
// different things keep one out and they are NOT the same fact:
//   • dated only to the week or month — a real date, too blunt for a weekday;
//   • no publish date at all.
// "8 posts excluded" would be true and would destroy the distinction, sending a
// reader after missing data that is not missing. Each gets its own sentence.
//
// ⚠️ PLAIN LANGUAGE ONLY. No age token ("4m"), no internal vocabulary
// (precision, granularity, resolver, scrape). The reader is told what the chart
// is built FROM, never what happened inside the pipeline.
// ─────────────────────────────────────────────────────────────────────────────

/** The chart's basis and what it left out — null when nothing was left out. */
function exclusionNote(placed: number, coarse: number, undated: number): string | null {
  if (coarse === 0 && undated === 0) return null;

  const sentences: string[] = [];
  // Skipped at zero: the empty state already says the chart has nothing to draw,
  // and "Built from the 0 posts" reads as a broken template.
  if (placed > 0) {
    sentences.push(
      `Built from the ${placed === 1 ? "1 post" : `${placed} posts`} whose exact publish day is known.`,
    );
  }
  if (coarse > 0) {
    sentences.push(
      coarse === 1
        ? "1 post is dated only to the week or month, so the day of the week it went out isn\u2019t known."
        : `${coarse} posts are dated only to the week or month, so the day of the week they went out isn\u2019t known.`,
    );
  }
  if (undated > 0) {
    sentences.push(
      undated === 1
        ? "1 post has no publish date at all."
        : `${undated} posts have no publish date at all.`,
    );
  }
  return sentences.join(" ");
}

/**
 * Average impressions by the day of week a post went out, Sunday → Saturday.
 *
 * ⚠️ NAMING: the source Power BI page charts `numViews`, a field ArcBase does
 * not capture — and its own model treats views and impressions as two distinct
 * measures. This panel therefore charts IMPRESSIONS and is titled as such. The
 * two pages are not directly comparable; do not relabel this "views".
 *
 * ⚠️ DAY-PRECISION POSTS ONLY, and this panel is PRINTED AND HANDED TO THE
 * CLIENT. A post dated from a week age landed on the scrape's own weekday and one
 * dated from a month age on whatever weekday the 1st fell on; averaging either
 * here would print a posting rhythm the Client never had, under their own name.
 */
export function ImpressionsByWeekdayChart({
  data,
  period,
  placedPosts,
  coarsePosts,
  undatedPosts,
}: {
  data: SeriesPoint[];
  period: ReportPeriod;
  /** Posts dated to the day — the ones actually averaged into the buckets. */
  placedPosts: number;
  /**
   * In-period posts that ARE dated, but only to the week or month.
   *
   * ⚠️ NOT A KIND OF `undatedPosts`. Telling a Client a post has no date when it
   * merely has a blunt one is a different — and false — statement.
   */
  coarsePosts: number;
  /** In-period posts with no resolved date at all, excluded from the buckets. */
  undatedPosts: number;
}) {
  // Empty when there is nothing PLACEABLE on a weekday — NOT merely when the
  // buckets are all zero. A placeable post that earned no impressions is a
  // measured 0 and still draws (a flat line); only the absence of any placeable
  // post is empty. (The old `data.every(v === 0)` check collapsed a real zero
  // into "no posts".)
  const hasChart = placedPosts > 0;

  const exclusion = exclusionNote(placedPosts, coarsePosts, undatedPosts);

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          Average impressions by day of week posted
        </div>
        {/* ⚠️ A DIRECT IMPORT EDGE, AND IT IS SAFE HERE. `print-report.tsx` draws
            its own print-friendly charts and does NOT import this file, so the
            Radix popover cannot reach the PDF through it — see the bundle guard
            in `src/rsc-boundary.test.ts`. The three panels print DOES share
            take a render prop instead, for exactly that reason. */}
        <MetricInfo metric="chartImpressionsByWeekday" />
        <ChartScope period={period} postCount={placedPosts} />
      </div>

      {hasChart ? (
        <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
          <AreaChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="fillWeekdayImpressions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Area
              dataKey="value"
              type="monotone"
              stroke="var(--color-value)"
              strokeWidth={2}
              fill="url(#fillWeekdayImpressions)"
            />
          </AreaChart>
        </ChartContainer>
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {/* ⚠️ Distinguish "there were posts, none of them placeable" from "no
              posts at all". A Client who posted nine times this period must never
              read "No posts in this period" because their dates were blunt. */}
          {coarsePosts + undatedPosts > 0
            ? "No posts with a known publish day in this period."
            : "No posts in this period."}
        </p>
      )}

      {exclusion ? (
        <p className="mt-3 font-mono text-[10.5px] text-muted-foreground" role="note">
          {exclusion}
        </p>
      ) : null}
    </div>
  );
}
