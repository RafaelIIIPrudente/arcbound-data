"use client";

import { MetricInfo } from "@/components/dashboard/metric-info";
import { Bar, BarChart, CartesianGrid, Cell, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AssetBucket, ReportPeriod } from "@/services/types";

import { ChartScope } from "./chart-scope";

import { AssetLegend } from "./asset-legend";
import { rampColor } from "./ramp";

const config = {
  value: { label: "Avg interactions", color: "var(--primary)" },
} satisfies ChartConfig;

export function InteractionsByAssetChart({
  data,
  period,
  postCount,
}: {
  data: AssetBucket[];
  period: ReportPeriod;
  postCount: number;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          Average interactions by asset type
        </div>
        {/* ⚠️ A DIRECT IMPORT EDGE, AND IT IS SAFE HERE. `print-report.tsx` draws
            its own print-friendly charts and does NOT import this file, so the
            Radix popover cannot reach the PDF through it — see the bundle guard
            in `src/rsc-boundary.test.ts`. The three panels print DOES share
            take a render prop instead, for exactly that reason. */}
        <MetricInfo metric="chartInteractionsByAsset" />
        <ChartScope period={period} postCount={postCount} />
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
