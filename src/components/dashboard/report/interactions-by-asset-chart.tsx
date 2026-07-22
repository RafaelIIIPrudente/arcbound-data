"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis } from "recharts";

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
  value: { label: "Avg interactions", color: "var(--primary)" },
} satisfies ChartConfig;

export function InteractionsByAssetChart({ data }: { data: AssetBucket[] }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          Average interactions by asset type
        </div>
        <div className="font-mono text-[10.5px] text-muted-foreground">All time</div>
      </div>

      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No posts in this period.</p>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
          <BarChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={0}
              tick={{ fontSize: 10 }}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {data.map((bucket, i) => (
                <Cell key={bucket.format} fill={rampColor(i, data.length)} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}

      {data.length > 0 ? <AssetLegend data={data} format={(v) => v.toLocaleString()} /> : null}
    </div>
  );
}
