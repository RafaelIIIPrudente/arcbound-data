"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MonthPoint } from "@/services/types";

const config = {
  value: { label: "Avg impressions", color: "var(--primary)" },
} satisfies ChartConfig;

/**
 * Average impressions per month across the FULL history, with a reference line
 * at the overall average. Months with no posts arrive as `value: null` and
 * render as gaps — plotting them as 0 would claim we posted and got no reach.
 */
export function ImpressionsByMonthChart({
  data,
  average,
}: {
  data: MonthPoint[];
  average: number;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          Average impressions by month
        </div>
        <div className="font-mono text-[10.5px] text-muted-foreground">All time</div>
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
