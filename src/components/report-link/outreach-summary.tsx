import { MetricInfo } from "@/components/dashboard/metric-info";
import { OUTREACH_SUMMARY_METRIC_KEYS } from "@/lib/metric-definitions";
import type { ReportLinkEmailOutreach, ReportLinkOutreach } from "@/services/report-links";

// ─────────────────────────────────────────────────────────────────────────────
// Outreach summary — the Client's own outreach, on the Client's own report.
//
// ⚠️ COUNTS AND A DATE. NOTHING ELSE EXISTS TO SHOW. The aggregation happens
// inside the SECURITY DEFINER read (supabase/outreach-report-link.sql, extended
// by supabase/outreach-email-report-link.sql), so no prospect name, company,
// LinkedIn URL, message, note, stage or email address ever reaches this
// component (ADR 0012). This is not a filter applied here — it is a boundary
// enforced in the database, and this block is downstream of it.
//
// ⚠️ NO RATES, PERCENTAGES, SCORES, RANKINGS OR BENCHMARKS, and no encouraging or
// apologetic framing. 8 meetings from 1,230 requests is a fact; "a 0.6%
// conversion rate" and "still building momentum" are both verdicts this page has
// no standing to issue — and at that sample size neither would be supportable
// anyway. A grep guard in the test enforces it; keep it that way.
//
// ⚠️ ZERO IS STATED, NEVER OMITTED. Most Clients show 0 meetings booked. Dropping
// the row when it is zero would make the report flatter BY SELECTION: a reader
// could not tell "no meetings" from "we do not report meetings", and every Client
// who did have one would be silently marked out.
//
// ⚠️ THE EMAIL BLOCK IS ITS OWN THREE-STATE READ, S4/D9. `email.status ===
// "not-in-export"` means this snapshot's export predates the Email columns —
// rendered as one sentence, never a zeroed row of figures, exactly like the
// staff tab's `EmailFunnelPanel`. It degrades independently of the five
// LinkedIn figures above, which keep rendering regardless.
//
// ⚠️ F1 (2026-08-10) — THE WHOLE READ IS THREE STATES, NOT TWO, FOLLOWING
// `ReportLinkOutreach` (which shares its vocabulary with `LatestSnapshot`, staff
// side, but is NOT a mirror of it — the staff type gained a fourth member,
// `all-voided`, on 2026-08-14 and this path deliberately did not: a Client whose
// snapshots are all voided reads as `empty`, per Q3): `ok` /
// `empty` / `unavailable`. Before F1 a malformed aggregate arrived here as
// `null` — identical to "this Client has never had an outreach snapshot" —
// so a Client whose read had genuinely broken was told nothing had been done
// for them. `unavailable` renders a sentence saying the figures could not be
// read: never a zero, never an empty block, and never the `empty` wording.
// ─────────────────────────────────────────────────────────────────────────────

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** A UTC date label like "27 Jul 2026" (UTC so it never wobbles by timezone). */
function formatIsoDate(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * The ⓘ for one aggregate figure.
 *
 * ⚠️ EVERY SENTENCE IT CAN REACH IS AGGREGATE-ONLY (ADR 0012). No definition
 * here describes a prospect, and none may: this component is the public
 * boundary, and a definition is prose that crosses it exactly like a number.
 *
 * "Combined meetings" is intentionally unmapped — it already carries its own
 * sentence on screen, so it renders no ⓘ rather than a second copy of one.
 */
function figureInfo(label: string) {
  const key = OUTREACH_SUMMARY_METRIC_KEYS[label];
  return key ? <MetricInfo metric={key} /> : null;
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1" data-testid={`outreach-${label.toLowerCase().replace(/ /g, "-")}`}>
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
        {figureInfo(label)}
      </div>
      <div className="text-2xl leading-none font-semibold text-foreground tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

export function OutreachSummary({ outreach }: { outreach: ReportLinkOutreach }) {
  // No snapshot for this Client → nothing to say, so nothing is said. Not a
  // heading over an empty card, and certainly not a card of zeros.
  if (outreach.status === "empty") return null;

  // ⚠️ F1 — THE READ FAILED, AND THAT IS ITS OWN SENTENCE. Never the silence
  // above (that means "genuinely no snapshot") and never the figures below
  // (that means "we read real numbers").
  if (outreach.status === "unavailable") {
    return (
      <section className="print-block space-y-2 rounded-lg border border-dashed bg-muted/20 p-5">
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span className="text-primary">—</span>
          Outreach
        </div>
        <p className="text-sm text-muted-foreground">
          Outreach figures could not be read right now.
        </p>
      </section>
    );
  }

  const asAt = formatIsoDate(outreach.snapshotAt);

  return (
    <section className="print-block space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span className="text-primary">—</span>
          Outreach
        </div>
        {asAt ? (
          <span className="font-mono text-xs text-muted-foreground">as at {asAt}</span>
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-5">
        <Figure label="Prospects" value={outreach.totalProspects} />
        <Figure label="Requests sent" value={outreach.sent} />
        <Figure label="Connections accepted" value={outreach.connected} />
        <Figure label="Replies" value={outreach.replied} />
        {/* Stated at zero. See the header note. */}
        <Figure label="Meetings booked" value={outreach.meetingsBooked} />
      </div>

      <EmailBlock email={outreach.email} />
    </section>
  );
}

function EmailBlock({ email }: { email: ReportLinkEmailOutreach }) {
  const heading = (
    <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
      Email
    </div>
  );

  if (email.status === "not-in-export") {
    return (
      <div className="space-y-2 border-t pt-4">
        {heading}
        {/* ⚠️ NOT "0 sent / 0 replied / 0 meetings". This snapshot's export
            predates the Email columns, so there are no Email figures to fund a
            row with — a different fact from a row that measured zero activity. */}
        <p className="text-sm text-muted-foreground">
          This snapshot&rsquo;s export did not carry the Email columns, so there are no Email
          figures to show for it.
        </p>
      </div>
    );
  }

  if (email.status === "unavailable") {
    // ⚠️ F1 — NOT THE SAME SENTENCE AS not-in-export. "The export carried the
    // Email block and we could not read the numbers" is a different fact from
    // "the export did not carry the Email block" — and a different fact again
    // from a zeroed row.
    return (
      <div className="space-y-2 border-t pt-4">
        {heading}
        <p className="text-sm text-muted-foreground">Email figures could not be read right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t pt-4">
      {heading}
      <div className="grid gap-5 sm:grid-cols-3">
        <Figure label="Emails sent" value={email.sent} />
        <Figure label="Email replies" value={email.replied} />
        <Figure label="Email meetings booked" value={email.meetingsBooked} />
      </div>
      <div className="space-y-1" data-testid="outreach-combined-meetings">
        <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          Combined meetings
        </div>
        <div className="text-2xl leading-none font-semibold text-foreground tabular-nums">
          {email.combinedMeetings.toLocaleString()}
        </div>
        {/* ⚠️ A COUNT OF PEOPLE, NEVER A TOTAL OR A SUM (D1, D8). Someone booked
            through both channels counts once here — stating it as a sum of the
            two figures above would overstate by exactly that overlap. */}
        <p className="text-xs text-muted-foreground">
          {email.combinedMeetings.toLocaleString()} people booked a meeting on LinkedIn, Email, or
          both — not a sum of the two figures above.
        </p>
      </div>
    </div>
  );
}
