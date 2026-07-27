"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { OutreachCount } from "@/services/types";

const config = {
  count: { label: "Prospects", color: "var(--primary)" },
} satisfies ChartConfig;

/**
 * One categorical breakdown, as horizontal bars ranked by size.
 *
 * ⚠️ TITLED AS A MEASUREMENT, NEVER AS A RECOMMENDATION. "Stage" and "Reply
 * status" describe what was counted; "Best performing stage" would turn a tally
 * into a verdict. A test greps this component's whole rendered text for grade,
 * rank, score, rate and percentage words, so the discipline cannot erode through
 * a well-meaning caption.
 *
 * ⚠️ SIZE ORDER IS NOT A RANKING. Bars are sorted largest-first so the chart is
 * readable, and every bar carries the same hue for exactly that reason — a
 * colour ramp would make position look like merit. The number printed on each
 * bar is a COUNT; no share or percentage is computed here or anywhere upstream.
 *
 * ⚠️ ONE COMPONENT, THREE CHARTS. Stage, connection status and reply status are
 * the same shape of question, so they render through one implementation. That
 * matters beyond tidiness: a rule added here — the no-score grep, the honest
 * empty state, the note slot — binds all three at once instead of two of three.
 */
export function OutreachBreakdownChart({
  title,
  data,
  caption,
  note,
}: {
  title: string;
  data: OutreachCount[];
  /** What the counts are drawn from, e.g. "1,435 prospects". */
  caption: string;
  /**
   * An exclusion or caveat that must travel WITH the chart rather than living in
   * a footnote elsewhere — e.g. rows whose value could not be read.
   */
  note?: string;
}) {
  // Recharts wants its numeric key on the datum; `OutreachCount` already uses
  // `count`, so no remapping is needed and the label stays the category.
  const height = Math.max(140, data.length * 34 + 40);

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          {title}
        </div>
        <div className="font-mono text-[10.5px] whitespace-nowrap text-muted-foreground">
          {caption}
        </div>
      </div>

      {data.length === 0 ? (
        // ⚠️ AN HONEST SENTENCE, NOT AN EMPTY AXIS. A chart frame with no bars
        // reads as a rendering failure; this says which it is.
        <p className="py-14 text-center text-sm text-muted-foreground">
          Nothing recorded in this column for this snapshot.
        </p>
      ) : (
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 4, right: 44, top: 4, bottom: 0 }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              width={132}
              interval={0}
              tick={{ fontSize: 10 }}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[0, 3, 3, 0]}>
              <LabelList
                dataKey="count"
                position="right"
                className="fill-muted-foreground"
                fontSize={10}
                // recharts types the label as possibly undefined; coerce
                // defensively rather than printing "undefined" on a bar.
                formatter={(value) =>
                  typeof value === "number" ? value.toLocaleString("en-US") : ""
                }
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}

      {/* ⚠️ THE CHART'S TEXT EQUIVALENT, AND IT IS NOT OPTIONAL. A recharts SVG
          is invisible to a screen reader and unassertable in jsdom, so a chart
          with no text alternative is a chart nobody can verify and some people
          cannot read at all. This list is the same figures in the same order —
          the pattern `asset-legend.tsx` already establishes for the report's
          charts. Removing it silently costs both accessibility and every test
          that proves a datum reached the page. */}
      {data.length > 0 ? (
        <ul
          data-chart-values
          className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t pt-3 font-mono text-[10.5px] text-muted-foreground"
        >
          {data.map((row) => (
            <li key={row.label} className="flex items-baseline gap-1.5">
              <span>{row.label}</span>
              <span className="text-foreground tabular-nums">
                {row.count.toLocaleString("en-US")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {note ? (
        <p data-chart-note className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
          {note}
        </p>
      ) : null}
    </div>
  );
}
