import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { InteractionsRow } from "@/services/types";

import { InteractionsComparison, visibleInteractionRows } from "./interactions-comparison";

const ROWS: InteractionsRow[] = [
  { scope: "selected", label: "July 2026", likes: 10, comments: 2, shares: 1 },
  { scope: "prior3", label: "Prior 3 months", likes: 33, comments: 6, shares: 3 },
  { scope: "allTime", label: "All time", likes: 143, comments: 28, shares: 14 },
];

// What the seam produces when the SELECTED period is all-time: the scoped row
// and the all-time row are the same posts under the same heading.
const ALL_TIME_ROWS: InteractionsRow[] = [
  { scope: "selected", label: "All time", likes: 143, comments: 28, shares: 14 },
  { scope: "prior3", label: "Prior 3 months", likes: 33, comments: 6, shares: 3 },
  { scope: "allTime", label: "All time", likes: 143, comments: 28, shares: 14 },
];

describe("visibleInteractionRows", () => {
  it("collapses the duplicated pair when the selected period is all-time", () => {
    const visible = visibleInteractionRows(ALL_TIME_ROWS);

    expect(visible.map((r) => r.scope)).toEqual(["prior3", "allTime"]);
  });

  it("keeps all three rows for a scoped period", () => {
    expect(visibleInteractionRows(ROWS)).toHaveLength(3);
  });

  it("keeps both rows when a scoped period happens to contain every post", () => {
    // Same numbers, DIFFERENT headings — "July 2026" and "All time" are two
    // real facts that coincide, not one fact printed twice.
    const coincident: InteractionsRow[] = [
      { scope: "selected", label: "July 2026", likes: 143, comments: 28, shares: 14 },
      { scope: "prior3", label: "Prior 3 months", likes: 0, comments: 0, shares: 0 },
      { scope: "allTime", label: "All time", likes: 143, comments: 28, shares: 14 },
    ];

    expect(visibleInteractionRows(coincident)).toHaveLength(3);
  });
});

describe("InteractionsComparison", () => {
  it("renders one All time row, not two, when the period is all-time", () => {
    render(<InteractionsComparison rows={ALL_TIME_ROWS} />);

    // A client seeing the same figure twice under one heading assumes the
    // report is broken, so the duplicate must not reach the document.
    expect(screen.getAllByRole("cell", { name: "All time" })).toHaveLength(1);
    expect(screen.getAllByRole("cell", { name: "143" })).toHaveLength(1);
  });

  it("labels the reposts metric as Shares, never as a raw field name", () => {
    render(<InteractionsComparison rows={ROWS} />);

    expect(screen.getByRole("columnheader", { name: "Shares" })).toBeInTheDocument();
    // `reposts` is the BI column; it is an internal name and must not surface.
    expect(screen.queryByText(/reposts/i)).not.toBeInTheDocument();
  });

  it("renders all three scopes as rows", () => {
    render(<InteractionsComparison rows={ROWS} />);

    expect(screen.getByRole("cell", { name: "July 2026" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Prior 3 months" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "All time" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "143" })).toBeInTheDocument();
  });

  it("renders an empty state when every scope is zero", () => {
    const empty = ROWS.map((r) => ({ ...r, likes: 0, comments: 0, shares: 0 }));
    render(<InteractionsComparison rows={empty} />);

    expect(screen.getByText("No posts in this period.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
