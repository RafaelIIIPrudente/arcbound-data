import type { OutreachAnalytics } from "@/services/types";

/**
 * The headline row: how many prospects this snapshot holds, and the four funnel
 * counts.
 *
 * ⚠️ EVERY CARD NAMES THE COLUMN ITS NUMBER CAME FROM. That caption is not
 * decoration — it is the only thing on the page that explains why "Replied 39"
 * here and "Replied 25" in the Stage chart below are both correct. The four
 * figures come from four different columns; `Stage` records the FURTHEST point a
 * prospect reached, so a prospect who replied and then booked a meeting has left
 * Stage-Replied while remaining a reply. Strip the captions and that gap reads
 * as a bug somebody will helpfully "fix".
 *
 * ⚠️ COUNTS ONLY. No card carries a percentage, rate, or share, and none may be
 * added: meetings booked is roughly 8 of 1,220, and a rate drawn from that reads
 * as a verdict on a Client that the sample cannot support (ADR 0012).
 */
export function OutreachKpis({ analytics }: { analytics: OutreachAnalytics }) {
  const cards = [
    {
      label: "Prospects",
      count: analytics.totalProspects,
      // Not a column: the total is the snapshot's own size, which is why it
      // leads the row and why its caption says so rather than naming a field.
      source: "This snapshot",
    },
    ...analytics.funnel.map((step) => ({
      label: step.label,
      count: step.count,
      source: step.source,
    })),
  ];

  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} data-kpi className="rounded-lg border bg-card p-5">
          <div className="font-display text-3xl leading-none font-extrabold tracking-tight tabular-nums">
            {/* A measured 0 prints as 0. There is no em-dash branch here on
                purpose: this component only ever receives counted rows, and the
                could-not-read case never reaches it (see outreach-states). */}
            {card.count.toLocaleString("en-US")}
          </div>
          <div className="mt-2.5 font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
            {card.label}
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">{card.source}</div>
        </div>
      ))}
    </div>
  );
}
