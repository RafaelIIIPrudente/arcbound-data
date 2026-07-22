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
 * Average impressions by the day of week a post went out, Sunday → Saturday.
 *
 * ⚠️ NAMING: the source Power BI page charts `numViews`, a field ArcBase does
 * not capture — and its own model treats views and impressions as two distinct
 * measures. This panel therefore charts IMPRESSIONS and is titled as such. The
 * two pages are not directly comparable; do not relabel this "views".
 */
export function ImpressionsByWeekdayChart({ data }: { data: SeriesPoint[] }) {
  const isEmpty = data.every((d) => d.value === 0);

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          Average impressions by day of week posted
        </div>
        <div className="font-mono text-[10.5px] text-muted-foreground">All time</div>
      </div>

      {isEmpty ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No posts in this period.</p>
      ) : (
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
      )}
    </div>
  );
}
