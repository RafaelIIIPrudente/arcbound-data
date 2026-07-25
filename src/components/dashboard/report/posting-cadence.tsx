import type { PostingCadence } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Posting cadence: five plain figures and an all-time timeline. It reports how
// regularly a Client posts and NEVER scores it — no index, no percentile, no
// "fairly regular" label. The gaps are the finding; the timeline lets the reader
// judge regularity themselves, against the visible N of Total posts.
//
// ⚠️ PRINT-SAFE BY CONSTRUCTION. The report's recharts panels mis-size at print
// time because ResponsiveContainer measures its parent through a ResizeObserver
// that races the print re-layout. This timeline has nothing to measure: it is
// plain HTML positioned by PERCENTAGES, which resolve against the fixed print
// column with no observer and no animation. `print-block` keeps the whole section
// off a page fold, and every fill is a theme token the print-color-adjust rule
// preserves. The one figure that leaves the building renders correctly on paper.
//
// ⚠️ FOUR STATES, NEVER COLLAPSED. A not-applicable figure (a gap with fewer than
// two dated posts) is an em dash with a spoken reason; a MEASURED zero (two posts
// one day apart) is a real "0"; an undated post is disclosed in plain language,
// counted in the total but absent from the timeline. The service keeps these
// apart (see cadence.ts); this component must render them apart too.
// ─────────────────────────────────────────────────────────────────────────────

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
 * Month labels along the axis. Every month while the span is short enough to read
 * (≤ 8); on a longer span only the year boundaries, so the labels never collide.
 * The first month's label is pinned to the left edge even when the post falls
 * mid-month, so the axis always names where it starts.
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

function Timeline({ timeline }: { timeline: number[] }) {
  const first = timeline[0]!;
  const last = timeline[timeline.length - 1]!;
  const span = last - first;
  // A single dated post — or several on one day — has a zero-length span; its
  // mark sits at the centre rather than dividing by zero.
  const pct = (ms: number) => (span === 0 ? 50 : ((ms - first) / span) * 100);

  return (
    <div className="space-y-1.5">
      <ol
        role="list"
        aria-label="Posting timeline, one mark per dated post"
        className="relative h-12 border-b border-border"
      >
        {timeline.map((ms, i) => (
          <li
            key={`${ms}-${i}`}
            style={{ left: `${pct(ms).toFixed(3)}%` }}
            className="absolute bottom-0 h-3 w-[3px] -translate-x-1/2 rounded-full bg-primary"
          >
            <span className="sr-only">{formatDate(ms)}</span>
          </li>
        ))}
      </ol>
      <div className="relative h-4" aria-hidden>
        {axisLabels(first, last).map((l) => (
          <span
            key={l.key}
            style={{ left: `${l.pct.toFixed(3)}%` }}
            className="absolute -translate-x-1/2 font-mono text-[9px] tracking-[0.1em] whitespace-nowrap text-muted-foreground uppercase"
          >
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Plain-language disclosure of undated posts — counted, but not on the timeline. */
function undatedDisclosure(undated: number, total: number): string {
  const has = undated === 1 ? "has" : "have";
  const they = undated === 1 ? "it isn’t" : "they aren’t";
  return `${undated.toLocaleString()} of ${total.toLocaleString()} posts ${has} no post date, so ${they} shown on the timeline or used to measure gaps.`;
}

export function PostingCadence({ cadence }: { cadence: PostingCadence }) {
  const {
    totalPosts,
    datedPosts,
    undatedPosts,
    postsPerWeek,
    medianGapDays,
    longestGapDays,
    daysSinceLastPost,
    timeline,
  } = cadence;

  // ⚠️ 0 POSTS → NO BODY. A client with no posts at all is handled by the
  // report's own no-data state; a "Posting cadence" panel full of em dashes would
  // add nothing. The page hides the section header too when this returns null.
  if (totalPosts === 0) return null;

  const RATE_REASON = "a posting rate needs at least two dated posts";
  const GAP_REASON = "measuring a gap needs at least two dated posts";

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

      {datedPosts > 0 ? <Timeline timeline={timeline} /> : null}

      {undatedPosts > 0 ? (
        <p className="max-w-2xl text-xs text-muted-foreground">
          {undatedDisclosure(undatedPosts, totalPosts)}
        </p>
      ) : null}
    </div>
  );
}
