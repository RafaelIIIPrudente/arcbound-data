import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { METRIC_DEFINITIONS } from "@/lib/metric-definitions";

import { MetricInfo } from "./metric-info";

// Radix drives Popover with Pointer Events + layout APIs jsdom does not
// implement (same stubs as dashboard-filters.test.tsx).
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

const WINDOW_RATE = METRIC_DEFINITIONS.engagementRateWindow;

describe("MetricInfo — opening it", () => {
  it("names the metric in its accessible name, not just 'more information'", () => {
    render(<MetricInfo metric="engagementRateWindow" />);

    expect(screen.getByRole("button", { name: "What is Engagement rate?" })).toBeInTheDocument();
  });

  it("shows nothing until it is asked", () => {
    render(<MetricInfo metric="Impressions" />);

    expect(screen.queryByText(METRIC_DEFINITIONS.Impressions.definition)).not.toBeInTheDocument();
  });

  it("opens on CLICK and states the definition", async () => {
    // ⚠️ CLICK, NOT HOVER. The reviewer who reported this reads the dashboard on
    // a tablet, where a hover tooltip does not exist at all.
    const user = userEvent.setup();
    render(<MetricInfo metric="engagementRateWindow" />);

    await user.click(screen.getByRole("button", { name: "What is Engagement rate?" }));

    expect(await screen.findByText(WINDOW_RATE.definition)).toBeInTheDocument();
  });

  it("is reachable and operable from the KEYBOARD ALONE", async () => {
    // Tab to it, press Enter — no mouse anywhere in this test.
    const user = userEvent.setup();
    render(<MetricInfo metric="engagementRateWindow" />);

    await user.tab();
    expect(screen.getByRole("button", { name: "What is Engagement rate?" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(await screen.findByText(WINDOW_RATE.definition)).toBeInTheDocument();
  });

  it("also opens on SPACE, which is the other button key", async () => {
    const user = userEvent.setup();
    render(<MetricInfo metric="Impressions" />);

    await user.tab();
    await user.keyboard(" ");

    expect(await screen.findByText(METRIC_DEFINITIONS.Impressions.definition)).toBeInTheDocument();
  });

  it("closes on Escape, so the keyboard can get back out again", async () => {
    const user = userEvent.setup();
    render(<MetricInfo metric="Impressions" />);

    await user.tab();
    await user.keyboard("{Enter}");
    expect(await screen.findByText(METRIC_DEFINITIONS.Impressions.definition)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText(METRIC_DEFINITIONS.Impressions.definition)).not.toBeInTheDocument();
  });

  it("is a real <button>, so it carries button semantics rather than mimicking them", () => {
    render(<MetricInfo metric="Impressions" />);

    const trigger = screen.getByRole("button", { name: "What is Impressions?" });
    expect(trigger.tagName).toBe("BUTTON");
    // `type="button"` matters: inside the posts table this sits in a form-free
    // header, but a bare <button> in any form would submit it.
    expect(trigger).toHaveAttribute("type", "button");
  });
});

describe("MetricInfo — a metric nobody has defined", () => {
  it("renders NOTHING AT ALL — not an empty popover, and not a guess", () => {
    // ⚠️ THE ACCEPTANCE CASE. An ⓘ that opens onto nothing is worse than no ⓘ:
    // it promises an explanation and then withholds it, and a definition
    // invented to fill the gap would be a fabricated figure in prose.
    const { container } = render(<MetricInfo metric="Reach" />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing for an inherited Object property either", () => {
    // A bare record lookup would hand back `Object.prototype.toString` here — a
    // truthy function, and an ⓘ opening onto "[object Object]".
    const { container } = render(<MetricInfo metric="toString" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("still renders for every key the record DOES define, so the guard is not over-broad", async () => {
    for (const [key, entry] of Object.entries(METRIC_DEFINITIONS)) {
      const { unmount } = render(<MetricInfo metric={key} />);
      expect(
        screen.getByRole("button", { name: `What is ${entry.term}?` }),
        key,
      ).toBeInTheDocument();
      unmount();
    }
  });
});
