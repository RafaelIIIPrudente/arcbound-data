"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { InteractionsComparison } from "@/components/dashboard/report/interactions-comparison";
import { KeyPerformance } from "@/components/dashboard/report/key-performance";
import { AssetLegend } from "@/components/dashboard/report/asset-legend";
import { rampColor } from "@/components/dashboard/report/ramp";
import { ChartScope } from "@/components/dashboard/report/chart-scope";
import { scopeCaption } from "@/components/dashboard/report/report-period";
import type {
  AssetBucket,
  ClientReport,
  ImpressionsBucket,
  MonthPoint,
  ReportPeriod,
  SeriesPoint,
} from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// The six panels in document order, laid out for paper.
//
// ⚠️ WHY THESE CHARTS DO NOT USE <ChartContainer>
//
// ChartContainer wraps recharts' ResponsiveContainer, which sizes the SVG by
// MEASURING its parent through a ResizeObserver. That measurement is the whole
// problem in a print context: the observer fires asynchronously, and Chrome
// re-lays-out the page at paper width when the print dialog opens, so the SVG
// is snapshotted either at the pre-print screen width or at ChartContainer's
// 320px fallback. Neither is the paper width, and both look like a bug.
//
// So print charts take an EXPLICIT pixel width and height and skip the
// responsive layer entirely. There is nothing to measure, nothing to race, and
// the output is identical whether or not the observer ever fires.
//
// Everything else is shared with the screen: the same seam, the same rank ramp,
// the same legend. No figure here is recomputed.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The printable content column, in CSS pixels.
 *
 * Letter is 8.5in (215.9mm) wide and print.css sets 15mm side margins, leaving
 * 185.9mm ≈ 702.6px at 96dpi. Rounded DOWN so a sub-pixel rounding difference
 * can never push a chart past the margin and force a second page sideways.
 *
 * print.css reserves the same width as `--print-column` for the on-screen
 * preview; print-tokens.test.ts asserts the two cannot drift apart.
 */
export const CHART_WIDTH = 700;

const EMPTY = "No posts in this period.";

/** Recharts' own tick colour is a hard-coded grey; align it with the app's. */
const CHART_CLASSNAME =
  "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border";

function Panel({
  title,
  period,
  postCount,
  children,
}: {
  title: string;
  period: ReportPeriod;
  postCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className="print-block rounded-lg border p-5">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          {title}
        </div>
        {/* The same scope badge the screen shows, so the document and the app
            cannot disagree about what period a panel covers or how many posts
            it rests on. */}
        <ChartScope period={period} postCount={postCount} />
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="py-12 text-center text-sm text-muted-foreground">{EMPTY}</p>;
}

function Section({
  title,
  scope,
  children,
}: {
  title: string;
  scope: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span aria-hidden className="text-primary">
            —
          </span>
          {title}
        </div>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{scope}</p>
      </div>
      {children}
    </section>
  );
}

function ImpressionsByMonth({
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
    // The heading follows the ACTUAL granularity — a month period buckets by week.
    <Panel title={`Average impressions by ${bucket}`} period={period} postCount={postCount}>
      {data.length === 0 ? (
        <Empty />
      ) : (
        <BarChart
          width={CHART_WIDTH}
          height={220}
          data={data}
          margin={{ left: 4, right: 4, top: 16, bottom: 0 }}
          className={CHART_CLASSNAME}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
            tick={{ fontSize: 10 }}
          />
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
          {/* Animation off on every print chart: an animated bar that is
              snapshotted mid-flight prints at the wrong height, or at zero. */}
          <Bar
            dataKey="value"
            fill="var(--primary)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="value"
              position="top"
              className="fill-muted-foreground"
              fontSize={9}
            />
          </Bar>
        </BarChart>
      )}
    </Panel>
  );
}

function ImpressionsByWeekday({
  data,
  period,
  postCount,
}: {
  data: SeriesPoint[];
  period: ReportPeriod;
  postCount: number;
}) {
  const isEmpty = data.every((d) => d.value === 0);

  return (
    <Panel title="Average impressions by day of week posted" period={period} postCount={postCount}>
      {isEmpty ? (
        <Empty />
      ) : (
        <AreaChart
          width={CHART_WIDTH}
          height={200}
          data={data}
          margin={{ left: 4, right: 4, top: 4, bottom: 0 }}
          className={CHART_CLASSNAME}
        >
          <defs>
            <linearGradient id="fillPrintWeekdayImpressions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 10 }}
          />
          <Area
            dataKey="value"
            type="monotone"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#fillPrintWeekdayImpressions)"
            isAnimationActive={false}
          />
        </AreaChart>
      )}
    </Panel>
  );
}

function InteractionsByAsset({
  data,
  period,
  postCount,
}: {
  data: AssetBucket[];
  period: ReportPeriod;
  postCount: number;
}) {
  return (
    <Panel title="Average interactions by asset type" period={period} postCount={postCount}>
      {data.length === 0 ? (
        <Empty />
      ) : (
        <>
          <BarChart
            width={CHART_WIDTH}
            height={220}
            data={data}
            margin={{ left: 4, right: 4, top: 8, bottom: 0 }}
            className={CHART_CLASSNAME}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={0}
              tick={{ fontSize: 10 }}
            />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map((bucket, i) => (
                <Cell key={bucket.format} fill={rampColor(i, data.length)} />
              ))}
            </Bar>
          </BarChart>
          <AssetLegend data={data} format={(v) => v.toLocaleString()} />
        </>
      )}
    </Panel>
  );
}

function PostTypeDistribution({
  data,
  period,
  postCount,
}: {
  data: AssetBucket[];
  period: ReportPeriod;
  postCount: number;
}) {
  return (
    <Panel title="Post type distribution" period={period} postCount={postCount}>
      {data.length === 0 ? (
        <Empty />
      ) : (
        <>
          <BarChart
            width={CHART_WIDTH}
            height={220}
            data={data}
            layout="vertical"
            margin={{ left: 4, right: 44, top: 4, bottom: 0 }}
            className={CHART_CLASSNAME}
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
            <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {data.map((bucket, i) => (
                <Cell key={bucket.format} fill={rampColor(i, data.length)} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                className="fill-muted-foreground"
                fontSize={10}
                formatter={(value) => (typeof value === "number" ? `${value.toFixed(1)}%` : "")}
              />
            </Bar>
          </BarChart>
          <AssetLegend data={data} format={(v) => `${v.toFixed(1)}%`} />
        </>
      )}
    </Panel>
  );
}

export function PrintReport({ report }: { report: ClientReport }) {
  return (
    <div className="space-y-10">
      <Section title="Key performance" scope={scopeCaption(report.period)}>
        <div className="print-block">
          <KeyPerformance
            keyPerformance={report.keyPerformance}
            hasPosts={report.totalPostsAllTime > 0}
          />
        </div>
        <div className="print-block">
          <InteractionsComparison rows={report.interactionsComparison} />
        </div>
      </Section>

      <Section title="Engagement trends" scope={scopeCaption(report.period)}>
        <ImpressionsByMonth
          data={report.impressionsSeries}
          average={report.impressionsAverage}
          period={report.period}
          postCount={report.impressionsPostCount}
          bucket={report.impressionsBucket}
        />
        <ImpressionsByWeekday
          data={report.impressionsByWeekday}
          period={report.period}
          postCount={report.impressionsPostCount}
        />
      </Section>

      <Section title="Content mix" scope={scopeCaption(report.period)}>
        <InteractionsByAsset
          data={report.interactionsByAsset}
          period={report.period}
          postCount={report.assetPostCount}
        />
        <PostTypeDistribution
          data={report.postTypeDistribution}
          period={report.period}
          postCount={report.assetPostCount}
        />
      </Section>
    </div>
  );
}
