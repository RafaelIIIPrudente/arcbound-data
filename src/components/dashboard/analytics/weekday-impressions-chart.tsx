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
 * ⚠️ THE COUNT IS THE DATABLE POSTS ONLY. A post whose publish date the pipeline
 * never resolved has no assertable weekday and is excluded upstream (see
 * `impressionsByWeekday` in analytics.ts). `datedPosts` is what the averages rest
 * on; `undatedPosts` is disclosed rather than hidden, because a chart resting on
 * fewer posts than the window holds must say so.
 */
export function WeekdayImpressionsChart({
  data,
  rangeLabel,
  datedPosts,
  undatedPosts,
}: {
  data: SeriesPoint[];
  rangeLabel: string;
  /** Posts with a resolved date — the ones actually averaged into the buckets. */
  datedPosts: number;
  /** In-window posts with no resolved date, excluded from the buckets. */
  undatedPosts: number;
}) {
  // Empty when there is nothing DATABLE to place on a weekday — not merely when the
  // buckets are all zero. A datable post that earned no impressions is a measured 0
  // and still draws (a flat line), which is honest; only the absence of any datable
  // post is the empty state.
  const hasChart = datedPosts > 0;

  const exclusion =
    undatedPosts === 0
      ? null
      : `${undatedPosts === 1 ? "1 post" : `${undatedPosts} posts`} without a resolved date ${
          undatedPosts === 1 ? "is" : "are"
        } not counted here.`;

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
            {datedPosts === 1 ? "1 post" : `${datedPosts} posts`}
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
          {/* Distinguish "there were posts, none datable" from "no posts at all" —
              collapsing them would let the disclosure below contradict the message. */}
          {undatedPosts > 0
            ? "No posts with a resolved publish date in this period."
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
