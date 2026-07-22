import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AssetBucket } from "@/services/types";

import { InteractionsByAssetChart } from "./interactions-by-asset-chart";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const DATA: AssetBucket[] = [
  { format: "SLIDE_SHOW", label: "Slide show", value: 42, count: 5 },
  { format: "UNKNOWN", label: "Unknown", value: 8, count: 2 },
];

describe("InteractionsByAssetChart", () => {
  it("renders human-readable asset labels, never raw enum tokens", () => {
    render(<InteractionsByAssetChart data={DATA} />);

    expect(screen.getByText("Slide show")).toBeInTheDocument();
    expect(screen.queryByText("SLIDE_SHOW")).not.toBeInTheDocument();
  });

  it("shows UNKNOWN as a real, human-readable asset type rather than hiding it", () => {
    render(<InteractionsByAssetChart data={DATA} />);
    // A post with no attribute record is genuinely "Unknown" — not an error and
    // not something to omit from the mix.
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("renders an empty state instead of an axis-less chart", () => {
    render(<InteractionsByAssetChart data={[]} />);
    expect(screen.getByText("No posts in this period.")).toBeInTheDocument();
  });
});
