import { MailX } from "lucide-react";

import type { EmailAnalytics } from "@/services/types";

import { OutreachFunnel } from "./outreach-funnel";

// ─────────────────────────────────────────────────────────────────────────────
// The Email channel's own funnel panel — beside the LinkedIn one, never merged
// with it (D1, docs/decisions/2026-08-03-outreach-email-channel.md).
//
// ⚠️ REUSES `OutreachFunnel` AS-IS FOR THE THREE STEPS. `EmailAnalytics.funnel`
// is already an `OutreachFunnelStep[]`, shaped identically to the LinkedIn
// funnel's — same fields, same rendering rules — so a second bar-chart
// component would only duplicate the "no percentage, ever" discipline that
// component already enforces. Forking it here is exactly the drift risk the
// brief calls out.
//
// ⚠️ "NOT IN THIS EXPORT" IS ITS OWN STATE, NEVER A ZEROED FUNNEL (D3). Every
// snapshot uploaded before the email channel existed has
// `hasEmailChannel === false`; rendering a real 0/0/0 funnel for it would be
// absence dressed as a measurement, under a real upload date. This panel
// therefore branches on `EmailAnalytics.status` FIRST, and the "ok" branch is
// unreachable from a `not-in-export` result — there is no code path that could
// print zeroes for a snapshot that never carried the columns.
// ─────────────────────────────────────────────────────────────────────────────

/** Small caption naming the channel a panel describes, so two funnels never blur into one. */
function ChannelLabel({ children }: { children: string }) {
  return (
    <div className="mb-2 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
      {children}
    </div>
  );
}

export function EmailFunnelPanel({ emailAnalytics }: { emailAnalytics: EmailAnalytics }) {
  if (emailAnalytics.status === "not-in-export") {
    return (
      <div>
        <ChannelLabel>Email</ChannelLabel>
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-muted/30 p-5 py-12 text-center">
          <MailX className="size-5 text-muted-foreground" aria-hidden />
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {/* ⚠️ NOT "0 sent / 0 replied / 0 meetings". This snapshot's export
                predates the Email — * columns, so there is nothing to fund a
                funnel with — a different fact from a funnel that measured
                zero activity. */}
            This snapshot&rsquo;s export did not carry the Email columns, so there is no Email
            funnel to show for it. A newer upload will add one.
          </p>
        </div>
      </div>
    );
  }

  const n = (v: number) => v.toLocaleString("en-US");

  return (
    <div>
      <ChannelLabel>Email</ChannelLabel>
      <OutreachFunnel funnel={emailAnalytics.funnel} />
      {/* ⚠️ A UNION OF PEOPLE, STATED AS ONE FIGURE — NEVER A SUM OF THE TWO
          FUNNELS' MEETINGS-BOOKED STEPS (D1). 8 prospects in the observed
          export carry a booked meeting on BOTH channels, so adding the
          LinkedIn and Email steps above would overstate this by exactly
          those 8 — the copy below says "either, or both" so nobody reads it
          as addition. */}
      <p className="mt-3 text-[11.5px] text-muted-foreground">
        {n(emailAnalytics.combinedMeetings)} prospect
        {emailAnalytics.combinedMeetings === 1 ? " has" : "s have"} a meeting booked on LinkedIn,
        Email, or both — one count per person, not a sum of the two funnels&rsquo; Meetings booked
        steps.
      </p>
    </div>
  );
}
