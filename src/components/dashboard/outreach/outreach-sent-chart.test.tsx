import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { sentTrend } from "@/services/outreach-analytics";

import { OutreachSentChart } from "./outreach-sent-chart";

// recharts measures its container; jsdom reports 0×0 and the chart renders
// nothing. The house tests stub ResizeObserver so the SVG mounts.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

/** The text equivalent the chart renders beside its SVG, row by row. */
function rows(container: HTMLElement): string[] {
  return [...container.querySelectorAll("[data-chart-values] li")].map((li) =>
    [...li.children].map((child) => child.textContent?.trim()).join(" "),
  );
}

describe("OutreachSentChart — an empty month is a REAL zero on the axis", () => {
  it("renders the missing FEBRUARY, so a January bar never sits beside a March bar", () => {
    // ⚠️ THE DEFECT THIS COMPONENT EXISTS TO PREVENT. `sentOverTime` carries only
    // months that HAVE rows; drawn raw, this series is two adjacent bars and the
    // chart silently claims February did not happen.
    const { container } = render(
      <OutreachSentChart
        points={sentTrend([
          { date: "2026-01", count: 4 },
          { date: "2026-03", count: 6 },
        ])}
      />,
    );

    expect(rows(container)).toEqual(["Jan 2026 4", "Feb 2026 0", "Mar 2026 6"]);
  });

  it("prints a real 0 for the empty month — not an em dash, not a blank", () => {
    const { container } = render(
      <OutreachSentChart
        points={sentTrend([
          { date: "2026-01", count: 4 },
          { date: "2026-03", count: 6 },
        ])}
      />,
    );

    const february = rows(container).find((r) => r.startsWith("Feb"));
    expect(february).toBe("Feb 2026 0");
    expect(february).not.toMatch(/—|N\/A|null/);
  });
});

describe("OutreachSentChart — the 2020 outlier is compressed, never dropped", () => {
  const points = sentTrend([
    { date: "2020-12", count: 1 },
    { date: "2026-02", count: 5 },
    { date: "2026-03", count: 7 },
  ]);

  it("KEEPS the 2020 month on screen", () => {
    const { container } = render(<OutreachSentChart points={points} />);
    expect(rows(container)[0]).toBe("Dec 2020 1");
  });

  it("STATES the collapsed span in words, where the compression happens", () => {
    render(<OutreachSentChart points={points} />);
    expect(screen.getByText(/61 months, none sent/)).toBeInTheDocument();
  });

  it("shows NO NUMBER for the collapsed span — it is not one month that measured 0", () => {
    const { container } = render(<OutreachSentChart points={points} />);
    const gap = rows(container).find((r) => /none sent/.test(r));

    expect(gap).toBeDefined();
    expect(gap).not.toMatch(/\b0\b/);
  });

  it("SAYS ON SCREEN how the span was treated, rather than leaving a reader to infer it", () => {
    render(<OutreachSentChart points={points} />);
    // A broken axis that does not admit it is a lie by layout.
    expect(screen.getByText(/collapsed/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing has been filtered out/i)).toBeInTheDocument();
  });
});

describe("OutreachSentChart — a measurement, never a recommendation", () => {
  const points = sentTrend([
    { date: "2026-06", count: 40 },
    { date: "2026-07", count: 9 },
  ]);

  it("carries no rate, percentage, rank, score or 'best month' anywhere in its text", () => {
    const { container } = render(<OutreachSentChart points={points} />);
    // ⚠️ THE SAME GREP THAT BINDS THE BREAKDOWN CHART. A caption is the easiest
    // place for a verdict to slip into a page that has none.
    expect(container.textContent ?? "").not.toMatch(
      /\d\s*%|percent|rate|score|rank|grade|best|worst|top |optimal|recommend|benchmark|target/i,
    );
  });

  it("does not annotate a peak, a decline, or a cadence", () => {
    const { container } = render(<OutreachSentChart points={points} />);
    expect(container.textContent ?? "").not.toMatch(
      /peak|spike|surge|slow(ing|down)|declin|drop(ped)?|momentum|consistent|cadence/i,
    );
  });

  it("names the SOURCE COLUMN the series was counted from", () => {
    render(<OutreachSentChart points={points} />);
    expect(screen.getByText(/Date Sent/)).toBeInTheDocument();
  });
});

describe("OutreachSentChart — nothing to plot", () => {
  it("says so in a sentence rather than drawing an empty axis", () => {
    const { container } = render(<OutreachSentChart points={[]} />);

    expect(screen.getByText(/no prospect in this snapshot carries a readable send date/i));
    expect(container.querySelector("[data-chart-values]")).toBeNull();
  });
});
