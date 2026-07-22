import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ReportPeriod } from "@/services/types";

import { ChartScope } from "./chart-scope";

const JULY: ReportPeriod = {
  kind: "month",
  key: "2026-07",
  label: "July 2026",
  year: 2026,
  month: 6,
};
const ALL_TIME: ReportPeriod = { kind: "all", key: "all", label: "All time" };

describe("ChartScope", () => {
  it("names the selected period", () => {
    render(<ChartScope period={JULY} postCount={12} />);

    expect(screen.getByText("July 2026")).toBeInTheDocument();
    // The four cards used to hardcode this regardless of the picker.
    expect(screen.queryByText("All time")).not.toBeInTheDocument();
  });

  it("says All time only when the period IS all-time", () => {
    render(<ChartScope period={ALL_TIME} postCount={12} />);

    expect(screen.getByText("All time")).toBeInTheDocument();
  });

  it("states the post count the chart is computed from", () => {
    // The whole point of the badge: 5 posts and 500 posts must not look alike.
    const { rerender } = render(<ChartScope period={JULY} postCount={5} />);
    expect(screen.getByText(/5 posts/)).toBeInTheDocument();

    rerender(<ChartScope period={JULY} postCount={500} />);
    expect(screen.getByText(/500 posts/)).toBeInTheDocument();
  });

  it("says '1 post', not '1 posts'", () => {
    render(<ChartScope period={JULY} postCount={1} />);

    expect(screen.getByText(/1 post(?!s)/)).toBeInTheDocument();
  });

  it("shows a zero count rather than hiding it", () => {
    // An empty period is a fact worth stating, not an absence worth concealing.
    render(<ChartScope period={JULY} postCount={0} />);

    expect(screen.getByText(/0 posts/)).toBeInTheDocument();
  });
});
