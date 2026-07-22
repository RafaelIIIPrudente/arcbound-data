import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ClientReport } from "@/services/types";

import { KeyPerformance } from "./key-performance";

const GRID: ClientReport["keyPerformance"] = {
  selected: [
    { label: "Total posts", value: 12 },
    { label: "Avg interactions", value: 56 },
    { label: "Total interactions", value: 1234 },
  ],
  allTime: [
    { label: "Avg monthly posts", value: 4.5 },
    { label: "Avg interactions per post", value: 40 },
    { label: "Avg monthly interactions", value: 180 },
  ],
  allTimeMax: [
    { label: "Max monthly posts", value: 9 },
    { label: "Avg interactions per 1K followers", value: null, approximate: true },
    { label: "Max monthly interactions", value: 400 },
  ],
};

describe("KeyPerformance", () => {
  it("shows an em dash when no upload carries a follower count", () => {
    render(<KeyPerformance keyPerformance={GRID} periodLabel="July 2026" hasPosts />);

    expect(screen.getByText("—")).toBeInTheDocument();
    // Followers are captured per Upload, not per post — say so rather than
    // presenting the ratio as exact.
    expect(screen.getByText("(approx.)")).toBeInTheDocument();
  });

  it("captions the scoped row with the period and the others as all-time", () => {
    render(<KeyPerformance keyPerformance={GRID} periodLabel="July 2026" hasPosts />);

    expect(screen.getByText("July 2026")).toBeInTheDocument();
    expect(screen.getByText("All-time averages")).toBeInTheDocument();
    expect(screen.getByText("All-time maximums")).toBeInTheDocument();
  });

  it("renders a calm empty state for a client with no posts", () => {
    render(<KeyPerformance keyPerformance={GRID} periodLabel="July 2026" hasPosts={false} />);

    expect(screen.getByText("No posts in this period")).toBeInTheDocument();
    expect(screen.queryByText("Total posts")).not.toBeInTheDocument();
  });
});
