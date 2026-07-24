import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { InteractionsRow } from "@/services/types";

import { InteractionsComparison, visibleInteractionRows } from "./interactions-comparison";

/** Saves default to a plain, fully-reported sum; each test overrides as needed. */
function row(over: Partial<InteractionsRow> & Pick<InteractionsRow, "scope" | "label">) {
  return { likes: 0, comments: 0, shares: 0, saves: 0, savesPartial: false, ...over };
}

const ROWS: InteractionsRow[] = [
  row({ scope: "selected", label: "July 2026", likes: 10, comments: 2, shares: 1, saves: 4 }),
  row({ scope: "prior3", label: "Prior 3 months", likes: 33, comments: 6, shares: 3, saves: 9 }),
  row({ scope: "allTime", label: "All time", likes: 143, comments: 28, shares: 14, saves: 31 }),
];

// What the seam produces when the SELECTED period is all-time: the scoped row
// and the all-time row are the same posts under the same heading.
const ALL_TIME_ROWS: InteractionsRow[] = [
  row({ scope: "selected", label: "All time", likes: 143, comments: 28, shares: 14, saves: 31 }),
  row({ scope: "prior3", label: "Prior 3 months", likes: 33, comments: 6, shares: 3, saves: 9 }),
  row({ scope: "allTime", label: "All time", likes: 143, comments: 28, shares: 14, saves: 31 }),
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
      row({ scope: "selected", label: "July 2026", likes: 143, comments: 28, shares: 14 }),
      row({ scope: "prior3", label: "Prior 3 months" }),
      row({ scope: "allTime", label: "All time", likes: 143, comments: 28, shares: 14 }),
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

  // ───────────────────────────────────────────────────────────────────────────
  // SAVES — THREE STATES, KEPT APART.
  //
  // ⚠️ The scrape may omit saves entirely. Summing absent values as zero would
  // report a missing measurement as a measured one; printing a PARTIAL sum as a
  // total is the same lie in a subtler form. Each state has to look different.
  // ───────────────────────────────────────────────────────────────────────────
  it("renders a fully-reported scope as a plain sum", () => {
    render(<InteractionsComparison rows={ROWS} />);

    expect(screen.getByRole("columnheader", { name: "Saves" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "31" })).toBeInTheDocument();
  });

  it("renders an em dash when NO post in a scope reported saves", () => {
    render(
      <InteractionsComparison
        rows={[
          row({ scope: "selected", label: "July 2026", likes: 10, saves: null }),
          row({ scope: "prior3", label: "Prior 3 months", likes: 5 }),
          row({ scope: "allTime", label: "All time", likes: 143 }),
        ]}
      />,
    );

    // Never a 0 — that would claim the posts were saved zero times.
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(
      screen.getByText(/Saves were not reported for any post in this period/i),
    ).toBeInTheDocument();
  });

  it("marks a MIXED scope as a lower bound rather than printing it as a total", () => {
    render(
      <InteractionsComparison
        rows={[
          row({ scope: "selected", label: "July 2026", likes: 10, saves: 7, savesPartial: true }),
          row({ scope: "prior3", label: "Prior 3 months", likes: 5 }),
          row({ scope: "allTime", label: "All time", likes: 143 }),
        ]}
      />,
    );

    // The figure is real but incomplete, and the row says so — visually with the
    // marker, and in words for a screen reader.
    expect(screen.getByText(/some posts in this period did not report saves/i)).toBeInTheDocument();
    expect(screen.getByText("At least", { exact: false })).toBeInTheDocument();
  });

  it("distinguishes all three saves states within ONE table", () => {
    // The discriminating case: rendered side by side, none of the three may be
    // mistakable for another.
    render(
      <InteractionsComparison
        rows={[
          row({ scope: "selected", label: "July 2026", likes: 10, saves: null }),
          row({ scope: "prior3", label: "Prior 3 months", likes: 5, saves: 7, savesPartial: true }),
          row({ scope: "allTime", label: "All time", likes: 143, saves: 31 }),
        ]}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument(); // unknown
    expect(screen.getByText("At least", { exact: false })).toBeInTheDocument(); // lower bound
    expect(screen.getByRole("cell", { name: "31" })).toBeInTheDocument(); // a real total
  });

  it("renders an empty state when every scope is zero", () => {
    const empty = ROWS.map((r) => ({ ...r, likes: 0, comments: 0, shares: 0 }));
    render(<InteractionsComparison rows={empty} />);

    expect(screen.getByText("No posts in this period.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
