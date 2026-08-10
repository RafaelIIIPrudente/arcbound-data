import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";

import {
  AnalyticsTruncated,
  AnalyticsUnavailable,
} from "@/components/dashboard/analytics/analytics-unavailable";
import { ClientTabs } from "@/components/dashboard/client/client-tabs";
import {
  NotAssignedGate,
  ServicesUnreadableNotice,
} from "@/components/dashboard/client/service-gate";
import { SectionTabs } from "@/components/dashboard/client/section-tabs";
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
import { canSee } from "@/lib/service-access";
import { paths } from "@/paths";
import { getClientServices } from "@/services/arcbound-services";
import { getClientReport } from "@/services/client-report";
import { getClient } from "@/services/clients";

export const metadata: Metadata = { title: "Client LinkedIn report" };

function SectionHeader({
  title,
  scope,
  children,
}: {
  title: string;
  scope: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span className="text-primary">—</span>
          {title}
        </div>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{scope}</p>
      </div>
      {children}
    </div>
  );
}

export default async function ClientReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const [{ id }, { period }] = await Promise.all([params, searchParams]);

  // Independent reads — `getClientReport` and `getClientServices` both take the
  // id, not the client — so all three go out together rather than one waiting on
  // another. Fetching a report (and the registry) for a client that turns out not
  // to exist is harmless: the results come back empty/unused and are discarded by
  // the notFound() below.
  const [client, report, access] = await Promise.all([
    getClient(id),
    getClientReport({ clientId: id, period }),
    getClientServices(id),
  ]);
  if (!client) notFound();

  // ⚠️ `access?.held ?? null` PRESERVES THE "COULD NOT BE READ" STATE — see the
  // identical comment on the Posts page. `canSee` fails OPEN on a null read.
  const assigned = canSee(access?.held ?? null, "linkedin_post_metrics");

  return (
    <div className="space-y-8">
      <Link
        href={paths.clients.list}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-widest text-muted-foreground uppercase transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Client list
      </Link>

      <div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span className="text-primary">—</span>
          LinkedIn report
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-3xl leading-none font-extrabold tracking-tight">
            {client.name}
          </h2>
          {/* The picker lives HERE, in the page header, because it governs all
              three sections. It used to sit inside the Key Performance header,
              which correctly signalled that it scoped that section alone — that
              is no longer true, and a control placed inside one section while
              driving the whole page misrepresents its own reach. */}
          <div className="flex flex-wrap items-center gap-2">
            <ReportPeriodPicker
              periods={report.availablePeriods}
              value={report.period.key}
              // A staff screen, so the custom range is opted INTO. The prop
              // defaults to false precisely so `/r/[token]` cannot inherit it.
              allowCustom
              today={new Date()}
            />
            {/* Opens the print-optimised document in its own tab, carrying the
                period selected here so the export matches what is on screen. */}
            <Link
              href={`${paths.clients.reportPrint(client.id)}?period=${encodeURIComponent(report.period.key)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-[11px] tracking-widest text-muted-foreground uppercase transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              <Printer className="size-3.5" aria-hidden />
              Print / Export
            </Link>
          </div>
        </div>
      </div>

      <ClientTabs clientId={client.id} />
      {/* ⚠️ THE LINKEDIN SECTION'S SUB-NAV, ON BOTH ITS PAGES (D17/D18). Rendered
          UNCONDITIONALLY — same placement as `ClientTabs` above — so it states
          where you are, not a verdict on whether the Client is assigned; a
          direct visit to this page while not assigned still shows a way to
          Posts, and vice versa. Rendering it only here would leave someone on
          `/posts` with no way back into the section they are inside. */}
      <SectionTabs
        tabs={[
          { href: paths.clients.report(client.id), label: "Report" },
          { href: paths.clients.posts(client.id), label: "Posts" },
        ]}
      />

      {/* ⚠️ ONLY WHEN THE REGISTRY ITSELF COULD NOT BE READ. `assigned` fails OPEN
          in that case (see `canSee`), so the real report still renders — this
          banner is what stops an empty section below from being read as "ran and
          found nothing" when the truth is "we do not know whether this applies"
          (D14). */}
      {access === null ? <ServicesUnreadableNotice /> : null}

      {!assigned ? (
        <NotAssignedGate
          clientId={client.id}
          clientName={client.name}
          sectionName="LinkedIn Report"
        />
      ) : report.unavailable ? (
        <AnalyticsUnavailable />
      ) : (
        <div className="space-y-10">
          {/* A truncated read means the pager stopped at its cap, so every figure
              in all three sections below counts only the posts it reached — a
              lower bound, not a total. The same banner the print export carries,
              so screen and paper say it in the same words. Absent when the read
              was complete, rather than reassuring with "showing all". */}
          {report.truncation ? (
            <AnalyticsTruncated read={report.truncation.read} total={report.truncation.total} />
          ) : null}
          {/* ALL THREE sections follow the period chosen in the page header. */}
          <section className="space-y-4">
            <SectionHeader title="Key performance" scope={scopeCaption(report.period)} />
            <KeyPerformance
              keyPerformance={report.keyPerformance}
              hasPosts={report.totalPostsAllTime > 0}
            />
            <InteractionsComparison rows={report.interactionsComparison} />
          </section>

          <section className="space-y-4">
            <SectionHeader title="Engagement trends" scope={scopeCaption(report.period)} />
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
                // Datable posts only — the weekday chart excludes undated ones,
                // so its N is the sibling impressions chart's N minus those. The
                // month/week chart above keeps `impressionsPostCount` untouched.
                datedPosts={report.impressionsPostCount - report.weekdayUndatedPosts}
                undatedPosts={report.weekdayUndatedPosts}
              />
            </div>
          </section>

          {/* Posting cadence — a sibling of the temporal sections, and like them it
              FOLLOWS the period picker (the service scopes it). Hidden when the
              SELECTED period has no posts, so no empty header is stranded — keyed on
              the period-scoped count, not the all-time one (the component also
              self-guards on a zero total). */}
          {report.cadence.totalPosts > 0 ? (
            <section className="space-y-4">
              <SectionHeader title="Posting cadence" scope={scopeCaption(report.period)} />
              <PostingCadence cadence={report.cadence} />
            </section>
          ) : null}

          <section className="space-y-4">
            <SectionHeader title="Content mix" scope={scopeCaption(report.period)} />
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

          {/* Content composition — sibling of Content mix, and like the other
              sections it FOLLOWS the period picker (the service scopes it). Hidden
              when the selected period has no posts (the component also self-guards). */}
          {report.composition.totalPosts > 0 ? (
            <section className="space-y-4">
              <SectionHeader title="Content composition" scope={scopeCaption(report.period)} />
              <ContentComposition composition={report.composition} />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
