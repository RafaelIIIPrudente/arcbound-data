import type { RateReconciliation } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// The engagement-rate reconciliation panel.
//
// ⚠️ IT REPORTS A DISAGREEMENT; IT DOES NOT RESOLVE ONE. ArcBase holds three rate
// definitions — the scraper's, the BI view's (the one it ships), and its own
// aggregate on the dashboard. This panel says where they differ so a human can
// ask the BI owner why. It never averages them and never declares a winner.
//
// ⚠️ AND IT NAMES NO RAW COLUMN. Staff read "the scraper's figure" and "the
// reporting view's figure", never `provided_engagement_rate`.
// ─────────────────────────────────────────────────────────────────────────────

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-40 flex-1 rounded-lg border bg-card px-5 py-4">
      <div className="font-display text-2xl leading-none font-extrabold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-2 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </div>
    </div>
  );
}

/**
 * The plain-language reading of the median ratio.
 *
 * ⚠️ THIS SENTENCE IS THE POINT OF THE FIGURE. Without it, a client whose two
 * rate columns are simply in different units (6.23 vs 0.0623) shows EVERY post
 * as a disagreement, which reads as a catastrophe. The label has to let a
 * reader tell a unit difference from a real one without doing arithmetic.
 */
function scaleSentence(rates: RateReconciliation): string | null {
  if (rates.rateScale === null) return null;
  if (rates.rateScale === "rescaled") {
    return "The two figures appear to be on different scales — one looks like a percentage and the other a fraction. That alone would explain every difference counted above, and is a question about units rather than about the numbers.";
  }
  return rates.rateDisagreements > 0
    ? "The two figures are on the same scale, so the differences counted above are real differences in the numbers, not a units mismatch."
    : "The two figures are on the same scale and agree.";
}

export function RateReconciliationPanel({ rates }: { rates: RateReconciliation }) {
  const sentence = scaleSentence(rates);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        {/* Decorative accent marker, not content. `aria-hidden` keeps it from
            being announced — and keeps it from colliding with the em dash that
            genuinely means "not known" in the figures below. */}
        <span aria-hidden className="text-primary">
          —
        </span>
        Engagement rate
      </div>

      <div className="flex flex-wrap gap-3.5">
        <Figure label="Posts with no rate" value={rates.postsMissingRate.toLocaleString()} />
        <Figure
          label="Rates that differ"
          value={
            <>
              {rates.rateDisagreements.toLocaleString()}
              <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
                of {rates.rateComparablePosts.toLocaleString()}
              </span>
            </>
          }
        />
        <Figure
          label="Matches our overall formula"
          value={
            rates.aggregateFormulaMatches === null ? (
              <>
                {/* Not "no" — the check could not be run at all. */}
                <span aria-hidden>—</span>
                <span className="sr-only">
                  Could not be checked: no post had all three of a rate, a recorded interaction
                  count, and at least one view
                </span>
              </>
            ) : rates.aggregateFormulaMatches ? (
              "Yes"
            ) : (
              // ⚠️ NOT A BARE "No". The flag is strict, so 3 posts out of 4,000
              // and 4,000 out of 4,000 both land here — and presented
              // identically, an outlier reads as a pipeline-wide contradiction.
              // Same treatment as "Rates that differ" above: count in the
              // figure's type scale, denominator in the smaller muted mono.
              //
              // "differ" is load-bearing. The label under this figure reads
              // "Matches our overall formula", so "3 of 4,000" alone would say
              // the exact opposite of what it means.
              <>
                {rates.formulaMismatches.toLocaleString()}
                <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
                  of {rates.formulaCheckedPosts.toLocaleString()} differ
                </span>
              </>
            )
          }
        />
      </div>

      <div className="max-w-2xl space-y-2 text-sm text-muted-foreground">
        {sentence ? <p>{sentence}</p> : null}

        {/* ⚠️ PROPORTIONATE TO WHAT WAS FOUND. This used to assert flatly that the
            two "are measuring different things" — true when every checked post
            disagrees, a considerable overstatement when three do. Leading with
            the count lets a reader size the finding instead of taking a verdict
            on trust. No percentage: the reader would have to verify it. */}
        {rates.aggregateFormulaMatches === false ? (
          <p>
            On {rates.formulaMismatches.toLocaleString()} of the{" "}
            {rates.formulaCheckedPosts.toLocaleString()} posts that could be checked, the reporting
            view works out the rate differently from the way the dashboard works out the rate for a
            whole period. Where they differ the two figures aren&rsquo;t directly comparable, so
            it&rsquo;s worth confirming which definition is intended.
          </p>
        ) : null}

        {rates.aggregateFormulaMatches === null ? (
          <p>
            There weren&rsquo;t any posts with all three of a rate, a recorded interaction count,
            and at least one view, so this check couldn&rsquo;t run.
          </p>
        ) : null}
      </div>
    </section>
  );
}
