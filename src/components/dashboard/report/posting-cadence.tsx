"use client";

import { useState } from "react";

import type { CadenceBucket, PostingCadence } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Posting cadence: five plain figures and a switchable timeline. It reports how
// regularly a Client posts and NEVER scores it — no index, no percentile, no
// "fairly regular" label. The gaps are the finding; the chart lets the reader
// judge regularity themselves, against the visible N of Total posts.
//
// The chart has THREE views the reader switches between (figures unchanged):
//   • Marks — one mark per post on a date axis; exact rhythm and gaps.
//   • Week  — a bar per calendar week; posts-per-week volume.
//   • Month — a bar per calendar month; posts-per-month volume.
// Everything follows the report's period picker (the service scopes it).
//
// ⚠️ PRINT-SAFE BY CONSTRUCTION. The report's recharts panels mis-size at print
// time because ResponsiveContainer measures its parent through a ResizeObserver
// that races the print re-layout. Every view here is plain HTML sized by
// PERCENTAGES/flex, which resolve against the fixed print column with no observer
// and no animation. `print-block` keeps the section off a page fold, and every
// fill is a theme token the print-color-adjust rule preserves. Print passes a
// FIXED `staticView` so the exported document shows one view with no dead toggle.
//
// ⚠️ FOUR STATES, NEVER COLLAPSED. A not-applicable figure (a gap with fewer than
// two dated posts) is an em dash with a spoken reason; a MEASURED zero (two posts
// one day apart, or a week with no posts) is a real "0"; an undated post is
// disclosed in plain language, counted in the total but absent from the chart.
// ─────────────────────────────────────────────────────────────────────────────

export type CadenceView = "marks" | "week" | "month";

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const CAPTION: Record<CadenceView, string> = {
  marks:
    "Each mark is one post, placed left to right by the date it went up — posts on the same day share a mark. Marks bunched together are posts in quick succession; a wide empty stretch is a gap with no posts.",
  week: "Each bar is one calendar week; its height is how many posts went up that week. An empty slot is a week with no posts.",
  month:
    "Each bar is one calendar month; its height is how many posts went up that month. An empty slot is a month with no posts.",
};

/** The em dash + a spoken reason: a figure that cannot exist yet, never a zero. */
function NotApplicable({ reason }: { reason: string }) {
  return (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">Not applicable: {reason}</span>
    </>
  );
}

/** A day count with its unit — the number carries the emphasis, "days" is quiet. */
function Days({ value }: { value: number }) {
  return (
    <>
      {value.toLocaleString()}
      <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
        {value === 1 ? "day" : "days"}
      </span>
    </>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-24">
      <div className="font-display text-2xl leading-none font-semibold tracking-tight tabular-nums">
        {children}
      </div>
      <div className="mt-1.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </div>
    </div>
  );
}

/** "25 Jan 2026" — spoken for each timeline mark so the axis is not sight-only. */
function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

interface AxisLabel {
  key: string;
  pct: number;
  label: string;
}

/**
 * Month labels along the marks axis. Every month while the span is short enough to
 * read (≤ 8); on a longer span only the year boundaries, so the labels never
 * collide. The first month's label is pinned to the left edge even when the post
 * falls mid-month, so the axis always names where it starts.
 */
function axisLabels(first: number, last: number): AxisLabel[] {
  const span = last - first;
  const end = new Date(last);
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth();

  const start = new Date(first);
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();

  const all: (AxisLabel & { month: number })[] = [];
  while (y < endY || (y === endY && m <= endM)) {
    const monthStart = Date.UTC(y, m, 1);
    const clamped = Math.max(monthStart, first); // the first month sits at the edge
    all.push({
      key: `${y}-${m}`,
      pct: span === 0 ? 50 : ((clamped - first) / span) * 100,
      label: m === 0 ? `Jan ${y}` : SHORT_MONTHS[m]!,
      month: m,
    });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }

  if (all.length <= 8) return all;
  // Too many to label every month: keep year starts, plus the two endpoints so
  // the axis is still anchored at both ends.
  return all.filter((l, i) => l.month === 0 || i === 0 || i === all.length - 1);
}

/** The Marks view: one tick per post on a date axis, with faint month gridlines. */
function MarksChart({ timeline }: { timeline: number[] }) {
  const first = timeline[0]!;
  const last = timeline[timeline.length - 1]!;
  const span = last - first;
  // A single dated post — or several on one day — has a zero-length span; its
  // mark sits at the centre rather than dividing by zero.
  const pct = (ms: number) => (span === 0 ? 50 : ((ms - first) / span) * 100);
  const labels = axisLabels(first, last);

  return (
    <div className="space-y-2.5">
      <ol
        role="list"
        aria-label="Posting timeline, one mark per dated post"
        className="relative h-7"
      >
        {labels.map((l) => (
          <span
            key={`grid-${l.key}`}
            aria-hidden
            style={{ left: `${l.pct.toFixed(3)}%` }}
            className="absolute inset-y-0 w-px bg-border/70"
          />
        ))}
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        {timeline.map((ms, i) => (
          <li
            key={`${ms}-${i}`}
            style={{ left: `${pct(ms).toFixed(3)}%` }}
            className="absolute top-1/2 h-4 w-0.75 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
          >
            <span className="sr-only">{formatDate(ms)}</span>
          </li>
        ))}
      </ol>

      <div className="relative h-4" aria-hidden>
        {labels.map((l) => (
          <span
            key={l.key}
            style={{ left: `${l.pct.toFixed(3)}%` }}
            className="absolute -translate-x-1/2 font-mono text-[9px] tracking-widest whitespace-nowrap text-muted-foreground uppercase"
          >
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The Week / Month view: a post-count bar per bucket, empty buckets kept visible. */
function BarsChart({ buckets, unit }: { buckets: CadenceBucket[]; unit: "week" | "month" }) {
  // Tallest bar sets the scale. `reduce`, not `Math.max(...)`, so a very long span
  // (many weekly buckets) cannot spread past the engine's argument limit. Floored
  // at 1 so an all-zero set — which cannot happen once a post is dated — is safe.
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 1);
  // On a long span, label only every Nth bucket so the axis never turns to mush.
  const step = Math.max(1, Math.ceil(buckets.length / 12));

  return (
    <div className="space-y-1.5">
      <ol
        role="list"
        aria-label={`Posts per ${unit}`}
        className="flex h-32 items-end gap-px border-b border-border"
      >
        {buckets.map((b, i) => (
          <li key={`${b.label}-${i}`} className="flex h-full flex-1 flex-col justify-end">
            <div
              aria-hidden
              style={{ height: `${(b.count / max) * 100}%` }}
              className="w-full rounded-t-sm bg-primary"
            />
            <span className="sr-only">
              {b.label}: {b.count} {b.count === 1 ? "post" : "posts"}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex gap-px" aria-hidden>
        {buckets.map((b, i) => (
          <span
            key={`${b.label}-${i}`}
            className="flex-1 truncate text-center font-mono text-[9px] tracking-[0.06em] whitespace-nowrap text-muted-foreground uppercase"
          >
            {i % step === 0 || i === buckets.length - 1 ? b.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: CadenceView;
  onChange: (v: CadenceView) => void;
}) {
  const options: { v: CadenceView; label: string }[] = [
    { v: "marks", label: "Marks" },
    { v: "week", label: "Week" },
    { v: "month", label: "Month" },
  ];
  return (
    <div role="group" aria-label="Timeline view" className="inline-flex rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={`rounded px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
            value === o.v
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Plain-language disclosure of undated posts — counted, but not on the chart. */
function undatedDisclosure(undated: number, total: number): string {
  const has = undated === 1 ? "has" : "have";
  const they = undated === 1 ? "it isn’t" : "they aren’t";
  return `${undated.toLocaleString()} of ${total.toLocaleString()} posts ${has} no post date, so ${they} shown on the chart or used to measure gaps.`;
}

/**
 * @param staticView When set, renders that one view with NO toggle — used by the
 * printed report, which is a static document and must not carry a dead control.
 * On screen it is omitted and the reader switches views themselves.
 */
export function PostingCadence({
  cadence,
  staticView,
}: {
  cadence: PostingCadence;
  staticView?: CadenceView;
}) {
  const [view, setView] = useState<CadenceView>(staticView ?? "marks");
  const {
    totalPosts,
    datedPosts,
    undatedPosts,
    postsPerWeek,
    medianGapDays,
    longestGapDays,
    daysSinceLastPost,
    timeline,
    weekly,
    monthly,
  } = cadence;

  // ⚠️ 0 POSTS → NO BODY. A client with no posts at all is handled by the
  // report's own no-data state; a "Posting cadence" panel full of em dashes would
  // add nothing. The page hides the section header too when this returns null.
  if (totalPosts === 0) return null;

  const RATE_REASON = "a posting rate needs at least two dated posts";
  const GAP_REASON = "measuring a gap needs at least two dated posts";

  const interactive = staticView === undefined;
  const activeView = interactive ? view : staticView;

  return (
    <div className="print-block space-y-6 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap gap-x-10 gap-y-5">
        <Figure label="Total posts">{totalPosts.toLocaleString()}</Figure>
        <Figure label="Posts per week">
          {postsPerWeek === null ? (
            <NotApplicable reason={RATE_REASON} />
          ) : (
            postsPerWeek.toLocaleString(undefined, { maximumFractionDigits: 1 })
          )}
        </Figure>
        <Figure label="Median gap between posts">
          {medianGapDays === null ? (
            <NotApplicable reason={GAP_REASON} />
          ) : (
            <Days value={medianGapDays} />
          )}
        </Figure>
        <Figure label="Longest gap">
          {longestGapDays === null ? (
            <NotApplicable reason={GAP_REASON} />
          ) : (
            <Days value={longestGapDays} />
          )}
        </Figure>
        <Figure label="Days since last post">
          {daysSinceLastPost === null ? (
            <NotApplicable reason="no post has a date to measure from" />
          ) : (
            <Days value={daysSinceLastPost} />
          )}
        </Figure>
      </div>

      {/* Discloses the basis of the rate: a client who posted steadily then paused
          reads as their rhythm WHILE active, with the silence since carried by
          "Days since last post". Only shown when a rate was actually computed. */}
      {postsPerWeek !== null ? (
        <p className="max-w-2xl text-xs text-muted-foreground">
          Posts per week is measured across the active span — the first dated post to the last — not
          up to today.
        </p>
      ) : null}

      {datedPosts > 0 ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              Post timeline
            </div>
            {interactive ? <ViewToggle value={activeView} onChange={setView} /> : null}
          </div>
          {/* ⚠️ THE CHART MEANS NOTHING WITHOUT THIS. A bare axis of marks or bars
              reads as a broken chart; the caption is what turns it into a rhythm
              the reader can actually see, and it changes with the view. */}
          <p className="max-w-2xl text-xs text-muted-foreground">{CAPTION[activeView]}</p>
          <div className="mt-3">
            {activeView === "marks" ? (
              <MarksChart timeline={timeline} />
            ) : (
              <BarsChart buckets={activeView === "week" ? weekly : monthly} unit={activeView} />
            )}
          </div>
        </div>
      ) : null}

      {undatedPosts > 0 ? (
        <p className="max-w-2xl text-xs text-muted-foreground">
          {undatedDisclosure(undatedPosts, totalPosts)}
        </p>
      ) : null}
    </div>
  );
}
