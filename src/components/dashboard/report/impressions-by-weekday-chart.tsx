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

/**
 * Average impressions by the day of week a post went out, Sunday → Saturday.
 *
 * ⚠️ NAMING: the source Power BI page charts `numViews`, a field ArcBase does
 * not capture — and its own model treats views and impressions as two distinct
 * measures. This panel therefore charts IMPRESSIONS and is titled as such. The
 * two pages are not directly comparable; do not relabel this "views".
 */
export function ImpressionsByWeekdayChart({
  data,
  period,
  datedPosts,
  undatedPosts,
}: {
  data: SeriesPoint[];
  period: ReportPeriod;
  /** Posts with a resolved date — the ones actually averaged into the buckets. */
  datedPosts: number;
  /** In-period posts with no resolved date, excluded from the buckets. */
  undatedPosts: number;
}) {
  // Empty when there is nothing DATABLE to place on a weekday — NOT merely when the
  // buckets are all zero. A datable post that earned no impressions is a measured 0
  // and still draws (a flat line); only the absence of any datable post is empty.
  // (The old `data.every(v === 0)` check collapsed a real zero into "no posts".)
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
        {/* ⚠️ A DIRECT IMPORT EDGE, AND IT IS SAFE HERE. `print-report.tsx` draws
            its own print-friendly charts and does NOT import this file, so the
            Radix popover cannot reach the PDF through it — see the bundle guard
            in `src/rsc-boundary.test.ts`. The three panels print DOES share
            take a render prop instead, for exactly that reason. */}
        <MetricInfo metric="chartImpressionsByWeekday" />
        <ChartScope period={period} postCount={datedPosts} />
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
