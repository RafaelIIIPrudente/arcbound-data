import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { InteractionsRow } from "@/services/types";

import { InteractionsComparison } from "./interactions-comparison";

const ROWS: InteractionsRow[] = [
  { scope: "selected", label: "July 2026", likes: 10, comments: 2, shares: 1 },
  { scope: "prior3", label: "Prior 3 months", likes: 33, comments: 6, shares: 3 },
  { scope: "allTime", label: "All time", likes: 143, comments: 28, shares: 14 },
];

describe("InteractionsComparison", () => {
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
