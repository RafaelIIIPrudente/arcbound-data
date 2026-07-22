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

  const client = await getClient(id);
  if (!client) notFound();

  const report = await getClientReport({ clientId: id, period });

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

      <ClientTabs clientId={client.id} />

      {report.unavailable ? (
        <AnalyticsUnavailable />
      ) : (
        <div className="space-y-10">
          {/* SECTION 1 — scoped by the picker, which sits in this header so it is
              unambiguous that it governs this section and not the whole page. */}
          <section className="space-y-4">
            <SectionHeader
              title="Key performance"
              scope={`Scoped to ${report.period.label.toLowerCase()}`}
            >
              <ReportPeriodPicker periods={report.availablePeriods} value={report.period.key} />
            </SectionHeader>
            <KeyPerformance
              keyPerformance={report.keyPerformance}
              periodLabel={report.period.label}
              hasPosts={report.totalPostsAllTime > 0}
            />
            <InteractionsComparison rows={report.interactionsComparison} />
          </section>

          {/* SECTIONS 2 and 3 are deliberately all-time and say so. */}
          <section className="space-y-4">
            <SectionHeader title="Engagement trends" scope="All time · every post on record" />
            <div className="grid gap-3.5 xl:grid-cols-2">
              <ImpressionsByMonthChart
                data={report.impressionsByMonth}
                average={report.impressionsAverage}
              />
              <ImpressionsByWeekdayChart data={report.impressionsByWeekday} />
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader title="Content mix" scope="All time · every post on record" />
            <div className="grid gap-3.5 xl:grid-cols-2">
              <InteractionsByAssetChart data={report.interactionsByAsset} />
              <PostTypeDistributionChart data={report.postTypeDistribution} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
