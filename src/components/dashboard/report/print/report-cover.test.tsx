import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { ReportFigure, ReportPeriod } from "@/services/types";

import { ReportCover, periodInWords } from "./report-cover";

const FIGURES: ReportFigure[] = [
  { label: "Total posts", value: 12 },
  { label: "Avg interactions", value: 56 },
  { label: "Total interactions", value: 1234 },
  // The cover renders whatever `keyPerformance.selected` hands it, so this
  // fixture must carry the same four figures the service now emits — and the
  // widest of them, because the paper column here is fixed.
  { label: "Total impressions", value: 284391 },
];

const JULY: ReportPeriod = {
  kind: "month",
  key: "2026-07",
  label: "July 2026",
  year: 2026,
  month: 6,
};
const NOW = new Date("2026-07-22T09:00:00.000Z");

describe("periodInWords", () => {
  it("spells a month out in full", () => {
    expect(periodInWords(JULY)).toBe("July 2026");
  });

  it("names a year as a calendar year, so a bare number is never ambiguous", () => {
    expect(periodInWords({ kind: "year", key: "2026", label: "2026", year: 2026 })).toBe(
      "Calendar year 2026",
    );
  });

  it("expands a quarter into the months it covers", () => {
    // "Q3" means nothing to a client outside the business; the months do.
    expect(
      periodInWords({ kind: "quarter", key: "2026-Q3", label: "Q3 2026", year: 2026, quarter: 3 }),
    ).toBe("Q3 2026 · July–September 2026");
  });

  it("says what all-time actually covers", () => {
    expect(periodInWords({ kind: "all", key: "all", label: "All time" })).toBe(
      "All time · every post on record",
    );
  });
});

describe("ReportCover", () => {
  function renderCover(period: ReportPeriod = JULY) {
    return render(
      <ReportCover
        clientName="Dana Whitfield"
        linkedinUrl="https://www.linkedin.com/in/dana-whitfield"
        period={period}
        figures={FIGURES}
        now={NOW}
      />,
    );
  }

  it("names the client and their LinkedIn profile", () => {
    renderCover();

    expect(screen.getByText("Dana Whitfield")).toBeInTheDocument();
    expect(screen.getByText("linkedin.com/in/dana-whitfield")).toBeInTheDocument();
  });

  it("states the reporting period in words", () => {
    renderCover();

    expect(screen.getByText("July 2026")).toBeInTheDocument();
  });

  it("carries the four headline figures with their labels", () => {
    renderCover();

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("56")).toBeInTheDocument();
    // Exact, never compacted: every figure on this document is exact, and the
    // cover is the page most likely to be read on its own.
    expect(screen.getByText("284,391")).toBeInTheDocument();
    expect(screen.getByText("Total posts")).toBeInTheDocument();
    expect(screen.getByText("Avg interactions")).toBeInTheDocument();
    // Total interactions is THE headline number a reader looks for first, and
    // it reaches the cover straight from keyPerformance.selected.
    expect(screen.getByText("Total interactions")).toBeInTheDocument();
    expect(screen.getByText("Total impressions")).toBeInTheDocument();
  });

  it("seats four headline figures without a three-column track", () => {
    // ⚠️ PAGE 1 OF THE CLIENT'S PDF, WHICH IS THE POINT. The array's LENGTH is
    // this component's whole contract — it does no arithmetic and renders what
    // it is handed — so a fourth figure against a three-column track strands one
    // alone on a second row on the first, often only, page a client reads.
    // jsdom computes no layout, so this pins the STRUCTURE, not the absence of
    // overflow: at the fixed 700px paper column two columns give each figure
    // ~334px against 36px type, where four would give ~163px. The printed sheet
    // still wants one human look.
    renderCover();

    const grid = screen.getByText("Total impressions").closest("div.grid");
    expect(grid).not.toBeNull();
    expect(grid!.className).toMatch(/\bgrid-cols-2\b/);
    expect(grid!.className).not.toMatch(/\bgrid-cols-3\b/);
    expect(within(grid as HTMLElement).getAllByText(/^[\d,]+$/)).toHaveLength(4);
  });

  it("dates the document", () => {
    renderCover();

    expect(screen.getByText(/22 July 2026/)).toBeInTheDocument();
  });

  it("carries the Arcbound attribution", () => {
    renderCover();

    expect(screen.getByText("by Arcbound")).toBeInTheDocument();
  });

  it("qualifies the headline figures when the underlying read was truncated", () => {
    // ⚠️ THE COVER FIGURES ARE COMPUTED FROM A PARTIAL READ TOO. They are the
    // first — often only — numbers a client sees, so page 1 must carry the same
    // caveat the body panels do, not leave the headline standing as a total.
    render(
      <ReportCover
        clientName="Dana Whitfield"
        linkedinUrl="https://www.linkedin.com/in/dana-whitfield"
        period={JULY}
        figures={FIGURES}
        now={NOW}
        truncation={{ read: 50_000, total: 137_412 }}
      />,
    );

    // Both numbers, so the reader sees the SIZE of the gap — and the same wording
    // the body and screen use, so the surfaces cannot disagree.
    expect(screen.getByText(/50,000 of 137,412 posts/)).toBeInTheDocument();
    expect(screen.getByText(/lower bounds, not totals/)).toBeInTheDocument();
  });

  it("carries NO truncation note when the read was complete", () => {
    // The default render passes no truncation — a complete read makes no claim of
    // incompleteness, and a note that fires anyway cries wolf.
    renderCover();

    expect(screen.queryByText(/lower bounds, not totals/)).not.toBeInTheDocument();
  });

  it("renders an em dash rather than a gap for a figure with no value", () => {
    render(
      <ReportCover
        clientName="Dana Whitfield"
        linkedinUrl="https://www.linkedin.com/in/dana-whitfield"
        period={JULY}
        figures={[{ label: "Total posts", value: null }]}
        now={NOW}
      />,
    );

    // Scoped to the figure: an em dash also appears as brand decoration in the
    // eyebrow, so a document-wide search would pass without proving anything.
    const label = screen.getByText("Total posts");
    expect(label.previousElementSibling).toHaveTextContent("—");
  });
});
