import { ImpressionsByMonthChart } from "@/components/dashboard/report/impressions-by-month-chart";
import { ImpressionsByWeekdayChart } from "@/components/dashboard/report/impressions-by-weekday-chart";
import { InteractionsByAssetChart } from "@/components/dashboard/report/interactions-by-asset-chart";
import { InteractionsComparison } from "@/components/dashboard/report/interactions-comparison";
import { KeyPerformance } from "@/components/dashboard/report/key-performance";
import { ContentComposition } from "@/components/dashboard/report/content-composition";
import { PostingCadence } from "@/components/dashboard/report/posting-cadence";
import { PostTypeDistributionChart } from "@/components/dashboard/report/post-type-distribution-chart";
import { scopeCaption } from "@/components/dashboard/report/report-period";
import { ReportPeriodPicker } from "@/components/dashboard/report/report-period-picker";
import { getGateReadGrant } from "@/lib/report-link-session";
import { availablePeriods, buildClientReport, parseReportPeriod } from "@/services/client-report";
import { toFormatMap } from "@/services/post-attributes";
import {
  readReportLinkSource,
  type ReportLinkOutreach,
  type ReportLinkSource,
} from "@/services/report-links";
import type { ClientReport } from "@/services/types";

import { OutreachSummary } from "./outreach-summary";
import { ReportStatus, type ReportFreshness } from "./report-status";

// ─────────────────────────────────────────────────────────────────────────────
// The client-facing report at `/r/<token>`, once past the Access Code gate.
//
// `PublicReport` (async) is the DATA path: it reads the short-lived read grant
// from the signed gate cookie and fetches THIS client's report source through the
// token+grant definer read (no service-role key, no direct bi.* access). A URL
// holder WITHOUT a valid grant, or an expired one, reads nothing → the neutral
// "not available" state. `PublicReportView` (pure) is the RENDER: the SAME report
// sections the staff page uses, with ALL staff chrome stripped.
//
// ⚠️ NO STAFF CHROME, EVER: no ClientTabs, no "Client list" back-link, no
// "Print / Export", no raw "read X of Y" banner. The test asserts not a single
// link into `/clients`. Freshness is REAL upload dates (Report Status strip).
// ─────────────────────────────────────────────────────────────────────────────

/** Data freshness from the client's uploads: earliest → tracked since, latest → current as of. */
function computeFreshness(uploads: ReportLinkSource["uploads"]): ReportFreshness {
  const dates = uploads
    .map((u) => u.createdAt)
    .filter((d): d is string => Boolean(d))
    .sort();
  if (dates.length === 0) return { currentAsOf: null, trackedSince: null };
  return { currentAsOf: dates[dates.length - 1]!, trackedSince: dates[0]! };
}

/**
 * The newest recorded value of one audience count across the client's uploads,
 * or null when no upload recorded it.
 *
 * ⚠️ IT WALKS BACKWARDS PAST THE GAPS. Uploads arrive oldest-first here, and an
 * upload that recorded nothing is skipped rather than read as a zero — which
 * matters most for connections, where the count is optional and gaps are the
 * norm. The two counts are searched INDEPENDENTLY: neither ever stands in for
 * the other.
 */
function latestCount(
  uploads: ReportLinkSource["uploads"],
  pick: (upload: ReportLinkSource["uploads"][number]) => number | null,
): number | null {
  for (let i = uploads.length - 1; i >= 0; i -= 1) {
    const count = pick(uploads[i]!);
    if (count != null) return count;
  }
  return null;
}

/** Build the report from the token+grant read bundle. No new query — pure over the rows. */
function buildReportFromSource(
  source: ReportLinkSource,
  periodParam: string | undefined,
): ClientReport {
  const rows = source.posts;
  const periods = availablePeriods(rows);
  return buildClientReport(rows, toFormatMap(source.attributes), {
    period: parseReportPeriod(periodParam, periods),
    now: new Date(),
    followers: latestCount(source.uploads, (u) => u.followerCount),
    connections: latestCount(source.uploads, (u) => u.connectionsCount),
    availablePeriods: periods,
  });
}

function NotAvailable() {
  return (
    <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center">
      <p className="text-sm text-muted-foreground">
        This report isn&apos;t available right now. Please check back shortly.
      </p>
    </div>
  );
}

/**
 * The DATA path. Reads the grant from the gate cookie and fetches the report
 * source; fails closed to the neutral notice on no/invalid/expired grant.
 */
export async function PublicReport({ token, period }: { token: string; period?: string }) {
  const grant = await getGateReadGrant(token);
  // No grant in the (signed) cookie → the URL alone earns nothing; don't even ask.
  const source = grant ? await readReportLinkSource(token, grant) : null;
  if (!source) {
    return (
      <div className="space-y-8">
        <NotAvailable />
      </div>
    );
  }
  return (
    <PublicReportView
      report={buildReportFromSource(source, period)}
      clientName={source.clientName}
      freshness={computeFreshness(source.uploads)}
      outreach={source.outreach}
    />
  );
}

function SectionHeader({ title, scope }: { title: string; scope: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        <span className="text-primary">—</span>
        {title}
      </div>
      <p className="mt-2 font-mono text-xs text-muted-foreground">{scope}</p>
    </div>
  );
}

/** The RENDER path (pure over a built report). */
export function PublicReportView({
  report,
  clientName,
  freshness,
  outreach = null,
}: {
  report: ClientReport;
  clientName: string | null;
  freshness: ReportFreshness;
  /**
   * This Client's outreach as aggregate counts, or null. Defaults to null — which
   * is also what "no snapshot" means — so the block simply does not appear.
   */
  outreach?: ReportLinkOutreach | null;
}) {
  const scope = scopeCaption(report.period);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span className="text-primary">—</span>
          LinkedIn report
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl leading-none font-extrabold tracking-tight">
            {clientName ?? "Performance report"}
          </h1>
          {/* KEPT: the period picker (rewrites `?period=` on THIS route). The staff
              back-link and Print/Export link that used to sit beside it are gone. */}
          <ReportPeriodPicker periods={report.availablePeriods} value={report.period.key} />
        </div>
      </div>

      <div className="space-y-10">
        <ReportStatus report={report} freshness={freshness} />

        {/* Aggregate counts only, and absent entirely when this Client has no
            outreach snapshot (ADR 0012). Renders nothing on its own when null. */}
        <OutreachSummary outreach={outreach} />

        {/* A partial history, in plain client language — NOT the "read X of Y"
            developer banner. Omitted entirely when the read was complete. */}
        {report.truncation ? (
          <p className="rounded-md border border-dashed bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            Some figures reflect a portion of the full posting history and may be updated as more
            data is processed.
          </p>
        ) : null}

        <section className="space-y-4">
          <SectionHeader title="Key performance" scope={scope} />
          <KeyPerformance
            keyPerformance={report.keyPerformance}
            hasPosts={report.totalPostsAllTime > 0}
          />
          <InteractionsComparison rows={report.interactionsComparison} />
        </section>

        <section className="space-y-4">
          <SectionHeader title="Engagement trends" scope={scope} />
          <div className="grid gap-3.5 xl:grid-cols-2">
            <ImpressionsByMonthChart
              data={report.impressionsSeries}
              average={report.impressionsAverage}
              period={report.period}
              postCount={report.impressionsPostCount}
              bucket={report.impressionsBucket}
            />
            <ImpressionsByWeekdayChart
              data={report.impressionsByWeekday}
              period={report.period}
              datedPosts={report.impressionsPostCount - report.weekdayUndatedPosts}
              undatedPosts={report.weekdayUndatedPosts}
            />
          </div>
        </section>

        {report.cadence.totalPosts > 0 ? (
          <section className="space-y-4">
            <SectionHeader title="Posting cadence" scope={scope} />
            <PostingCadence cadence={report.cadence} />
          </section>
        ) : null}

        <section className="space-y-4">
          <SectionHeader title="Content mix" scope={scope} />
          <div className="grid gap-3.5 xl:grid-cols-2">
            <InteractionsByAssetChart
              data={report.interactionsByAsset}
              period={report.period}
              postCount={report.assetPostCount}
            />
            <PostTypeDistributionChart
              data={report.postTypeDistribution}
              period={report.period}
              postCount={report.assetPostCount}
            />
          </div>
        </section>

        {report.composition.totalPosts > 0 ? (
          <section className="space-y-4">
            <SectionHeader title="Content composition" scope={scope} />
            <ContentComposition composition={report.composition} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
