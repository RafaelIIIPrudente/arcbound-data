import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnalyticsTruncated, AnalyticsUnavailable } from "./analytics-unavailable";

describe("AnalyticsUnavailable", () => {
  it("shows a calm, distinct unavailable message (no dev-tells)", () => {
    render(<AnalyticsUnavailable />);

    expect(screen.getByText("Analytics unavailable")).toBeInTheDocument();
    expect(screen.getByText(/try again shortly/i)).toBeInTheDocument();
    // It must not be confused with the genuinely-empty state.
    expect(screen.queryByText(/no posts yet/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ TRUNCATED AND UNAVAILABLE ARE DIFFERENT FACTS. Unavailable means the
// figures are meaningless; truncated means they are REAL BUT INCOMPLETE. A
// reader who is shown one when the other is true will either distrust good
// numbers or trust short ones.
// ─────────────────────────────────────────────────────────────────────────────
describe("AnalyticsTruncated", () => {
  it("says the figures are incomplete rather than unavailable", () => {
    render(<AnalyticsTruncated />);

    expect(screen.getByText(/showing part of this range/i)).toBeInTheDocument();
    // The point a reader must leave with: these are minimums.
    expect(screen.getByText(/lower bounds, not totals/i)).toBeInTheDocument();
  });

  it("shares no wording with the unavailable panel or the empty state", () => {
    render(<AnalyticsTruncated />);

    expect(screen.queryByText(/analytics unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn’t load/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no posts yet/i)).not.toBeInTheDocument();
  });
});
