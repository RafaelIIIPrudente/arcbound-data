import { MetricInfo } from "@/components/dashboard/metric-info";
import { REPORT_STATUS_METRIC_KEYS } from "@/lib/metric-definitions";
import type { ClientReport, MonthPoint } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Report Status — the freshness + activity strip atop a Client's public report.
//
// ⚠️ DESCRIBES STATE, NEVER GRADES IT. This is client-facing: it says WHAT the
// numbers are (how recent, how many, which direction), never whether they are
// good, best, optimal, top, or recommended. There is no score and no advice. A
// grep guard in the test enforces this; keep it that way.
//
// ⚠️ FOUR-STATE HONESTY, LIKE THE REST OF THE REPORT. A figure that cannot exist
// yet (no dated posts → no "most recent", no rhythm; too few points → no trend)
// is stated as absent in plain words, never faked as a zero or a flat line.
//
// Derives everything from figures ALREADY on the report (cadence timeline,
// impressions series, period) — no new read.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Data freshness, from the client's UPLOAD audit (NOT the post dates). `current
 * as of` is the latest ingest; `tracked since` the earliest. `null` when no upload
 * is on record → an em dash, never a faked date.
 */
export interface ReportFreshness {
  /** ISO 8601 of the latest Upload, or null. */
  currentAsOf: string | null;
  /** ISO 8601 of the earliest Upload, or null. */
  trackedSince: string | null;
}

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

/** A UTC date label like "20 Jul 2026" (UTC so it never wobbles by timezone). */
function formatUtcDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * A month label like "Jul 2026" — everything a coarsely-dated post can support.
 *
 * ⚠️ USED INSTEAD OF A DAY, NEVER ALONGSIDE ONE. A month-aged post was snapped to
 * the 1st of a month, so its day-of-month is an artifact of the resolver and not
 * a fact about the client. Printing "1 Jul 2026" for it states a day nobody
 * measured, on a document the client opens.
 */
function formatUtcMonth(ms: number): string {
  const d = new Date(ms);
  return `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Format an ISO upload date, or an em dash when absent. */
function formatIsoDate(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "—" : formatUtcDate(ms);
}

/**
 * The direction of the impressions series across the window — a DIRECTION, not a
 * verdict. `null` when there are fewer than two datable points to compare.
 */
function impressionsDirection(series: MonthPoint[]): "up" | "down" | "steady" | null {
  const values = series.filter((p) => p.value !== null).map((p) => p.value as number);
  if (values.length < 2) return null;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  if (first === 0) return last > 0 ? "up" : "steady";
  if (last > first * 1.05) return "up";
  if (last < first * 0.95) return "down";
  return "steady";
}

const DIRECTION_COPY: Record<"up" | "down" | "steady", string> = {
  up: "Trending up across this period",
  down: "Trending down across this period",
  steady: "Holding steady across this period",
};

/**
 * The ⓘ for one status label.
 *
 * ⚠️ THIS IMPORT EDGE IS DELIBERATE, AND IT IS WHY IT LIVES HERE RATHER THAN IN A
 * SHARED HELPER. Reaching for `MetricInfo` is what puts the Radix popover into a
 * route's bundle — see `RenderInfo` in `key-performance.tsx`. This component is
 * rendered only by `/r/[token]`, which is a surface the reader can actually
 * click, so the edge is paid where it is used.
 *
 * An unmapped label renders nothing at all: no ⓘ, never an invented definition.
 */
function statusInfo(label: string) {
  const key = REPORT_STATUS_METRIC_KEYS[label];
  return key ? <MetricInfo metric={key} /> : null;
}

function StatBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
        {statusInfo(label)}
      </div>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

export function ReportStatus({
  report,
  freshness,
}: {
  report: ClientReport;
  freshness: ReportFreshness;
}) {
  const { cadence, impressionsSeries, period } = report;
  const timeline = cadence.timeline;
  const latestMs = timeline.length > 0 ? timeline[timeline.length - 1]! : null;
  const direction = impressionsDirection(impressionsSeries);

  return (
    <section className="print-block space-y-4 rounded-lg border bg-card p-5">
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        <span className="text-primary">—</span>
        Report status
      </div>

      {/* Freshness (from the UPLOAD audit) + the most recent post. */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatBlock label="Reporting period">{period.label}</StatBlock>

        <StatBlock label="Current as of">{formatIsoDate(freshness.currentAsOf)}</StatBlock>

        <StatBlock label="Tracked since">{formatIsoDate(freshness.trackedSince)}</StatBlock>

        {/* ⚠️ THE DATE AND THE DAY COUNT ARE ONE CLAIM, AND THEY STAND OR FALL
            TOGETHER. Both are day-level statements about a single post — the most
            recent one — so both need that post dated to the day. Withholding the
            count while still printing "20 Jul 2026" would hand the reader the
            precise day anyway and fix nothing. When the post is coarser we show
            the MONTH, which is what it genuinely says, and drop the count. */}
        <StatBlock label="Most recent post">
          {latestMs === null ? (
            <span className="text-muted-foreground">No dated posts in this view</span>
          ) : cadence.lastPostDateIsExact ? (
            <>
              {formatUtcDate(latestMs)}
              {cadence.daysSinceLastPost !== null ? (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  (
                  {cadence.daysSinceLastPost === 0
                    ? "today"
                    : `${cadence.daysSinceLastPost} days ago`}
                  )
                </span>
              ) : null}
            </>
          ) : (
            <>
              Around {formatUtcMonth(latestMs)}
              <span className="ml-1.5 font-normal text-muted-foreground">
                (no exact date for this post)
              </span>
            </>
          )}
        </StatBlock>
      </div>

      {/* Plain, non-graded activity. */}
      <div className="grid gap-5 border-t pt-4 sm:grid-cols-3">
        <StatBlock label="Posts in this view">
          {cadence.totalPosts}
          {cadence.undatedPosts > 0 ? (
            <span className="ml-1.5 font-normal text-muted-foreground">
              ({cadence.datedPosts} dated, {cadence.undatedPosts} without a date)
            </span>
          ) : null}
        </StatBlock>

        <StatBlock label="Posting rhythm">
          {cadence.postsPerWeek === null ? (
            <span className="text-muted-foreground">Not enough dated posts to show a rhythm</span>
          ) : (
            <>
              ~{cadence.postsPerWeek.toLocaleString(undefined, { maximumFractionDigits: 1 })}{" "}
              <span className="font-normal text-muted-foreground">posts per week</span>
            </>
          )}
        </StatBlock>

        <StatBlock label="Impressions trend">
          {direction === null ? (
            <span className="text-muted-foreground">Not enough data to show a trend yet</span>
          ) : (
            DIRECTION_COPY[direction]
          )}
        </StatBlock>
      </div>
    </section>
  );
}
