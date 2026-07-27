import type { OutreachFunnelStep } from "@/services/types";

/**
 * The outreach funnel, as four counts with their definitions on screen.
 *
 * ⚠️ NOT A CONVERSION FUNNEL, AND DELIBERATELY NOT DRAWN LIKE ONE. There is no
 * percentage anywhere in this component and none may be added. Meetings booked
 * is roughly 8 of 1,220 sent: a "0.7% conversion rate" printed beside a client's
 * name is a verdict, and a sample of eight cannot support one. ADR 0012 and the
 * spec's global constraints allow descriptive counts and nothing else — the same
 * no-score discipline already binding cadence and the cross-client comparison.
 *
 * ⚠️ EACH STEP CARRIES ITS SOURCE COLUMN AND ITS RULE, BECAUSE THE FOUR STEPS
 * COME FROM FOUR DIFFERENT COLUMNS. `Stage` is not one of them: Stage records the
 * FURTHEST point a prospect reached, so its tallies are terminal ("Requested
 * 1,216" means 1,216 are STILL there) and stacking them would draw a shape the
 * data does not describe. The visible consequence is that this panel's "Replied"
 * and the Stage breakdown's "Replied" disagree — 39 against 25 in the real
 * snapshot — and both are right. The rule text is what makes that legible
 * instead of alarming.
 *
 * The bar width encodes the count against the widest step. That is a bar chart,
 * not a rate: no ratio is computed for the reader, and nothing derived from it
 * is printed.
 */
export function OutreachFunnel({ funnel }: { funnel: OutreachFunnelStep[] }) {
  // Guard the divide: an all-zero funnel (a snapshot where nothing was sent) is a
  // real state, and `0/0` would put NaN into a style attribute.
  const widest = Math.max(...funnel.map((step) => step.count), 0);

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          Pipeline
        </div>
        <div className="font-mono text-[10px] text-muted-foreground/70">
          Each step counted from its own column
        </div>
      </div>

      <div className="space-y-4">
        {funnel.map((step) => {
          const width = widest === 0 ? 0 : (step.count / widest) * 100;
          return (
            <div key={step.label} data-step>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <div
                  data-testid="funnel-step-label"
                  className="font-mono text-[11px] tracking-[0.1em] uppercase"
                >
                  {step.label}
                </div>
                <div className="font-display text-lg leading-none font-semibold tabular-nums">
                  {step.count.toLocaleString("en-US")}
                </div>
              </div>

              {/* The track is always full width, so a step with 0 still occupies a
                  row and is visibly a step rather than an absence. */}
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${width}%` }} />
              </div>

              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                  {step.source}
                </span>
                <span className="text-[11.5px] text-muted-foreground/80">{step.rule}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
