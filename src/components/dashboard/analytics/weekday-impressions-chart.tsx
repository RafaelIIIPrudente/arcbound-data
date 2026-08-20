"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SeriesPoint } from "@/services/types";

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
 * Average impressions by the weekday a post went out, Sunday → Saturday, for the
 * dashboard's current window (respecting the range and client filters).
 *
 * ⚠️ TITLED AS A MEASUREMENT, NOT A RECOMMENDATION. "Best day to post" is a causal
 * claim the data has not earned — the book-level sample is thin, and the same
 * discipline that forbids ranks in the cross-client comparison and a consistency
 * score in cadence forbids "best/optimal/recommended" here. This chart reports what
 * WAS observed; it does not advise.
 *
 * ⚠️ THE COUNT IS THE DAY-PRECISION POSTS ONLY. A weekday can be asserted for a
 * post only if its publish date is exact to the day: a post dated from a week age
 * landed on the scrape's own weekday, and one dated from a month age on whatever
 * weekday the 1st fell on. Both are excluded upstream (`impressionsByWeekday` in
 * analytics.ts), as are posts with no date at all — and the two exclusions are
 * counted and stated SEPARATELY, because they are different facts.
 */
export function WeekdayImpressionsChart({
  data,
  rangeLabel,
  placedPosts,
  coarsePosts,
  undatedPosts,
}: {
  data: SeriesPoint[];
  rangeLabel: string;
  /** Posts dated to the day — the ones actually averaged into the buckets. */
  placedPosts: number;
  /**
   * In-window posts that ARE dated, but only to the week or month.
   *
   * ⚠️ NOT A KIND OF `undatedPosts`, and never added to it. See the note above
   * `exclusionNote`.
   */
  coarsePosts: number;
  /** In-window posts with no resolved date at all, excluded from the buckets. */
  undatedPosts: number;
}) {
  // Empty when there is nothing PLACEABLE on a weekday — not merely when the
  // buckets are all zero. A placeable post that earned no impressions is a
  // measured 0 and still draws (a flat line), which is honest; only the absence of
  // any placeable post is the empty state.
  const hasChart = placedPosts > 0;

  const exclusion = exclusionNote(placedPosts, coarsePosts, undatedPosts);

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          Average impressions by day of week posted
        </div>
        <div className="font-mono text-[10.5px] whitespace-nowrap text-muted-foreground">
          {rangeLabel}
          <span className="opacity-70">
            {" · "}
            {placedPosts === 1 ? "1 post" : `${placedPosts} posts`}
          </span>
        </div>
      </div>

      {hasChart ? (
        <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
          <AreaChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="fillDashboardWeekdayImpressions" x1="0" y1="0" x2="0" y2="1">
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
              fill="url(#fillDashboardWeekdayImpressions)"
            />
          </AreaChart>
        </ChartContainer>
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {/* ⚠️ Distinguish "there were posts, none of them placeable" from "no
              posts at all". Saying "No posts in this period" to a window holding
              nine real posts — kept off only by how bluntly they are dated — is
              the single worst sentence this card could print, and the disclosure
              below would immediately contradict it. */}
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
