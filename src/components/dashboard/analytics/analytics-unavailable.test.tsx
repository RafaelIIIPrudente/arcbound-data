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
    render(<AnalyticsTruncated read={50_000} total={137_412} />);

    expect(screen.getByText(/showing part of this range/i)).toBeInTheDocument();
    // The point a reader must leave with: these are minimums.
    expect(screen.getByText(/lower bounds, not totals/i)).toBeInTheDocument();
  });

  it("shares no wording with the unavailable panel or the empty state", () => {
    render(<AnalyticsTruncated read={50_000} total={137_412} />);

    expect(screen.queryByText(/analytics unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn’t load/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no posts yet/i)).not.toBeInTheDocument();
  });

  // ⚠️ "SHOWING PART OF THIS RANGE" IS A WARNING; "50,000 OF 137,412" IS
  // ACTIONABLE. Without the second number a reader cannot tell a rounding error
  // from a catastrophe, and the pager has known that number all along.
  it("states how many posts it read and how many exist", () => {
    render(<AnalyticsTruncated read={50_000} total={137_412} />);

    expect(screen.getByText(/50,000 of 137,412 posts/i)).toBeInTheDocument();
  });

  // ⚠️ AN UNKNOWN TOTAL IS NOT A ZERO AND NOT A GUESS. When the server reported
  // no count, the banner must say what it read and stop — inventing "of 50,000"
  // from the rows in hand would be the confident-wrong-number defect again.
  it("says only what it read when the total is not known", () => {
    render(<AnalyticsTruncated read={50_000} total={null} />);

    expect(screen.getByText(/first 50,000 posts/i)).toBeInTheDocument();
    expect(screen.getByText(/how many more/i)).toBeInTheDocument();
    // It must NOT print a total it does not have.
    expect(screen.queryByText(/of 50,000 posts/i)).not.toBeInTheDocument();
  });
});
