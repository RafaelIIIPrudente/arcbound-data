import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ClientTabs } from "@/components/dashboard/client/client-tabs";
import {
  ConnectionsTrendPanel,
  FollowerTrendPanel,
} from "@/components/dashboard/client/follower-trend";
import { ClientIndustryWriterCard } from "@/components/dashboard/client/client-industry-writer-card";
import { ClientServicesCard } from "@/components/dashboard/client/client-services-card";
import { MetricInfo } from "@/components/dashboard/metric-info";
import { ReportLinkCard } from "@/components/dashboard/client/report-link-card";
import { UploadHistory } from "@/components/dashboard/client/upload-history";
import { getRole, isAdmin } from "@/lib/auth/roles";
import { connectionsTrend, followerTrend } from "@/lib/follower-trend";
import { displayLinkedInUrl } from "@/lib/linkedin-url";
import { connectionsDelta, followersDelta, postsDelta, type UploadDelta } from "@/lib/upload-delta";
import { paths } from "@/paths";
import { getClientServices } from "@/services/arcbound-services";
import { getClient } from "@/services/clients";
import { listIndustriesAdmin } from "@/services/industries";
import { getReportLink } from "@/services/report-links";
import { listWritersAdmin } from "@/services/writers";
import { listUploads } from "@/services/uploads";

export const metadata: Metadata = { title: "Client detail" };

/**
 * Movement since the previous ingest, in the same shape the dashboard KPI cards
 * use: the ▲/▼ glyph carries direction visually and an sr-only word carries it
 * for assistive tech, so direction is never conveyed by colour alone.
 *
 * A FLAT result prints `0` with no glyph. It must not borrow the em dash —
 * that is reserved for "could not be read", and a confirmed no-change week is
 * a finding, not missing data.
 */
function Delta({ delta, noun }: { delta: UploadDelta; noun: string }) {
  if (delta.direction === "flat") {
    return (
      <span className="font-mono text-muted-foreground tabular-nums">
        0<span className="sr-only"> change in {noun} since the previous upload</span>
      </span>
    );
  }
  const up = delta.direction === "up";
  return (
    <span className="font-mono text-primary tabular-nums">
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "Up" : "Down"} </span>
      {Math.abs(delta.value).toLocaleString()}
      <span className="sr-only"> {noun} since the previous upload</span>
    </span>
  );
}

/**
 * `value === null` means the figure could NOT BE READ, and renders as an em dash
 * with a spoken explanation — never as a 0, which would assert a fact we do not
 * have (see `Client.postsCount`).
 *
 * `delta` is optional: absent when there is no prior ingest to compare against.
 * It sits beside the figure rather than under the label so the three cards keep
 * the same height whether or not they carry one.
 */
function KpiCard({
  label,
  value,
  delta,
  deltaNoun,
  metric,
}: {
  label: string;
  value: string | number | null;
  delta?: UploadDelta | null;
  deltaNoun?: string;
  /**
   * The `metric-definitions.ts` key for this card's ⓘ.
   *
   * ⚠️ THE DEFINITION COVERS THE FIGURE AND THE CHANGE BESIDE IT, because on
   * this tab those are not always the same measurement: the number next to
   * Posts is the last upload's `rowsInserted`, NOT the change in the post count
   * it sits beside. Two adjacent pipelines, one card — which is the single most
   * misreadable thing on this screen and the reason these cards have an ⓘ.
   */
  metric?: string;
}) {
  return (
    // Content-sized, NOT `flex-1`. Growing to fill stretched three small
    // figures across half the viewport and stranded them from the name they
    // describe; the comp sizes them to their content.
    <div className="min-w-30 rounded-lg border bg-card px-5 py-4">
      <div className="flex items-baseline gap-2">
        <div className="font-display text-3xl leading-none font-extrabold tracking-tight tabular-nums">
          {value === null ? (
            <>
              <span aria-hidden>—</span>
              <span className="sr-only">{label} could not be read</span>
            </>
          ) : (
            value
          )}
        </div>
        {delta && deltaNoun ? (
          <div className="text-[11.5px]">
            <Delta delta={delta} noun={deltaNoun} />
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
        {metric ? <MetricInfo metric={metric} /> : null}
      </div>
    </div>
  );
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // `getReportLink` is a metadata-only read that degrades to null on failure, so
  // it can join the same parallel fetch without ever failing the page.
  // The role joins the same parallel fetch — it is one indexed lookup and, like
  // `getReportLink`, cannot fail the page: `getRole()` never throws and resolves
  // to the least-privileged answer when it cannot tell (ADR 0013).
  // ⚠️ `getClientServices` REPLACES A LOCAL loadServices THIS PAGE USED TO OWN.
  // It is now the SAME cache()-memoised read `ClientTabs` calls for this same
  // Client on this same render — one round trip, not two — and it degrades to
  // `null` (never `[]`) on failure, for the same reason the removed local
  // function did: a services read must not take the uploads, KPIs and report
  // link down with it, and `[]` would assert "no services" for a read that
  // simply failed. `supabase/arcbound-services.sql` has been applied since
  // 2026-08-14, so the read ordinarily succeeds and this degradation is the
  // rare path — but it is still reachable whenever the registry read fails,
  // which is the only reason it exists.
  // ⚠️ THE ROLE IS READ FIRST, AND ONLY BECAUSE SOMETHING DEPENDS ON IT. The two
  // picker reads below fill controls that ONLY an admin is shown, so an analyst
  // must not trigger them: they would be work with no consumer, and one of them
  // was the staff directory — every colleague's email address — serialized into
  // a read-only viewer's page payload for a component that returns before
  // touching it. That particular exposure is gone with the directory itself
  // (D15: a writer is a registry row, not an account), but the gating stands:
  // an analyst cannot edit either field, so reading either registry for them is
  // work with no consumer. `clients/page.tsx` gates the identical pair this way.
  //
  // The extra await costs nothing measurable: `getRole()` is `cache()`-memoised
  // per request and the shell has already called it by the time this renders.
  const role = await getRole();
  const admin = isAdmin(role);

  // ⚠️ THE TWO PICKER READS DEGRADE TO `null` AND NEVER `[]`, for the reason the
  // whole slice turns on: a save re-sends BOTH the industry and the writer, so a
  // picker that renders from an empty list where the read merely failed would
  // have no option matching this Client — and the next save would silently clear
  // the field. `null` tells the card to keep the current value in a hidden input
  // instead of offering a choice it cannot honour.
  //
  // ⚠️ AN ANALYST'S `null` IS NOT THAT SIGNAL. The card returns its read-only
  // view before either list is read, so `null` never reaches a picker there —
  // asserted in `page.test.tsx` rather than left to hold by luck.
  //
  // They also cannot fail the page, same rule as `getReportLink` and `getRole`.
  const [client, uploads, reportLink, access, industries, writers] = await Promise.all([
    getClient(id),
    listUploads(id),
    getReportLink(id),
    getClientServices(id),
    admin ? listIndustriesAdmin().catch(() => null) : null,
    admin ? listWritersAdmin().catch(() => null) : null,
  ]);
  if (!client) notFound();

  // `uploads === null` means the read FAILED — not that there are none. The
  // count renders as `—` rather than a `0` nobody could distinguish from a
  // brand-new client (same rule as `postsCount`).
  const uploadsUnavailable = uploads === null;

  // Followers = the follower count captured with the most recent upload. Already
  // `—` when there is no count to show, which now also covers a failed read.
  const latest = uploads?.[0];
  const followers =
    latest && latest.followerCount != null ? latest.followerCount.toLocaleString() : "—";

  // Connections = the connection count captured with the most recent upload.
  //
  // ⚠️ THE EM DASH IS THE COMMON CASE HERE, AND IT IS CORRECT. The count is
  // OPTIONAL at capture and no upload predating the column carries one, so most
  // clients legitimately show `—`. It must never soften into a `0`: that would
  // report a measured zero for a number nobody supplied.
  const connections =
    latest && latest.connectionsCount != null ? latest.connectionsCount.toLocaleString() : "—";

  return (
    <div className="space-y-8">
      <Link
        href={paths.clients.list}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-widest text-muted-foreground uppercase transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Client list
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            <span className="text-primary">—</span>
            Client
          </div>
          <h2 className="mt-2.5 font-display text-[34px] leading-none font-extrabold tracking-tight">
            {client.name}
          </h2>
          <a
            href={client.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {displayLinkedInUrl(client.linkedin_url)}
          </a>
        </div>
        <div className="flex flex-wrap gap-3.5">
          {/* Uploads carries no delta: "how many more uploads than last upload"
              is a restatement of the count, not a second fact. */}
          <KpiCard
            label="Uploads"
            value={uploadsUnavailable ? null : uploads.length}
            metric="overviewUploads"
          />
          <KpiCard
            label="Posts"
            value={client.postsCount}
            delta={postsDelta(uploads)}
            deltaNoun="new posts"
            metric="overviewPosts"
          />
          <KpiCard
            label="Followers"
            value={followers}
            delta={followersDelta(uploads)}
            deltaNoun="followers"
            metric="overviewFollowers"
          />
          <KpiCard
            label="Connections"
            value={connections}
            delta={connectionsDelta(uploads)}
            deltaNoun="connections"
            metric="overviewConnections"
          />
        </div>
      </div>

      <ClientTabs clientId={client.id} />

      {/* Which Arcbound Services this Client receives (ADR 0015). Admin-editable;
          an analyst sees the same assignment read-only. Also what decides the tab
          row above and every gated section (Posts, LinkedIn Report, Outreach) —
          this card is where that assignment is actually changed. */}
      {access ? (
        <ClientServicesCard
          clientId={client.id}
          services={access.services}
          assignedIds={access.held.map((service) => service.id)}
          isAdmin={admin}
        />
      ) : (
        // ⚠️ NOT AN EMPTY CARD. Rendering the card with `[]` would tell an admin
        // this Client has no services — which reads as "cannot upload" and "no
        // sections available" and sends someone to fix a problem that may not
        // exist. A failed read is its own state and says so.
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive"
        >
          This client&apos;s services could not be read, so they are not shown. This is not the same
          as having none.
        </p>
      )}

      {/* Which industry this Client is in and who writes for them. Admin-editable;
          an analyst sees both read-only. ⚠️ EVERY SAVE WRITES BOTH FIELDS — the
          RPC applies both arguments including NULL, so there is no partial update
          and whatever the form omits is cleared. The card's header explains how it
          holds that line; `client.industry` and `client.writer` are the current
          values it must carry through. */}
      <ClientIndustryWriterCard
        clientId={client.id}
        industry={client.industry}
        writer={client.writer}
        industries={industries}
        writers={writers}
        isAdmin={admin}
      />

      {/* The private link + out-of-band Access Code staff hand this Client their
          own report through. `status` is null when no link exists (→ Create); the
          Access Code is shown once at Create/Rotate and never re-rendered from
          here (it isn't on ReportLinkStatus). See components/report-link +
          supabase/report-links.sql. */}
      <ReportLinkCard clientId={client.id} status={reportLink} isAdmin={admin} />

      {/* Both derived from the SAME `uploads` array the cards above read, with no
          second query — so neither series can end on a different figure than its
          card shows. Side by side from `xl`, stacked below it: they are the two
          halves of one audience picture and invite comparison. */}
      <div className="grid gap-3.5 xl:grid-cols-2">
        <FollowerTrendPanel trend={followerTrend(uploads)} />
        <ConnectionsTrendPanel trend={connectionsTrend(uploads)} />
      </div>

      <UploadHistory uploads={uploads} />
    </div>
  );
}
