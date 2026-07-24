import type { Metadata } from "next";
import Link from "next/link";

import {
  AnalyticsTruncated,
  AnalyticsUnavailable,
} from "@/components/dashboard/analytics/analytics-unavailable";
import { ClientComparisonTable } from "@/components/dashboard/analytics/client-comparison";
import { DashboardFilters } from "@/components/dashboard/analytics/dashboard-filters";
import { EngagementChart } from "@/components/dashboard/analytics/engagement-chart";
import { ImpressionsChart } from "@/components/dashboard/analytics/impressions-chart";
import { KpiCards } from "@/components/dashboard/analytics/kpi-cards";
import { RecentPostsTable } from "@/components/dashboard/analytics/recent-posts-table";
import { Button } from "@/components/ui/button";
import { paths } from "@/paths";
import { getDashboardAnalytics, RANGE_LABEL } from "@/services/analytics";
import { listClients } from "@/services/clients";
import type { DashboardRange } from "@/services/types";

export const metadata: Metadata = { title: "Post analytics" };

function normalizeRange(value?: string): DashboardRange {
  return value === "7d" || value === "30d" || value === "90d" ? value : "30d";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; range?: string }>;
}) {
  const { client, range: rawRange } = await searchParams;
  const range = normalizeRange(rawRange);
  const clientId = client && client !== "all" ? client : undefined;

  const [analytics, clientList] = await Promise.all([
    getDashboardAnalytics({ clientId, range }),
    listClients({ pageSize: 1000 }),
  ]);
  const clients = clientList.items.map((c) => ({ id: c.id, name: c.name }));
  const hasData = analytics.recentPosts.length > 0;

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
        <DashboardFilters clients={clients} client={client ?? "all"} range={range} />
      </div>

      {analytics.unavailable ? (
        <AnalyticsUnavailable />
      ) : hasData ? (
        <>
          {/* ⚠️ ABOVE the figures, not instead of them. A truncated read still
              produced real numbers — they are simply lower bounds, and the
              banner is what stops them being read as totals. */}
          {analytics.truncated ? <AnalyticsTruncated /> : null}
          <KpiCards hero={analytics.hero} kpis={analytics.kpis} rangeLabel={RANGE_LABEL[range]} />
          <div className="grid gap-3.5 lg:grid-cols-[1.6fr_1fr]">
            <ImpressionsChart data={analytics.impressionsSeries} rangeLabel={RANGE_LABEL[range]} />
            <EngagementChart
              data={analytics.engagementSeries}
              value={analytics.engagement.value}
              delta={analytics.engagement.delta}
            />
          </div>
          <RecentPostsTable posts={analytics.recentPosts} postCount={analytics.totalPosts} />
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
