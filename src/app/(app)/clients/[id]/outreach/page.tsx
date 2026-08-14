import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ClientTabs } from "@/components/dashboard/client/client-tabs";
import {
  NotAssignedGate,
  ServicesUnreadableNotice,
} from "@/components/dashboard/client/service-gate";
import { EmailFunnelPanel } from "@/components/dashboard/outreach/email-funnel-panel";
import { OutreachBreakdownChart } from "@/components/dashboard/outreach/outreach-breakdown-chart";
import { OutreachDisclosure } from "@/components/dashboard/outreach/outreach-disclosure";
import { OutreachFunnel } from "@/components/dashboard/outreach/outreach-funnel";
import { OutreachKpis } from "@/components/dashboard/outreach/outreach-kpis";
import { OutreachMovementPanel } from "@/components/dashboard/outreach/outreach-movement";
import { OutreachSentChart } from "@/components/dashboard/outreach/outreach-sent-chart";
import {
  OutreachAllVoided,
  OutreachNoSnapshot,
  OutreachTruncated,
  OutreachUnavailable,
} from "@/components/dashboard/outreach/outreach-states";
import { ProspectTable } from "@/components/dashboard/outreach/prospect-table";
import { canSee } from "@/lib/service-access";
import { getClientServices } from "@/services/arcbound-services";
import { getClient } from "@/services/clients";
import { buildEmailAnalytics } from "@/services/email-analytics";
import { latestSnapshot, listOutreachUploads, snapshotById } from "@/services/outreach";
import { buildOutreachAnalytics, outreachMovement, sentTrend } from "@/services/outreach-analytics";
import type {
  EmailAnalytics,
  LatestSnapshot,
  OutreachAnalytics,
  OutreachMovementState,
  OutreachUpload,
} from "@/services/types";

export const metadata: Metadata = { title: "Client outreach" };

/**
 * The Outreach tab: this Client's most recent prospect snapshot.
 *
 * ⚠️ STAFF-ONLY, AND MORE LOAD-BEARING THAN IT WAS. This page now renders the
 * PROSPECT ROWS THEMSELVES, not only tallies: every full name, every LinkedIn
 * URL, every location, the drafted personal messages, and the email addresses
 * embedded in Notes — third-party personal data about people who never agreed to
 * be in ArcBase. Until the table landed, the worst a leak could expose was a set
 * of counts; now it is a contact list.
 *
 * ADR 0012 draws the line explicitly: a Client sees outreach ONLY as aggregate
 * counts, produced inside the Report Link's SECURITY DEFINER function so the
 * rows never leave the database on that path. So: no component on this page —
 * and least of all `ProspectTable`, `prospectColumns` or the pills — may be
 * reused by a print view, by the public `/r/[token]` route, or by anything a
 * Client can reach. There is deliberately no export, download, or copy-all
 * control anywhere in this subtree, and adding one is a decision for ADR 0012,
 * not for a component.
 *
 * ⚠️ FOUR READ STATES, FOUR RENDERINGS. `latestSnapshot` distinguishes a read
 * that BROKE, a Client who has never had an upload, and a Client whose every
 * snapshot was VOIDED. Collapsing the first into the second would let a failed
 * read render as a Client with no outreach; collapsing the third into the second
 * would tell staff "nothing has been uploaded for this client" about data that
 * is sitting in the database, voided — and send them to re-upload it.
 */
export default async function ClientOutreachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Independent reads — `latestSnapshot` takes the id, not the client — so they
  // go out together. Reading a snapshot for a client that turns out not to exist
  // is harmless: the result is discarded by the notFound() below.
  //
  // The upload history rides along even though only the movement panel wants it:
  // it depends on nothing above, so issuing it here costs no wall clock, and
  // waiting for the snapshot first would put a second round-trip in series.
  const [client, snapshot, uploads, access] = await Promise.all([
    getClient(id),
    latestSnapshot(id),
    listOutreachUploads(id),
    getClientServices(id),
  ]);
  if (!client) notFound();

  // ⚠️ `access?.held ?? null` PRESERVES THE "COULD NOT BE READ" STATE — see the
  // identical comment on the Posts and Report pages. `canSee` fails OPEN on a
  // null read, so an unreadable registry still shows the real snapshot below.
  const assigned = canSee(access?.held ?? null, "outreach_prospects");

  // Movement needs a SECOND snapshot read (see `readMovement` below); skip it
  // entirely for an unassigned Client rather than fetching data this render will
  // not show.
  const analytics =
    assigned && snapshot.status === "ok" ? buildOutreachAnalytics(snapshot.prospects) : null;
  // ⚠️ `hasEmailChannel` DECIDES THIS, NOT THE ROWS (D3). A snapshot uploaded
  // before the email channel existed renders "not in this export" rather than
  // a zeroed funnel — see `buildEmailAnalytics`'s own comment.
  const emailAnalytics: EmailAnalytics | null =
    assigned && snapshot.status === "ok"
      ? buildEmailAnalytics(snapshot.prospects, snapshot.upload.hasEmailChannel)
      : null;
  const movement =
    assigned && snapshot.status === "ok" && analytics
      ? await readMovement(id, snapshot, analytics, uploads)
      : null;

  return (
    <div className="space-y-8">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-widest text-muted-foreground uppercase transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Client list
      </Link>

      <div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span className="text-primary">—</span>
          Outreach system
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-3xl leading-none font-extrabold tracking-tight">
            {client.name}
          </h2>
        </div>
      </div>

      <ClientTabs clientId={client.id} />

      {/* ⚠️ ONLY WHEN THE REGISTRY ITSELF COULD NOT BE READ. `assigned` fails OPEN
          in that case (see `canSee`), so the real snapshot still renders below —
          this banner is what stops an empty result there from being read as "ran
          and found nothing" when the truth is "we do not know whether this
          applies" (D14). The original production bug this slice exists to close
          was exactly this collapse, unlabelled, for every Client. */}
      {access === null ? <ServicesUnreadableNotice /> : null}

      {!assigned ? (
        <NotAssignedGate clientId={client.id} clientName={client.name} sectionName="Outreach" />
      ) : snapshot.status === "unavailable" ? (
        <OutreachUnavailable />
      ) : snapshot.status === "empty" ? (
        <OutreachNoSnapshot />
      ) : /* ⚠️ BEFORE the dashboard branch, and NOT folded into `empty`. Adding
             `all-voided` to `LatestSnapshot` broke type-check in exactly five
             places in this file — which is the point: the compiler forced this
             decision rather than letting a voided-away Client quietly inherit
             "nothing has been uploaded for this client". */
      snapshot.status === "all-voided" ? (
        <OutreachAllVoided voidedCount={snapshot.voidedCount} />
      ) : analytics === null ? null : (
        <div className="space-y-8">
          {/* Real but incomplete figures still render — beneath a banner saying
              every one of them is a floor. */}
          {snapshot.truncated ? (
            <OutreachTruncated read={snapshot.prospects.length} total={snapshot.total} />
          ) : null}

          <OutreachKpis analytics={analytics} />

          {/* ⚠️ TWO FUNNELS, SIDE BY SIDE, NEVER SUMMED (D1). Each panel is
              labelled with its own channel — LinkedIn here, Email inside
              `EmailFunnelPanel` — so the pairing can never be misread as one
              funnel with seven steps. */}
          <div className="grid gap-3.5 xl:grid-cols-2">
            <div>
              <div className="mb-2 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                LinkedIn
              </div>
              <OutreachFunnel funnel={analytics.funnel} />
            </div>
            <EmailFunnelPanel emailAnalytics={emailAnalytics!} />
          </div>

          {/* ⚠️ SITS BELOW THE FUNNELS AND DISAGREES WITH THE LINKEDIN ONE ON
              PURPOSE. Stage is CURRENT STANDING — the furthest point each
              prospect reached — so Stage "Replied" counts only those who
              stopped there, while the funnel's Replied counts everyone who
              ever answered. The caption says which, because the numbers
              differ and a reader is owed the reason. */}
          <OutreachBreakdownChart
            title="Stage — where each prospect stands now"
            data={analytics.stage}
            caption={`${analytics.totalProspects.toLocaleString("en-US")} prospects`}
            note="Stage is the furthest point a prospect reached, so these are current standings rather than pipeline steps. A prospect who replied and then booked a meeting appears under Meeting Booked only — which is why these counts differ from the pipeline panel, and why neither should be reconciled with the other."
          />

          <div className="grid gap-3.5 xl:grid-cols-2">
            <OutreachBreakdownChart
              title="Connection status"
              data={analytics.connectionStatus}
              caption={`${analytics.totalProspects.toLocaleString("en-US")} prospects`}
              // ⚠️ DESCRIBES THE RELATIONSHIP, NEVER THIS SNAPSHOT'S ARITHMETIC.
              // An earlier version asserted "more prospects are accepted than sit
              // at the Connected stage" — true of today's export (217 vs 177) and
              // FALSE on a Client's first upload, where everyone who accepted is
              // still at Connected and the two charts show the same number. Copy
              // that states an invariant the page can visibly contradict is worse
              // than no copy at all.
              note="A binary accepted/pending flag, recorded separately from Stage and never reconciled with it. This counts everyone whose request was accepted; the Stage chart counts only those who have gone no further, so accepted is never fewer — and is equal whenever nobody has moved on yet."
            />
            <OutreachBreakdownChart
              title="Reply status"
              data={analytics.replyStatus}
              caption={`${analytics.totalProspects.toLocaleString("en-US")} prospects`}
              note={replyNote(analytics.unrecognisedReplyValues.length)}
            />
          </div>

          <div className="grid gap-3.5 xl:grid-cols-2">
            <OutreachBreakdownChart
              title="Follow-ups per prospect"
              data={analytics.followUps}
              caption={`${analytics.totalProspects.toLocaleString("en-US")} prospects`}
              note={
                analytics.unreadableFollowUpCounts > 0
                  ? `${analytics.unreadableFollowUpCounts.toLocaleString("en-US")} rows carried a follow-up count that could not be read as a number. They are shown in their own bar rather than folded into zero.`
                  : undefined
              }
            />
          </div>

          <OutreachSentChart points={sentTrend(analytics.sentOverTime)} />

          {/* ⚠️ ITS OWN FOUR-STATE READ, NOT A DERIVATIVE OF THE ONE ABOVE. The
              figures on this page describe ONE snapshot and are complete without
              a second; movement needs two, and every way that can fail — an
              unreadable history, a single upload, an unreadable predecessor, a
              partial read — is a different sentence rather than a missing panel.
              `null` here means the current snapshot itself never rendered. */}
          {movement ? <OutreachMovementPanel state={movement} /> : null}

          {/* `emailAnalytics` is computed from the identical condition as
              `analytics` above (`assigned && snapshot.status === "ok"`), so it
              is never null on this branch — the assertion below states that,
              it does not paper over an unreachable case. */}
          <OutreachDisclosure analytics={analytics} emailAnalytics={emailAnalytics!} />

          {/* ⚠️ THE SAME ARRAY THE AGGREGATES WERE BUILT FROM — NO SECOND READ.
              `latestSnapshot` already fetched every row, paged past the 1,000-row
              cap, to compute everything above; the table is a view of data
              already in memory.

              ⚠️ AND THE AGGREGATES ABOVE DO NOT RESCOPE TO ITS FILTERS. Every
              funnel step is captioned with the column and rule that produced it
              ("a date is recorded in Date Sent"); recomputing those over a
              filtered subset would make each caption a false statement about a
              number beside it. The KPIs, funnel and charts describe the WHOLE
              snapshot, always. That is structural rather than a convention: the
              filter state lives inside the client component below and there is
              no channel by which it could reach this server render. */}
          <section className="space-y-4">
            <div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                <span className="text-primary">—</span>
                Prospects
              </div>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                {/* When the read was capped, "N of M shown" below counts what was
                    READ, not what exists — the banner at the top of the page says
                    so, and this repeats the qualifier where the number is. */}
                {snapshot.truncated
                  ? "Every prospect ArcBase could read from this snapshot. The read was capped, so the totals below are lower bounds."
                  : "Every prospect in this snapshot. Filters and search here do not change the figures above."}
              </p>
            </div>
            <ProspectTable prospects={snapshot.prospects} />
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * Which of the movement panel's states this Client is actually in.
 *
 * ⚠️ THE PREVIOUS SNAPSHOT IS FOUND RELATIVE TO THE ONE ON SCREEN, NOT AS
 * `uploads[1]`. The history and the snapshot are two separate reads: if an
 * upload lands between them, `uploads[0]` is a snapshot the page is not showing
 * and `uploads[1]` is the one it IS — so a positional guess would compare the
 * displayed snapshot against itself and print a row of zeros. Locating the
 * displayed upload in the list makes the pairing exact; failing to find it means
 * the two reads disagree, and the honest answer then is that we cannot name a
 * predecessor, not that there isn't one.
 *
 * ⚠️ A TRUNCATED READ ON EITHER SIDE SHOWS NO DELTAS AT ALL. Truncated counts
 * are floors, and a floor subtracted from a total manufactures movement: a
 * previous snapshot short by 435 rows reads as "−435 requests sent", which looks
 * exactly like a real collapse. This is the fifth state — the brief named four —
 * and it exists because the alternative is a confident, fabricated number.
 */
async function readMovement(
  clientId: string,
  snapshot: Extract<LatestSnapshot, { status: "ok" }>,
  analytics: OutreachAnalytics,
  uploads: OutreachUpload[] | null,
): Promise<OutreachMovementState> {
  // `listOutreachUploads` nulls a FAILED read and a TRUNCATED one alike — a
  // partial history cannot say what the previous snapshot was.
  if (uploads === null) return { status: "history-unavailable" };

  const index = uploads.findIndex((u) => u.id === snapshot.upload.id);
  if (index === -1) return { status: "history-unavailable" };

  const previous = uploads[index + 1];
  if (previous === undefined) return { status: "single" };

  // Checked before the read is issued: there is nothing to learn from fetching
  // rows we have already decided we cannot compare.
  if (snapshot.truncated) return { status: "partial-read" };

  const before = await snapshotById(clientId, previous.id);
  if (before.status === "unavailable") {
    return { status: "previous-unavailable", previousAt: previous.createdAt };
  }
  if (before.truncated) return { status: "partial-read" };

  return {
    status: "ok",
    // ⚠️ RECOMPUTED FROM THE PREVIOUS SNAPSHOT'S RAW ROWS, through the SAME
    // function that produced the figures above. No per-snapshot count is stored
    // (ADR 0009), so a corrected reading moves every historical figure with it —
    // and both sides of every comparison are defined identically by construction.
    movement: outreachMovement(analytics, buildOutreachAnalytics(before.prospects)),
    previousAt: previous.createdAt,
    currentAt: snapshot.upload.createdAt,
  };
}

/** The reply chart's caveat, present only when something was actually unreadable. */
function replyNote(unrecognised: number): string | undefined {
  if (unrecognised === 0) return undefined;
  return `${unrecognised} status value${unrecognised === 1 ? "" : "s"} could not be matched to a known reply and ${unrecognised === 1 ? "is" : "are"} grouped as "Status not recognised". The exact wording appears below rather than being guessed at.`;
}
