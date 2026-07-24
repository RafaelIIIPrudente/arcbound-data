import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AnalyticsUnavailable } from "@/components/dashboard/analytics/analytics-unavailable";
import { ClientTabs } from "@/components/dashboard/client/client-tabs";
import { PostsTable } from "@/components/dashboard/posts/posts-table";
import { scopeCaption } from "@/components/dashboard/report/report-period";
import { ReportPeriodPicker } from "@/components/dashboard/report/report-period-picker";
import { paths } from "@/paths";
import { getClientPosts } from "@/services/client-posts";
import { getClient } from "@/services/clients";

export const metadata: Metadata = { title: "Client posts" };

export default async function ClientPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const [{ id }, { period }] = await Promise.all([params, searchParams]);

  // Independent reads — `getClientPosts` takes the id, not the client — so they
  // go out together rather than one waiting on the other. Fetching posts for a
  // client that turns out not to exist is harmless: the rows come back empty and
  // the result is discarded by the notFound() below.
  const [client, posts] = await Promise.all([
    getClient(id),
    getClientPosts({ clientId: id, period }),
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
          Posts
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-3xl leading-none font-extrabold tracking-tight">
            {client.name}
          </h2>
          {/* The SAME picker, reading the same `?period=` param and the same
              `availablePeriods`, so this screen and the report always offer the
              same windows for the same client. */}
          <ReportPeriodPicker periods={posts.availablePeriods} value={posts.period.key} />
        </div>
      </div>

      <ClientTabs clientId={client.id} />

      {posts.unavailable ? (
        // "Could not be read" — deliberately NOT the empty table, which would
        // read as "this client has no posts".
        <AnalyticsUnavailable />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="font-mono text-xs text-muted-foreground">{scopeCaption(posts.period)}</p>
            {/* ⚠️ NO SILENT TRUNCATION. When the cap bites, the page states the
                cap AND the true total in plain language; when it does not, this
                notice is absent entirely rather than saying "showing all". */}
            {posts.cappedTo === null ? null : (
              <p className="font-mono text-xs text-muted-foreground">
                Showing the top {posts.cappedTo.toLocaleString()} of{" "}
                {posts.totalInPeriod.toLocaleString()} posts by impressions.
              </p>
            )}
          </div>
          <PostsTable data={posts.rows} />
        </div>
      )}
    </div>
  );
}
