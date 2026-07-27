import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { OutreachBreakdownChart } from "./outreach-breakdown-chart";

// recharts measures its container; jsdom reports 0×0 and the chart renders
// nothing. The house tests stub ResizeObserver so the SVG mounts.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const STAGE = [
  { label: "Requested", count: 1216 },
  { label: "Connected", count: 177 },
  { label: "Replied", count: 25 },
  { label: "Closed - Low Fit", count: 4 },
];

describe("OutreachBreakdownChart — the data actually reaches the page", () => {
  // ⚠️ THIS SUITE USED TO ASSERT ONLY THE TITLE, THE CAPTION AND THE NOTE — the
  // three strings the test itself passed in as props. Every test passed while the
  // chart rendered an empty frame, because recharts draws into an SVG that jsdom
  // never lays out and nothing here looked at the data. An adversarial pass
  // proved it: swapping `dataKey="count"` for a nonsense key, and deleting the
  // whole <BarChart> subtree, both kept the suite green.
  //
  // The component now renders a text list of the same figures — for screen
  // readers first, and assertability second — and these tests read it.
  it("renders EVERY category label", () => {
    render(<OutreachBreakdownChart title="Stage" data={STAGE} caption="1,435 prospects" />);

    for (const row of STAGE) {
      expect(screen.getByText(row.label)).toBeInTheDocument();
    }
  });

  it("renders EVERY count, formatted for a human", () => {
    render(<OutreachBreakdownChart title="Stage" data={STAGE} caption="1,435 prospects" />);

    expect(screen.getByText("1,216")).toBeInTheDocument();
    expect(screen.getByText("177")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("keeps label and count PAIRED, in the order given", () => {
    const { container } = render(
      <OutreachBreakdownChart title="Stage" data={STAGE} caption="1,435 prospects" />,
    );
    // ⚠️ CHILD SPANS ARE JOINED WITH A SPACE RATHER THAN READ VIA textContent.
    // Adjacent elements glue together — "Requested1,216" — and a matcher written
    // against that would keep passing if the label and the count were ever
    // rendered from the same field.
    const rows = [...container.querySelectorAll("[data-chart-values] li")].map((li) =>
      [...li.children].map((child) => child.textContent?.trim()).join(" "),
    );

    expect(rows).toEqual(["Requested 1,216", "Connected 177", "Replied 25", "Closed - Low Fit 4"]);
  });

  it("renders a value for a category whose count is 0", () => {
    render(
      <OutreachBreakdownChart
        title="Stage"
        data={[{ label: "Passed", count: 0 }]}
        caption="1 prospect"
      />,
    );

    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("OutreachBreakdownChart", () => {
  it("titles itself as the MEASUREMENT it is", () => {
    render(<OutreachBreakdownChart title="Stage" data={STAGE} caption="1,435 prospects" />);

    expect(screen.getByText("Stage")).toBeInTheDocument();
    expect(screen.getByText("1,435 prospects")).toBeInTheDocument();
  });

  it("carries NO recommendation, grade or ranking word in its chrome", () => {
    // ⚠️ A CHART TITLE IS A CLAIM. "Best performing stage" would turn a tally
    // into a verdict; ADR 0012 allows descriptive counts and nothing else.
    const { container } = render(
      <OutreachBreakdownChart title="Stage" data={STAGE} caption="1,435 prospects" />,
    );
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(
      /\b(best|worst|top|optimal|recommended?|score|grade|rank(ing)?|benchmark|rate|conversion)\b/i,
    );
  });

  it("renders an honest empty state rather than an axis with nothing on it", () => {
    render(<OutreachBreakdownChart title="Stage" data={[]} caption="0 prospects" />);

    expect(screen.getByText(/nothing recorded|no .* recorded/i)).toBeInTheDocument();
  });

  it("shows a NOTE when one is given, so an exclusion travels with the chart", () => {
    render(
      <OutreachBreakdownChart
        title="Follow-ups"
        data={STAGE}
        caption="1,435 prospects"
        note="12 rows had a follow-up count that could not be read."
      />,
    );

    expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
  });

  it("does not invent a note when none is given", () => {
    const { container } = render(
      <OutreachBreakdownChart title="Stage" data={STAGE} caption="1,435 prospects" />,
    );

    expect(container.querySelector("[data-chart-note]")).toBeNull();
  });
});
