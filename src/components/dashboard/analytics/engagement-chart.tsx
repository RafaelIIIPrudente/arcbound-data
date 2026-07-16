"use client";

import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SeriesPoint } from "@/services/types";

const config = {
  value: { label: "Engagement", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

export function EngagementChart({
  data,
  value,
  delta,
}: {
  data: SeriesPoint[];
  value: number;
  delta: number;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
        Engagement rate
      </div>
      <ChartContainer config={config} className="aspect-auto h-[180px] w-full">
        <LineChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Line
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ChartContainer>
      <div className="mt-2.5 font-display text-2xl font-extrabold tracking-tight tabular-nums">
        {value}
        <span className="text-muted-foreground">%</span>{" "}
        <span className="font-mono text-[11px] font-normal text-primary">
          {delta >= 0 ? "+" : ""}
          {delta}pt
        </span>
      </div>
    </div>
  );
}
