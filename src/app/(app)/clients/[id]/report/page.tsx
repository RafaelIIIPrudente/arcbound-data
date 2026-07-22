import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";

import { AnalyticsUnavailable } from "@/components/dashboard/analytics/analytics-unavailable";
import { ClientTabs } from "@/components/dashboard/client/client-tabs";
import { ImpressionsByMonthChart } from "@/components/dashboard/report/impressions-by-month-chart";
import { ImpressionsByWeekdayChart } from "@/components/dashboard/report/impressions-by-weekday-chart";
import { InteractionsByAssetChart } from "@/components/dashboard/report/interactions-by-asset-chart";
import { InteractionsComparison } from "@/components/dashboard/report/interactions-comparison";
import { KeyPerformance } from "@/components/dashboard/report/key-performance";
import { PostTypeDistributionChart } from "@/components/dashboard/report/post-type-distribution-chart";
import { scopeCaption } from "@/components/dashboard/report/report-period";
import { ReportPeriodPicker } from "@/components/dashboard/report/report-period-picker";
import { paths } from "@/paths";
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

  // Independent reads — `getClientReport` takes the id, not the client — so they
  // go out together rather than one waiting on the other. Fetching a report for
  // a client that turns out not to exist is harmless: the rows come back empty
  // and the result is discarded by the notFound() below.
  const [client, report] = await Promise.all([
    getClient(id),
    getClientReport({ clientId: id, period }),
  ]);
  if (!client) notFound();

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
            <ReportPeriodPicker periods={report.availablePeriods} value={report.period.key} />
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

      {report.unavailable ? (
        <AnalyticsUnavailable />
      ) : (
        <div className="space-y-10">
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
                postCount={report.impressionsPostCount}
              />
            </div>
          </section>

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
        </div>
      )}
    </div>
  );
}
