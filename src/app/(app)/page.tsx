import type { Metadata } from "next";
import Link from "next/link";

import {
  AnalyticsTruncated,
  AnalyticsUnavailable,
} from "@/components/dashboard/analytics/analytics-unavailable";
import { ClientComparisonTable } from "@/components/dashboard/analytics/client-comparison";
import { DashboardFilters } from "@/components/dashboard/analytics/dashboard-filters";
// ⚠️ FROM `dashboard-range.ts`, NOT FROM THE FILTER BAR. `dashboard-filters.tsx`
// carries "use client", and a directive converts every EXPORT of a module into a
// client reference — constants included. This page read `PRESET_DAYS` from there
// until 2026-08-13, so `decodeRange`'s `presets.includes(days)` dotted into a
// proxy and threw on `/?range=7d` and `/?range=90d` in production. Enforced by
// `src/rsc-boundary.test.ts`, not by this comment.
import { PRESET_DAYS } from "@/components/dashboard/analytics/dashboard-range";
import { EngagementChart } from "@/components/dashboard/analytics/engagement-chart";
import { ImpressionsChart } from "@/components/dashboard/analytics/impressions-chart";
import { KpiCards } from "@/components/dashboard/analytics/kpi-cards";
import { WeekdayImpressionsChart } from "@/components/dashboard/analytics/weekday-impressions-chart";
import { Button } from "@/components/ui/button";
import {
  decodeRange,
  encodeRange,
  spanLabel,
  toPeriodToken,
  utcDayBounds,
  type RangeSelection,
} from "@/lib/date-range";
import { paths } from "@/paths";
import { getDashboardAnalytics } from "@/services/analytics";
// The posts screen's dialect, from the module that OWNS it. A second hand-written
// "custom:" here is exactly the drift this import prevents — see `toPeriodToken`.
import { CUSTOM_PREFIX } from "@/services/client-report";
import { listClientRegistry } from "@/services/clients";

export const metadata: Metadata = { title: "Post analytics" };

const DEFAULT_SELECTION: RangeSelection = { kind: "preset", days: 30 };

/**
 * The `?range=` token as a window, or the default.
 *
 * ⚠️ THIS IS THE ONLY GATE ON A FUTURE-ENDING WINDOW, AND IT REFUSES RATHER THAN
 * CLAMPS. The picker cannot produce one; a hand-edited URL can. `resolveWindow`
 * deliberately does not clamp either — trimming the window to today while it
 * still baselines against the full DECLARED span would compare a short period
 * against a long one and report the shortfall as a change. Falling back to the
 * default is the only reading that invents nothing.
 *
 * Not exported: Next rejects arbitrary named exports from a page module. Its
 * branches are covered through the page itself in page.test.tsx, which asserts
 * the window actually handed to the analytics seam.
 */
function normalizeRange(value: string | undefined, now: Date): RangeSelection {
  if (value === undefined) return DEFAULT_SELECTION;
  // `decodeRange` already refuses unknown presets, malformed days, inverted
  // ranges and the report's `custom:` dialect — it returns null, never a guess.
  const decoded = decodeRange(value, PRESET_DAYS);
  if (decoded === null) return DEFAULT_SELECTION;
  if (decoded.kind !== "custom") return decoded;
  // The day boundary is UTC, matching the windowing — on a UTC+8 dev machine a
  // local reading would accept tomorrow-in-UTC for most of the working day.
  const today = utcDayBounds(new Date(now.getTime()).toISOString().slice(0, 10));
  return utcDayBounds(decoded.endDay).startMs > today.startMs ? DEFAULT_SELECTION : decoded;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; range?: string }>;
}) {
  const { client, range: rawRange } = await searchParams;
  // One clock for the whole render: the decoder's "is this in the future?" test,
  // the calendar's disabled days and the caption all read the same instant.
  const now = new Date();
  const range = normalizeRange(rawRange, now);
  const rangeLabel = spanLabel(range, now);
  const clientId = client && client !== "all" ? client : undefined;

  // The client book is read ONCE per request. The filter needs only id + name,
  // so it reads the cheap `listClientRegistry` — NOT `listClients`, which also
  // joins post counts and latest-upload timestamps the dropdown never shows — and
  // hands the SAME in-flight read to `getDashboardAnalytics`, whose all-clients
  // comparison reuses it instead of reading `public.clients` a second time. The
  // shared promise still overlaps the analytics posts read under `Promise.all`.
  const registry = listClientRegistry();
  const [analytics, clientList] = await Promise.all([
    getDashboardAnalytics({ clientId, range, registry }),
    registry,
  ]);
  const clients = clientList ?? [];
  // `totalPosts > 0` is the honest has-data signal: it is the count of posts in
  // the current window, which is exactly what every figure below is computed from.
  // (It previously keyed off `recentPosts.length`, a leftover from the removed
  // recent-posts table; the two are equivalent — `recentPosts` is `[]` iff the
  // window is empty — so `recentPosts` is now vestigial on this page. Left in place;
  // removing it is a separate change with its own blast radius.)
  const hasData = analytics.totalPosts > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            <span className="text-primary">—</span>
            Overview
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {analytics.totalPosts.toLocaleString()} posts · last sync {analytics.lastSync}
          </p>
        </div>
        <DashboardFilters
          clients={clients}
          client={client ?? "all"}
          // ⚠️ THE NORMALISED SELECTION, NOT THE RAW PARAM. A token the decoder
          // refused (`?range=garbage`, or a window ending next month) would
          // otherwise sit in the trigger while the screen below renders the
          // default — the control claiming a window nobody is looking at.
          range={encodeRange(range)}
          today={now}
        />
      </div>

      {analytics.unavailable ? (
        <AnalyticsUnavailable />
      ) : hasData ? (
        <>
          {/* ⚠️ ABOVE the figures, not instead of them. A truncated read still
              produced real numbers — they are simply lower bounds, and the
              banner is what stops them being read as totals. */}
          {analytics.truncation ? (
            <AnalyticsTruncated
              read={analytics.truncation.read}
              total={analytics.truncation.total}
            />
          ) : null}
          <KpiCards hero={analytics.hero} kpis={analytics.kpis} rangeLabel={rangeLabel} />
          {/* ⚠️ ONE drill-through for the whole screen, and it belongs HERE — these
              are the figures a reader wants to open. Not one link per chart: the
              cards and every chart below share a single window, so six links
              would be six spellings of the same destination.

              ⚠️ THE TOKEN IS TRANSLATED, NEVER THE `?range=` VALUE FORWARDED. The
              two screens speak different dialects on purpose (`date-range.ts`
              documents why), and the posts screen does not error on a token it
              cannot read — it falls back to the newest MONTH. Forwarding `30d`
              would land the reader on a confident table of the wrong posts.

              ⚠️ NOT GATED ON `linkedin_post_metrics` FROM HERE. Pre-checking the
              destination's service gate would cost another read per client and
              could fail open differently on the two screens, leaving them
              disagreeing about what a client is assigned. The destination gates
              itself. */}
          <div className="-mt-1 flex justify-end">
            {clientId ? (
              <Link
                href={`${paths.clients.posts(clientId)}?period=${toPeriodToken(range, now, CUSTOM_PREFIX)}`}
                className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-foreground"
              >
                View these posts <span aria-hidden="true">→</span>
              </Link>
            ) : (
              // All clients: there is no single posts page to point at, and
              // guessing a default client is a PARKED product decision. The copy
              // says where this actually goes rather than promising posts.
              <Link
                href={paths.clients.list}
                className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-foreground"
              >
                Choose a client to open its posts <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
          <div className="grid gap-3.5 lg:grid-cols-[1.6fr_1fr]">
            <ImpressionsChart data={analytics.impressionsSeries} rangeLabel={rangeLabel} />
            <EngagementChart
              data={analytics.engagementSeries}
              value={analytics.engagement.value}
              delta={analytics.engagement.delta}
            />
          </div>
          {/* Dated by estimated_post_date alone; undated (hour-age) posts have no
              assertable weekday and are disclosed, not bucketed onto a scrape day.
              `datedPosts` is the count actually averaged — `totalPosts` minus the
              excluded undated ones. */}
          <WeekdayImpressionsChart
            data={analytics.impressionsByWeekday}
            rangeLabel={rangeLabel}
            placedPosts={analytics.weekdayPlacedPosts}
            coarsePosts={analytics.weekdayCoarsePosts}
            undatedPosts={analytics.weekdayUndatedPosts}
          />
          {/* All-clients state only: the service returns `null` when one client
              is selected, and does not issue the comparison's two extra reads. */}
          {analytics.comparison ? (
            <ClientComparisonTable comparison={analytics.comparison} />
          ) : null}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border py-20 text-center">
          <div>
            <p className="font-display text-lg font-semibold">No posts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This client has no ingested posts in the selected range.
            </p>
          </div>
          <Button asChild>
            <Link href={paths.upload}>Add post metrics</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
