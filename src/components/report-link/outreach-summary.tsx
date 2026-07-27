import type { ReportLinkOutreach } from "@/services/report-links";

// ─────────────────────────────────────────────────────────────────────────────
// Outreach summary — the Client's own outreach, on the Client's own report.
//
// ⚠️ COUNTS AND A DATE. NOTHING ELSE EXISTS TO SHOW. The aggregation happens
// inside the SECURITY DEFINER read (supabase/outreach-report-link.sql), so no
// prospect name, company, LinkedIn URL, message, note or stage ever reaches this
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

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1" data-testid={`outreach-${label.toLowerCase().replace(/ /g, "-")}`}>
      <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="text-2xl leading-none font-semibold text-foreground tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

export function OutreachSummary({ outreach }: { outreach: ReportLinkOutreach | null }) {
  // No snapshot for this Client → nothing to say, so nothing is said. Not a
  // heading over an empty card, and certainly not a card of zeros.
  if (!outreach) return null;

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
    </section>
  );
}
