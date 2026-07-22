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

const JULY = {
  kind: "month",
  key: "2026-07",
  label: "July 2026",
  year: 2026,
  month: 6,
} as const;
const POSTS = 5;

const DATA: AssetBucket[] = [
  { format: "SLIDE_SHOW", label: "Slide show", value: 50, count: 5 },
  { format: "INSTANT_SHARE", label: "Instant share", value: 30, count: 3 },
  { format: "UNKNOWN", label: "Unknown", value: 20, count: 2 },
];

describe("PostTypeDistributionChart", () => {
  it("renders HUMAN-READABLE asset labels, never raw enum tokens", () => {
    render(<PostTypeDistributionChart period={JULY} postCount={POSTS} data={DATA} />);

    expect(screen.getByText("Slide show")).toBeInTheDocument();
    expect(screen.getByText("Instant share")).toBeInTheDocument();

    // The whole point: a raw scraper token must never reach a human. Asserting
    // on absence catches rendering `bucket.format` instead of `bucket.label`.
    expect(screen.queryByText("SLIDE_SHOW")).not.toBeInTheDocument();
    expect(screen.queryByText("INSTANT_SHARE")).not.toBeInTheDocument();
  });

  it("labels the card with the SELECTED period, and with the N behind it", () => {
    // This assertion is the inverse of the one it replaces. The card used to be
    // pinned to all-time and said so; it now follows the picker, so a hardcoded
    // "All time" would be the lie. The count travels with it because a share
    // over 5 posts is not the same claim as a share over 500.
    render(<PostTypeDistributionChart period={JULY} postCount={POSTS} data={DATA} />);

    expect(screen.getByText("July 2026")).toBeInTheDocument();
    expect(screen.getByText(/5 posts/)).toBeInTheDocument();
    expect(screen.queryByText("All time")).not.toBeInTheDocument();
  });

  it("renders a calm empty state rather than an axis-less chart", () => {
    render(<PostTypeDistributionChart period={JULY} postCount={POSTS} data={[]} />);
    expect(screen.getByText("No posts in this period.")).toBeInTheDocument();
  });
});
