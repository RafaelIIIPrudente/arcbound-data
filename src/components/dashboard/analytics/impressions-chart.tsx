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
  value: { label: "Impressions", color: "var(--primary)" },
} satisfies ChartConfig;

export function ImpressionsChart({
  data,
  rangeLabel,
}: {
  data: SeriesPoint[];
  rangeLabel: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          Impressions over time
        </div>
        <div className="font-mono text-[10.5px] text-muted-foreground">{rangeLabel}</div>
      </div>
      <ChartContainer config={config} className="aspect-auto h-[200px] w-full">
        <AreaChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="fillImpressions" x1="0" y1="0" x2="0" y2="1">
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
            fill="url(#fillImpressions)"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
