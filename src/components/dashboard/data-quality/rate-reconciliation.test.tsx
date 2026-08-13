import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { METRIC_DEFINITIONS } from "@/lib/metric-definitions";
import type { RateReconciliation } from "@/services/types";

import { RateReconciliationPanel } from "./rate-reconciliation";

function rates(over: Partial<RateReconciliation> = {}): RateReconciliation {
  return {
    postsMissingRate: 0,
    // Distinct from `rateComparablePosts` below so "of 40" and "of 10" never
    // collide in an assertion — the two figures carry different denominators.
    postsConsidered: 40,
    rateDisagreements: 0,
    rateComparablePosts: 10,
    rateMedianRatio: 1,
    rateScale: "aligned",
    aggregateFormulaMatches: true,
    formulaCheckedPosts: 10,
    formulaMismatches: 0,
    ...over,
  };
}

describe("RateReconciliationPanel", () => {
  it("reports the three findings", () => {
    render(
      <RateReconciliationPanel rates={rates({ postsMissingRate: 4, rateDisagreements: 2 })} />,
    );

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // The disagreement count is meaningless without its population.
    expect(screen.getByText(/of 10/)).toBeInTheDocument();
  });

  it("carries a denominator on 'Posts with no rate', like its two siblings", () => {
    render(<RateReconciliationPanel rates={rates({ postsMissingRate: 4, postsConsidered: 40 })} />);

    // A bare "4" cannot say whether that is 4 of 40 or 4 of 40,000. Scoped to the
    // card so the count is unambiguously this figure's.
    const card = screen.getByText("Posts with no rate").parentElement!;
    expect(within(card).getByText("4")).toBeInTheDocument();
    expect(within(card).getByText(/of 40/)).toBeInTheDocument();
  });

  it("renders the not-applicable em dash — not '0 of 0' — when no posts were considered", () => {
    // ⚠️ FOUR STATES. "0 of 0" asserts a measurement that was never taken. When
    // nothing was considered, the figure is not-applicable, shown as the same
    // em dash + sr-only the rest of this panel uses for "could not be checked".
    render(<RateReconciliationPanel rates={rates({ postsMissingRate: 0, postsConsidered: 0 })} />);

    const card = screen.getByText("Posts with no rate").parentElement!;
    expect(within(card).getByText("—")).toBeInTheDocument();
    expect(within(card).queryByText(/of 0/)).not.toBeInTheDocument();
    expect(within(card).getByText(/no posts were considered/i)).toBeInTheDocument();
  });

  it("names no raw database column anywhere a user reads", () => {
    render(<RateReconciliationPanel rates={rates({ rateDisagreements: 3 })} />);

    for (const token of [
      "provided_engagement_rate",
      "calculated_engagement_rate",
      "linkedin_post_latest",
      "weightedRate",
    ]) {
      expect(screen.queryByText(new RegExp(token))).not.toBeInTheDocument();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE WHOLE POINT OF THE MEDIAN RATIO.
//
// If one rate column is a percentage (6.23) and the other a fraction (0.0623),
// EVERY post "disagrees" and a bare count reads as a catastrophe. The panel has
// to let a reader tell a unit difference from a real one WITHOUT doing
// arithmetic — so these two cases must produce visibly different prose.
// ─────────────────────────────────────────────────────────────────────────────
describe("a unit mismatch is distinguishable from a real disagreement", () => {
  it("says the figures are on DIFFERENT SCALES when the ratio is far from 1", () => {
    render(
      <RateReconciliationPanel
        rates={rates({ rateDisagreements: 10, rateMedianRatio: 100, rateScale: "rescaled" })}
      />,
    );

    expect(screen.getByText(/different scales/i)).toBeInTheDocument();
    expect(
      screen.getByText(/question about units rather than about the numbers/i),
    ).toBeInTheDocument();
  });

  it("says the differences are REAL when the ratio is near 1", () => {
    render(
      <RateReconciliationPanel
        rates={rates({ rateDisagreements: 10, rateMedianRatio: 1.02, rateScale: "aligned" })}
      />,
    );

    expect(screen.getByText(/real differences in the numbers/i)).toBeInTheDocument();
    expect(screen.queryByText(/different scales/i)).not.toBeInTheDocument();
  });

  it("says the two agree when they are aligned and nothing differs", () => {
    render(<RateReconciliationPanel rates={rates({ rateDisagreements: 0 })} />);

    expect(screen.getByText(/same scale and agree/i)).toBeInTheDocument();
  });

  it("says nothing about scale when there is nothing comparable", () => {
    render(
      <RateReconciliationPanel
        rates={rates({ rateComparablePosts: 0, rateMedianRatio: null, rateScale: null })}
      />,
    );

    expect(screen.queryByText(/scale/i)).not.toBeInTheDocument();
  });
});

describe("the aggregate-formula check keeps its three answers apart", () => {
  it("reports Yes when the view's per-post rate matches our formula", () => {
    render(<RateReconciliationPanel rates={rates({ aggregateFormulaMatches: true })} />);

    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  // ⚠️ A VERDICT WITHOUT ITS DENOMINATOR IS AN ALARM, NOT A FINDING. The flag is
  // strict, so 3 posts out of 4,000 and 4,000 out of 4,000 are both `false`. A
  // bare "No" presents an outlier as a pipeline-wide contradiction, and a panel
  // that cries wolf stops being read at all.
  const differing = rates({
    aggregateFormulaMatches: false,
    formulaMismatches: 3,
    formulaCheckedPosts: 4000,
  });

  function formulaCard() {
    return screen.getByText("Matches our overall formula").parentElement!;
  }

  it("shows how many posts differ, and out of how many", () => {
    render(<RateReconciliationPanel rates={differing} />);

    const card = formulaCard();
    expect(within(card).getByText("3")).toBeInTheDocument();
    expect(within(card).getByText(/of 4,000/)).toBeInTheDocument();
  });

  it("marks that count as posts which DIFFER, so it cannot be read as posts that match", () => {
    // The label above it reads "Matches our overall formula". Without a word for
    // what the count is, "3 of 4,000" under that label says the opposite of what
    // it means.
    render(<RateReconciliationPanel rates={differing} />);

    expect(within(formulaCard()).getByText(/differ/i)).toBeInTheDocument();
  });

  it("states the proportion in prose rather than a categorical verdict", () => {
    render(<RateReconciliationPanel rates={differing} />);

    expect(screen.getByText(/3 of the 4,000 posts that could be checked/i)).toBeInTheDocument();
    // The old copy asserted flatly that the two "are measuring different
    // things" — true of 4,000 of 4,000, an overstatement of 3.
    expect(screen.queryByText(/the two are measuring different things/i)).not.toBeInTheDocument();
  });

  it("explains the consequence without blaming anyone", () => {
    render(<RateReconciliationPanel rates={differing} />);

    // ArcBase cannot see WHY the view defines its rate differently.
    for (const word of [/broken/i, /wrong/i, /error/i, /bug/i]) {
      expect(screen.queryByText(word)).not.toBeInTheDocument();
    }
  });

  it("reports an em dash — NOT 'No' — when the check could not run", () => {
    // ⚠️ "Could not be checked" is not "failed the check". Rendering null as No
    // would invent a finding out of an absence of one.
    render(
      <RateReconciliationPanel
        rates={rates({ aggregateFormulaMatches: null, formulaCheckedPosts: 0 })}
      />,
    );

    // Scoped to the figure card: the section eyebrow is also an em dash (a
    // decorative accent), so an unscoped query cannot tell the two apart.
    const card = screen.getByText("Matches our overall formula").parentElement!;
    expect(within(card).getByText("—")).toBeInTheDocument();
    expect(within(card).queryByText("No")).not.toBeInTheDocument();
    // ⚠️ ALL THREE CONDITIONS, because the check now requires all three. Naming
    // only two told the reader that a combination which genuinely occurs — a
    // post with a rate and views but no recorded interactions — was impossible.
    expect(
      screen.getByText(
        /no post had all three of a rate, a recorded interaction count, and at least one view/i,
      ),
    ).toBeInTheDocument();
  });

  it("explains the same three conditions in the prose, not just to screen readers", () => {
    render(
      <RateReconciliationPanel
        rates={rates({ aggregateFormulaMatches: null, formulaCheckedPosts: 0 })}
      />,
    );

    expect(
      screen.getByText(
        /all three of a rate, a recorded interaction count, and at least one view, so this check couldn’t run/i,
      ),
    ).toBeInTheDocument();
  });

  it("names no raw column in either explanation of why the check could not run", () => {
    render(
      <RateReconciliationPanel
        rates={rates({ aggregateFormulaMatches: null, formulaCheckedPosts: 0 })}
      />,
    );

    for (const token of ["impressions", "interactions", "calculated_engagement_rate"]) {
      expect(screen.queryByText(new RegExp(token))).not.toBeInTheDocument();
    }
  });
});

describe("RateReconciliationPanel — the ⓘ on each figure", () => {
  // Radix's Popover needs the Pointer Events jsdom does not implement.
  beforeAll(() => {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it("defines all three figures and the panel itself", () => {
    render(<RateReconciliationPanel rates={rates()} />);

    for (const name of [
      "Engagement rate reconciliation",
      "Posts with no rate",
      "Rates that differ",
      "Matches our overall formula",
    ]) {
      expect(screen.getByRole("button", { name: `What is ${name}?` }), name).toBeInTheDocument();
    }
  });

  it("says the HEADING here names no rate at all — the panel is about a disagreement", async () => {
    // ⚠️ "Engagement rate" on this page is not a fifth figure to read beside the
    // others. A reader who takes it as one has the wrong idea of the section.
    const user = userEvent.setup();
    render(<RateReconciliationPanel rates={rates()} />);

    await user.click(
      screen.getByRole("button", { name: "What is Engagement rate reconciliation?" }),
    );

    expect(
      await screen.findByText(METRIC_DEFINITIONS.rateReconciliation.definition),
    ).toBeInTheDocument();
  });

  it("states the denominator each figure excludes from", async () => {
    // ⚠️ THE THING A READER CANNOT WORK OUT FROM THE SCREEN. "Rates that differ"
    // counts only posts carrying BOTH rates — posts missing either are excluded
    // rather than counted as agreeing, which is the difference between a small
    // finding and a pipeline-wide alarm.
    const user = userEvent.setup();
    render(<RateReconciliationPanel rates={rates()} />);

    await user.click(screen.getByRole("button", { name: "What is Rates that differ?" }));

    const text = await screen.findByText(METRIC_DEFINITIONS.ratesThatDiffer.definition);
    expect(text).toBeInTheDocument();
    expect(METRIC_DEFINITIONS.ratesThatDiffer.definition).toMatch(/excluded rather than counted/i);
  });

  it("explains the em dash on the formula check, which is 'could not run', not 'no'", async () => {
    const user = userEvent.setup();
    render(<RateReconciliationPanel rates={rates({ aggregateFormulaMatches: null })} />);

    await user.click(screen.getByRole("button", { name: "What is Matches our overall formula?" }));

    expect(
      await screen.findByText(METRIC_DEFINITIONS.matchesOverallFormula.definition),
    ).toBeInTheDocument();
    expect(METRIC_DEFINITIONS.matchesOverallFormula.definition).toMatch(/could not run/i);
  });

  it("names no raw data column in any definition it shows here", () => {
    // ⚠️ THE PANEL'S OWN STANDING RULE: staff read "the scraper's figure" and
    // "the reporting view's figure", never the underlying column names. The
    // definitions must not smuggle them back in.
    for (const key of [
      "rateReconciliation",
      "postsMissingRate",
      "ratesThatDiffer",
      "matchesOverallFormula",
    ] as const) {
      const d = METRIC_DEFINITIONS[key].definition;
      expect(d, key).not.toMatch(/provided_engagement_rate|calculated_engagement_rate|bi\./);
    }
  });
});
