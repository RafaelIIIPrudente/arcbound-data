import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AssetBucket } from "@/services/types";

import { PostTypeDistributionChart } from "./post-type-distribution-chart";

// recharts measures its container; jsdom has no layout engine.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const DATA: AssetBucket[] = [
  { format: "SLIDE_SHOW", label: "Slide show", value: 50, count: 5 },
  { format: "INSTANT_SHARE", label: "Instant share", value: 30, count: 3 },
  { format: "UNKNOWN", label: "Unknown", value: 20, count: 2 },
];

describe("PostTypeDistributionChart", () => {
  it("renders HUMAN-READABLE asset labels, never raw enum tokens", () => {
    render(<PostTypeDistributionChart data={DATA} />);

    expect(screen.getByText("Slide show")).toBeInTheDocument();
    expect(screen.getByText("Instant share")).toBeInTheDocument();

    // The whole point: a raw scraper token must never reach a human. Asserting
    // on absence catches rendering `bucket.format` instead of `bucket.label`.
    expect(screen.queryByText("SLIDE_SHOW")).not.toBeInTheDocument();
    expect(screen.queryByText("INSTANT_SHARE")).not.toBeInTheDocument();
  });

  it("labels the section as all-time so it is not confused with the period", () => {
    render(<PostTypeDistributionChart data={DATA} />);
    expect(screen.getByText("All time")).toBeInTheDocument();
  });

  it("renders a calm empty state rather than an axis-less chart", () => {
    render(<PostTypeDistributionChart data={[]} />);
    expect(screen.getByText("No posts in this period.")).toBeInTheDocument();
  });
});
