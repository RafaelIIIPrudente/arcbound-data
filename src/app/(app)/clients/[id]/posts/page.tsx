import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import {
  AnalyticsTruncated,
  AnalyticsUnavailable,
} from "@/components/dashboard/analytics/analytics-unavailable";
import { ClientTabs } from "@/components/dashboard/client/client-tabs";
import {
  NotAssignedGate,
  ServicesUnreadableNotice,
} from "@/components/dashboard/client/service-gate";
import { PostsTable } from "@/components/dashboard/posts/posts-table";
import { scopeCaption } from "@/components/dashboard/report/report-period";
import { ReportPeriodPicker } from "@/components/dashboard/report/report-period-picker";
import { canSee } from "@/lib/service-access";
import { paths } from "@/paths";
import { getClientServices } from "@/services/arcbound-services";
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

  // Independent reads — `getClientPosts` and `getClientServices` both take the
  // id, not the client — so all three go out together rather than one waiting on
  // another. Fetching posts (and the registry) for a client that turns out not to
  // exist is harmless: the results come back empty/unused and are discarded by
  // the notFound() below.
  const [client, posts, access] = await Promise.all([
    getClient(id),
    getClientPosts({ clientId: id, period }),
    getClientServices(id),
  ]);
  if (!client) notFound();

  // ⚠️ `access?.held ?? null` PRESERVES THE "COULD NOT BE READ" STATE. `access`
  // is `null` on a failed registry read; `canSee` fails OPEN on that (see
  // service-access.ts), so this page still renders the real data below — the
  // banner is what warns that an empty result may not mean what it looks like.
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
          Posts
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-3xl leading-none font-extrabold tracking-tight">
            {client.name}
          </h2>
          {/* The SAME picker, reading the same `?period=` param and the same
              `availablePeriods`, so this screen and the report always offer the
              same windows for the same client. Rendered even when not assigned —
              the picker is cheap chrome, and hiding it would make the gate below
              look like a different, more broken page than it is. */}
          <ReportPeriodPicker
            periods={posts.availablePeriods}
            value={posts.period.key}
            // A staff screen, so the custom range is opted INTO. The prop defaults
            // to false precisely so `/r/[token]` cannot inherit it.
            allowCustom
            today={new Date()}
          />
        </div>
      </div>

      <ClientTabs clientId={client.id} />

      {/* ⚠️ ONLY WHEN THE REGISTRY ITSELF COULD NOT BE READ (`access === null`).
          `assigned` already fails OPEN in that case (see `canSee`), so the real
          content below still renders — this banner is what stops an empty result
          there from being read as "ran and found nothing" when the truth is "we
          do not know whether this even applies" (D14). */}
      {access === null ? <ServicesUnreadableNotice /> : null}

      {!assigned ? (
        <NotAssignedGate clientId={client.id} clientName={client.name} sectionName="Posts" />
      ) : posts.unavailable ? (
        // "Could not be read" — deliberately NOT the empty table, which would
        // read as "this client has no posts".
        <AnalyticsUnavailable />
      ) : (
        <div className="space-y-4">
          {/* ⚠️ THE READ CAP, NOT THE DISPLAY CAP BELOW. This banner means rows
              that exist were never FETCHED, so `totalInPeriod` is itself a lower
              bound; `cappedTo` below means every row was read and the table shows
              the top slice. Two different facts, and the reader must be able to
              tell "we only saw part of your history" from "we trimmed a long,
              complete list". */}
          {posts.truncation ? (
            <AnalyticsTruncated read={posts.truncation.read} total={posts.truncation.total} />
          ) : null}
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
