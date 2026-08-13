import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { METRIC_DEFINITIONS } from "@/lib/metric-definitions";
import type { SeriesPoint } from "@/services/types";

import { EngagementChart } from "./engagement-chart";

// Recharts measures its container, and Radix's Popover wants Pointer Events —
// jsdom implements neither.
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const DATA: SeriesPoint[] = [
  { label: "1 Jul", value: 2.8 },
  { label: "8 Jul", value: 4.0 },
];

describe("EngagementChart — the figure and its delta", () => {
  it("prints the rate and its percentage-POINT delta", () => {
    render(<EngagementChart data={DATA} value={4} delta={1.2} />);

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("+1.2pt")).toBeInTheDocument();
  });

  it("draws NO delta at all when there is no prior period", () => {
    // ⚠️ "+0pt" reads as "measured, unchanged" — a claim nobody can make about
    // all time, which has nothing before it to be unchanged from.
    render(<EngagementChart data={DATA} value={4} delta={null} />);

    expect(screen.queryByText(/pt$/)).not.toBeInTheDocument();
  });

  it("still draws a delta of zero, which IS a measurement", () => {
    render(<EngagementChart data={DATA} value={4} delta={0} />);

    expect(screen.getByText("+0pt")).toBeInTheDocument();
  });
});

describe("EngagementChart — which engagement rate this is", () => {
  it("offers a definition on the heading", () => {
    render(<EngagementChart data={DATA} value={4} delta={1.2} />);

    expect(screen.getByRole("button", { name: "What is Engagement rate?" })).toBeInTheDocument();
  });

  it("says it is the WINDOW-WIDE weighted rate, not the posts table's per-post one", async () => {
    // ⚠️ THE COLLISION THIS SLICE EXISTS FOR. Four screens print "Engagement
    // rate" over four different statistics. This one is Σinteractions ÷
    // Σimpressions across the whole window; the posts table's is the source's
    // published per-post figure. A definition that did not distinguish them
    // would document the ambiguity rather than resolve it.
    const user = userEvent.setup();
    render(<EngagementChart data={DATA} value={4} delta={1.2} />);

    await user.click(screen.getByRole("button", { name: "What is Engagement rate?" }));

    expect(
      await screen.findByText(METRIC_DEFINITIONS.engagementRateWindow.definition),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(METRIC_DEFINITIONS.engagementRatePerPost.definition),
    ).not.toBeInTheDocument();
  });

  it("defines the `pt` separately, because it is a different UNIT from the KPI chips", async () => {
    const user = userEvent.setup();
    render(<EngagementChart data={DATA} value={4} delta={1.2} />);

    await user.click(screen.getByRole("button", { name: "What is Change in engagement rate?" }));

    expect(
      await screen.findByText(METRIC_DEFINITIONS.engagementDelta.definition),
    ).toBeInTheDocument();
  });

  it("drops the delta's ⓘ along with the delta when there is no prior period", () => {
    render(<EngagementChart data={DATA} value={4} delta={null} />);

    expect(
      screen.queryByRole("button", { name: "What is Change in engagement rate?" }),
    ).not.toBeInTheDocument();
    // The heading's definition stays — the FIGURE is still on screen.
    expect(screen.getByRole("button", { name: "What is Engagement rate?" })).toBeInTheDocument();
  });
});
