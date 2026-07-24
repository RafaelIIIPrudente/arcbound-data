"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { FollowerPoint, FollowerTrend } from "@/lib/follower-trend";

// ─────────────────────────────────────────────────────────────────────────────
// Follower movement on the Client detail page.
//
// ⚠️ FOUR STATES, FOUR TREATMENTS. "Could not be read", "nothing recorded", "one
// reading" and "a trend" are four different facts. Collapsing any of them into
// "0% growth" would state a measurement that was never taken — see the module in
// `@/lib/follower-trend`, which keeps them apart as four distinct shapes so this
// component cannot accidentally read movement off a level.
//
// ⚠️ IT DOES NOT DUPLICATE THE FOLLOWERS KPI CARD ABOVE IT. That card shows the
// newest upload's count; this shows how that figure got there. The series ends
// on the same number by construction, so the two cannot contradict each other.
// ─────────────────────────────────────────────────────────────────────────────

const config = {
  followers: { label: "Followers", color: "var(--primary)" },
} satisfies ChartConfig;

export interface FollowerChartPoint {
  /**
   * Epoch milliseconds.
   *
   * ⚠️ A NUMERIC TIME DOMAIN, NOT AN ORDINAL INDEX. Uploads are irregularly
   * spaced, so plotting them at equal intervals would draw a three-month gap
   * exactly like a one-week gap — every value correct and the shape wrong, which
   * is the most common way a trend chart lies.
   */
  t: number;
  followers: number;
}

export function toChartPoints(series: FollowerPoint[]): FollowerChartPoint[] {
  return series.map((p) => ({ t: Date.parse(p.at), followers: p.followers }));
}

/** Matches `upload-history.tsx`, including its unparseable-date guard. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function tickLabel(ms: number | undefined): string {
  // An unreadable tick is blank, never the string "Invalid Date".
  if (ms === undefined || Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Signed, never absolute — a loss printed bare reads as a gain. */
function signed(n: number): string {
  return n.toLocaleString("en-US", { signDisplay: "exceptZero" });
}

function signedPercent(n: number): string {
  return `${n.toLocaleString("en-US", {
    signDisplay: "exceptZero",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/**
 * ⚠️ EVERY FIGURE IS ONLY MEANINGFUL WITH ITS WINDOW. "+400" means nothing until
 * the reader knows whether that was a week or a year, and the reading count says
 * how thin the evidence is.
 *
 * A zero span is honest, not a bug: two uploads on one day really did observe
 * nothing in between.
 */
function spanLabel(spanDays: number, readings: number): string {
  const r = `${readings} readings`;
  if (spanDays === 0) return `${r} on the same day`;
  return `${r} over ${spanDays} ${spanDays === 1 ? "day" : "days"}`;
}

/**
 * Direction, carried by a glyph AND a word.
 *
 * ⚠️ NEVER BY COLOUR ALONE, and a decline is never styled as an error — it is a
 * finding. Same convention as the `Delta` component on this page.
 */
function Direction({ value }: { value: number }) {
  if (value === 0) return null;
  const up = value > 0;
  return (
    <>
      <span aria-hidden>{up ? "▲" : "▼"}</span>{" "}
      <span className="sr-only">{up ? "Up" : "Down"} </span>
    </>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-36 flex-1 rounded-lg border bg-card px-5 py-4">
      <div className="font-display text-2xl leading-none font-extrabold tracking-tight tabular-nums">
        {children}
      </div>
      <div className="mt-2 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
        Follower trend
      </div>
      {children}
    </section>
  );
}

export function FollowerTrendPanel({ trend }: { trend: FollowerTrend }) {
  // 1 — the read FAILED. Nothing is known, which is not "no growth". Matches how
  // the page already renders `uploadsUnavailable`.
  if (trend.kind === "unavailable") {
    return (
      <Shell>
        <div className="font-display text-2xl leading-none font-extrabold tracking-tight">
          <span aria-hidden>—</span>
          <span className="sr-only">Follower trend could not be read</span>
        </div>
        <p className="text-sm text-muted-foreground">
          The upload history could not be read, so there is no follower trend to show.
        </p>
      </Shell>
    );
  }

  // 2 — read fine, but nothing was ever written down.
  if (trend.kind === "none") {
    return (
      <Shell>
        <p className="py-6 text-center text-sm text-muted-foreground">
          No follower count has been recorded yet.
        </p>
      </Shell>
    );
  }

  // 3 — ⚠️ ONE READING IS A LEVEL, NOT A TREND. No chart, no line, no
  // percentage: a single dot on an axis implies a stability nobody observed, and
  // a 0% change asserts a measurement that was never taken.
  if (trend.kind === "single") {
    return (
      <Shell>
        <div className="font-display text-3xl leading-none font-extrabold tracking-tight tabular-nums">
          {trend.latest.followers.toLocaleString("en-US")}
        </div>
        <p className="text-sm text-muted-foreground">
          One reading so far, recorded {formatDate(trend.latest.at)}. A trend needs a second upload.
        </p>
      </Shell>
    );
  }

  // 4 — a trend.
  const points = toChartPoints(trend.series);

  return (
    <Shell>
      <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
        <LineChart data={points} margin={{ left: 4, right: 12, top: 12, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          {/* ⚠️ `type="number"` + `scale="time"` is what makes the gaps
              proportional. An ordinal axis here would misrepresent an
              irregular upload cadence while plotting every value correctly. */}
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={tickLabel}
            interval="preserveStartEnd"
          />
          {/* Ticks are labelled with real counts so a non-zero baseline is
              visible rather than implied. */}
          <YAxis
            width={48}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => v.toLocaleString("en-US")}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => tickLabel(payload[0]?.payload.t)}
              />
            }
          />
          <Line
            dataKey="followers"
            type="monotone"
            stroke="var(--color-followers)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ChartContainer>

      <div className="flex flex-wrap gap-3.5">
        <Figure label="Net change">
          <Direction value={trend.net} />
          {signed(trend.net)}
          <span className="sr-only"> followers</span>
        </Figure>
        <Figure label="Percent change">
          {trend.percent === null ? (
            <>
              <span aria-hidden>—</span>
              <span className="sr-only">No percentage can be worked out</span>
            </>
          ) : (
            <>
              <Direction value={trend.percent} />
              {signedPercent(trend.percent)}
            </>
          )}
        </Figure>
      </div>

      <p className="text-sm text-muted-foreground">
        Measured across {spanLabel(trend.spanDays, trend.series.length)}, between{" "}
        {formatDate(trend.series[0]!.at)} and {formatDate(trend.series.at(-1)!.at)}.
        {trend.percent === null
          ? " The first reading was 0, so there is no percentage to work out — growth from nothing has no starting point to compare against."
          : ""}
      </p>
    </Shell>
  );
}
