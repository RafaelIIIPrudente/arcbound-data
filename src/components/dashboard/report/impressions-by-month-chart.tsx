"use client";

import { MetricInfo } from "@/components/dashboard/metric-info";
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ImpressionsBucket, MonthPoint, ReportPeriod } from "@/services/types";

import { ChartScope } from "./chart-scope";

const config = {
  value: { label: "Avg impressions", color: "var(--primary)" },
} satisfies ChartConfig;

/**
 * Average impressions per bucket across the SELECTED period, with a reference
 * line at that period's average. Empty buckets arrive as `value: null` and
 * render as gaps — plotting them as 0 would claim we posted and got no reach.
 *
 * ⚠️ THE TITLE FOLLOWS THE DATA. A month period buckets by WEEK (bucketed by
 * month it would be one bar), so the heading must say which — a card titled "by
 * month" showing weeks is a lie, and a fixed title is the defect this replaced.
 */
export function ImpressionsByMonthChart({
  data,
  average,
  period,
  postCount,
  bucket,
}: {
  data: MonthPoint[];
  average: number;
  period: ReportPeriod;
  postCount: number;
  bucket: ImpressionsBucket;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          Average impressions by {bucket}
        </div>
        {/* ⚠️ A DIRECT IMPORT EDGE, AND IT IS SAFE HERE. `print-report.tsx` draws
            its own print-friendly charts and does NOT import this file, so the
            Radix popover cannot reach the PDF through it — see the bundle guard
            in `src/rsc-boundary.test.ts`. The three panels print DOES share
            take a render prop instead, for exactly that reason. */}
        <MetricInfo metric="chartImpressionsOverTime" />
        <ChartScope period={period} postCount={postCount} />
      </div>

      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No posts in this period.</p>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
          <BarChart data={data} margin={{ left: 4, right: 4, top: 16, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval="preserveStartEnd"
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <ReferenceLine
              y={average}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{
                value: `Avg ${Math.round(average).toLocaleString()}`,
                position: "insideTopRight",
                fill: "var(--muted-foreground)",
                fontSize: 10,
              }}
            />
            <Bar dataKey="value" fill="var(--color-value)" radius={[3, 3, 0, 0]}>
              <LabelList
                dataKey="value"
                position="top"
                className="fill-muted-foreground"
                fontSize={9}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}
