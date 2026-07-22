"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AssetBucket } from "@/services/types";

import { AssetLegend } from "./asset-legend";
import { rampColor } from "./ramp";

const config = {
  value: { label: "Share of posts", color: "var(--primary)" },
} satisfies ChartConfig;

/**
 * Share of posts by asset type, as a percentage to one decimal place, drawn as
 * horizontal bars ranked descending. Uses the same rank-keyed single-hue ramp as
 * the interactions panel, so colour means the same thing across the section.
 */
export function PostTypeDistributionChart({ data }: { data: AssetBucket[] }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          Post type distribution
        </div>
        <div className="font-mono text-[10.5px] text-muted-foreground">All time</div>
      </div>

      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No posts in this period.</p>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 4, right: 36, top: 4, bottom: 0 }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              width={92}
              tick={{ fontSize: 10 }}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="value" radius={[0, 3, 3, 0]}>
              {data.map((bucket, i) => (
                <Cell key={bucket.format} fill={rampColor(i, data.length)} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                className="fill-muted-foreground"
                fontSize={10}
                // recharts hands the raw label through, so coerce defensively —
                // the share is always a number, but the type allows undefined.
                formatter={(value) => (typeof value === "number" ? `${value.toFixed(1)}%` : "")}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}

      {data.length > 0 ? <AssetLegend data={data} format={(v) => `${v.toFixed(1)}%`} /> : null}
    </div>
  );
}
