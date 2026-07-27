import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ClientTabs } from "@/components/dashboard/client/client-tabs";
import { OutreachBreakdownChart } from "@/components/dashboard/outreach/outreach-breakdown-chart";
import { OutreachDisclosure } from "@/components/dashboard/outreach/outreach-disclosure";
import { OutreachFunnel } from "@/components/dashboard/outreach/outreach-funnel";
import { OutreachKpis } from "@/components/dashboard/outreach/outreach-kpis";
import {
  OutreachNoSnapshot,
  OutreachTruncated,
  OutreachUnavailable,
} from "@/components/dashboard/outreach/outreach-states";
import { getClient } from "@/services/clients";
import { latestSnapshot } from "@/services/outreach";
import { buildOutreachAnalytics } from "@/services/outreach-analytics";

export const metadata: Metadata = { title: "Client outreach" };

/**
 * The Outreach tab: this Client's most recent prospect snapshot.
 *
 * ⚠️ STAFF-ONLY, AND STRUCTURALLY SO. Everything below is third-party personal
 * data — prospect names, LinkedIn URLs, locations, drafted messages, and email
 * addresses inside Notes. ADR 0012 draws the line explicitly: a Client sees
 * outreach only as aggregate counts, through the Report Link's SECURITY DEFINER
 * path. No component on this page may be reused by a print view, the public
 * `/r/[token]` route, or anything a Client can reach — which is also why this
 * page renders no prospect rows at all, only tallies.
 *
 * ⚠️ THREE READ STATES, THREE RENDERINGS. `latestSnapshot` distinguishes a read
 * that BROKE from a Client who has never had an upload, and only the second may
 * show an empty dashboard. Collapsing them would let a failed read render as a
 * Client with no outreach — a confident lie that looks exactly like the truth.
 */
export default async function ClientOutreachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Independent reads — `latestSnapshot` takes the id, not the client — so they
  // go out together. Reading a snapshot for a client that turns out not to exist
  // is harmless: the result is discarded by the notFound() below.
  const [client, snapshot] = await Promise.all([getClient(id), latestSnapshot(id)]);
  if (!client) notFound();

  const analytics = snapshot.status === "ok" ? buildOutreachAnalytics(snapshot.prospects) : null;

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

      {snapshot.status === "unavailable" ? (
        <OutreachUnavailable />
      ) : snapshot.status === "empty" ? (
        <OutreachNoSnapshot />
      ) : analytics === null ? null : (
        <div className="space-y-8">
          {/* Real but incomplete figures still render — beneath a banner saying
              every one of them is a floor. */}
          {snapshot.truncated ? (
            <OutreachTruncated read={snapshot.prospects.length} total={snapshot.total} />
          ) : null}

          <OutreachKpis analytics={analytics} />

          <div className="grid gap-3.5 xl:grid-cols-2">
            <OutreachFunnel funnel={analytics.funnel} />

            {/* ⚠️ SITS BESIDE THE FUNNEL AND DISAGREES WITH IT ON PURPOSE. Stage
                is CURRENT STANDING — the furthest point each prospect reached —
                so Stage "Replied" counts only those who stopped there, while the
                funnel's Replied counts everyone who ever answered. The caption
                says which, because the numbers differ and a reader is owed the
                reason. */}
            <OutreachBreakdownChart
              title="Stage — where each prospect stands now"
              data={analytics.stage}
              caption={`${analytics.totalProspects.toLocaleString("en-US")} prospects`}
              note="Stage is the furthest point a prospect reached, so these are current standings rather than pipeline steps. A prospect who replied and then booked a meeting appears under Meeting Booked only — which is why these counts differ from the pipeline panel, and why neither should be reconciled with the other."
            />
          </div>

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

          <OutreachDisclosure analytics={analytics} />
        </div>
      )}
    </div>
  );
}

/** The reply chart's caveat, present only when something was actually unreadable. */
function replyNote(unrecognised: number): string | undefined {
  if (unrecognised === 0) return undefined;
  return `${unrecognised} status value${unrecognised === 1 ? "" : "s"} could not be matched to a known reply and ${unrecognised === 1 ? "is" : "are"} grouped as "Status not recognised". The exact wording appears below rather than being guessed at.`;
}
