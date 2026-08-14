import { AlertTriangle, CircleOff } from "lucide-react";
import Link from "next/link";

import { paths } from "@/paths";

// ─────────────────────────────────────────────────────────────────────────────
// The two states a gated section (Posts, LinkedIn Report, Outreach) can carry
// instead of its own data (ADR 0015): "this Client is not assigned this
// Service" and "we could not tell". Shared so all three sections say the same
// thing in the same words, rather than drifting apart one page at a time.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A Client is not assigned the Service that unlocks this section.
 *
 * ⚠️ "NOT ASSIGNED", NEVER "NO DATA" (D13). A Client can hold real rows for a
 * Service they are not currently assigned — an admin un-assigned it, or the S1
 * backfill missed them. Those rows are WITHHELD, not absent, and the count behind
 * this gate is not zero; it is simply not being shown. "No outreach data" would
 * assert a measurement this page never made — the exact absent-vs-zero collapse
 * this slice exists to close, wearing the opposite mask.
 *
 * ⚠️ RENDERED, NOT `notFound()`ED AND NOT `redirect()`ED. This is not a security
 * boundary — staff may legitimately look at a Client's section they are not
 * signed up for, e.g. to check before assigning it. A 404 would also be a lie:
 * the Client exists. The caller decides whether to render this or the real data;
 * this component only states the fact.
 */
export function NotAssignedGate({
  clientId,
  clientName,
  sectionName,
}: {
  clientId: string;
  clientName: string;
  sectionName: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-muted/30 py-20 text-center">
      <CircleOff className="size-6 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-display text-lg font-semibold">
          {clientName} is not assigned {sectionName}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {/* ⚠️ THE OVERVIEW, NEVER SETTINGS → SERVICES. The Overview is where a
              per-Client assignment is actually made; Settings → Services is the
              registry of what Arcbound sells and has no per-Client control. */}
          An admin can assign it on{" "}
          <Link
            href={paths.clients.details(clientId)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            this client&apos;s overview
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

/**
 * The Services registry could not be read, so this page cannot tell whether the
 * Client is assigned this section or not.
 *
 * ⚠️ NO LONGER THE EVERYDAY PATH — CORRECTED 2026-08-14, WHEN
 * `supabase/arcbound-services.sql` WAS CONFIRMED APPLIED. `getClientServices`
 * now succeeds on an ordinary request, so staff do not routinely see this
 * notice; it appears when the registry read actually fails. That is a change of
 * FREQUENCY only — the notice is exactly as necessary as it was, because the
 * failure it describes is still reachable.
 *
 * ⚠️ MUST NAME THE AMBIGUITY IN WORDS. An unlabelled empty section below this
 * notice would re-create the exact production bug this slice closes: it would
 * read as "we ran this and found nothing" when the true state is "we do not know
 * whether we run this at all". This notice exists specifically to say that out
 * loud on every affected page — placed on the TAB'S OWN PAGE, never only on the
 * tab row, so a direct link still carries it.
 */
export function ServicesUnreadableNotice() {
  return (
    <p
      role="alert"
      className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        This client&apos;s assigned services could not be read, so we cannot tell whether they are
        signed up for this section. What follows may not mean they have none — it may mean Arcbound
        does not do this for them, or it may mean the check itself failed. Try again shortly.
      </span>
    </p>
  );
}
