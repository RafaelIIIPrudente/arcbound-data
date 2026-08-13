"use client";

import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

import { MetricInfo } from "@/components/dashboard/metric-info";
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
  /** `null` when there is no comparable prior period — see the chip below. */
  delta: number | null;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      {/* ⚠️ `engagementRateWindow`, NOT a bare "Engagement rate". Four screens in
          this app print that same label over four different statistics — this
          one is the impression-weighted rate across the whole window, and the
          posts table's is the source's per-post figure. The key is what keeps
          them apart; the label on screen stays as it was. */}
      <div className="mb-4 flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
        Engagement rate
        <MetricInfo metric="engagementRateWindow" />
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
        {/* ⚠️ NO CHIP WHEN THERE IS NO PRIOR PERIOD. `delta` of 0 renders as
            "+0pt", which reads as "measured, unchanged" — a claim nobody can
            make about all-time, which has nothing before it to be unchanged
            from. Same rule as the KPI cards' ▲/▼. */}
        {delta === null ? null : (
          <>
            <span className="font-mono text-[11px] font-normal text-primary">
              {delta >= 0 ? "+" : ""}
              {delta}pt
            </span>{" "}
            {/* ⚠️ THE `pt` IS THE MOST MISREAD MARK ON THIS SCREEN, so it gets
                its own ⓘ rather than borrowing the heading's. "+1.2pt" is a
                percentage-POINT gap between two rates; the KPI cards' chips
                above are percent CHANGE. Two units, one screen. */}
            <MetricInfo metric="engagementDelta" />
          </>
        )}
      </div>
    </div>
  );
}
