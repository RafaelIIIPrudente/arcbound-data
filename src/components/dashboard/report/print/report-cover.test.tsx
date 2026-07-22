import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ReportFigure, ReportPeriod } from "@/services/types";

import { ReportCover, periodInWords } from "./report-cover";

const FIGURES: ReportFigure[] = [
  { label: "Total posts", value: 12 },
  { label: "Avg interactions", value: 56 },
  { label: "Total interactions", value: 1234 },
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

  it("carries the three headline figures with their labels", () => {
    renderCover();

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("56")).toBeInTheDocument();
    expect(screen.getByText("Total posts")).toBeInTheDocument();
    expect(screen.getByText("Avg interactions")).toBeInTheDocument();
    // Total interactions is THE headline number a reader looks for first, and
    // it reaches the cover straight from keyPerformance.selected.
    expect(screen.getByText("Total interactions")).toBeInTheDocument();
  });

  it("dates the document", () => {
    renderCover();

    expect(screen.getByText(/22 July 2026/)).toBeInTheDocument();
  });

  it("carries the Arcbound attribution", () => {
    renderCover();

    expect(screen.getByText("by Arcbound")).toBeInTheDocument();
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
