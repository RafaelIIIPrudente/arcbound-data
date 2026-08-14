import { MetricInfo, MetricInfoInline } from "@/components/dashboard/metric-info";
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
/**
 * ⚠️ WHY THE STEP CARDS BUILD THEIR OWN DEFINITION INSTEAD OF READING ONE FROM
 * `metric-definitions.ts`. Each funnel step arrives from
 * `buildOutreachAnalytics` already carrying the column it came from and the RULE
 * it was counted by — and the Pipeline panel further down this page prints both
 * on screen. Copying that rule into a definitions record would put the same
 * sentence in two places, which is the drift this repo keeps commenting about;
 * assembling it from the step means the ⓘ cannot fall behind the count.
 *
 * The Stage clause is the part no step carries, and it is the reason these cards
 * needed an ⓘ at all: this row shows each step's `source` but NOT its `rule`, so
 * "Replied 39" here beside "Replied 25" in the Stage chart reads as a defect
 * until somebody explains that Stage is terminal.
 */
function stepDefinition(rule: string, source: string): string {
  return `Counted when ${rule}, from the ${source} column. The Stage chart further down counts differently ON PURPOSE: Stage records the FURTHEST point each prospect reached, so someone who replied and then booked a meeting has left Stage “Replied” while still being a reply here. The two panels are not meant to reconcile, and neither is wrong.`;
}

export function OutreachKpis({ analytics }: { analytics: OutreachAnalytics }) {
  const cards = [
    {
      label: "Prospects",
      count: analytics.totalProspects,
      // Not a column: the total is the snapshot's own size, which is why it
      // leads the row and why its caption says so rather than naming a field.
      source: "This snapshot",
      // The one card that is not a funnel step, so its meaning is not computed
      // anywhere — it lives in the definitions module like every other figure.
      info: <MetricInfo metric="outreachProspects" />,
    },
    ...analytics.funnel.map((step) => ({
      label: step.label,
      count: step.count,
      source: step.source,
      info: (
        <MetricInfoInline term={step.label} definition={stepDefinition(step.rule, step.source)} />
      ),
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
          <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
            {card.label}
            {card.info}
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">{card.source}</div>
        </div>
      ))}
    </div>
  );
}
