import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReportPeriod } from "@/services/types";

import { ReportPeriodPicker } from "./report-period-picker";

// Radix Select drives its listbox with Pointer Events + layout APIs that jsdom
// does not implement. Polyfill them locally so the dropdown can actually open
// (same stubs as format-review.test.tsx).
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

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/clients/abc/report",
}));

// Exactly what `availablePeriods` emits for two months of data — all-time first,
// then years, quarters, months.
const PERIODS: ReportPeriod[] = [
  { kind: "all", key: "all", label: "All time" },
  { kind: "year", key: "2026", label: "2026", year: 2026 },
  { kind: "quarter", key: "2026-Q3", label: "Q3 2026", year: 2026, quarter: 3 },
  { kind: "quarter", key: "2026-Q2", label: "Q2 2026", year: 2026, quarter: 2 },
  { kind: "month", key: "2026-07", label: "July 2026", year: 2026, month: 6 },
  { kind: "month", key: "2026-06", label: "June 2026", year: 2026, month: 5 },
];

beforeEach(() => {
  replace.mockClear();
});

function trigger() {
  return screen.getByRole("combobox", { name: "Period for key performance" });
}

describe("ReportPeriodPicker", () => {
  it("offers All time alongside every year, quarter and month", async () => {
    const user = userEvent.setup();
    render(<ReportPeriodPicker periods={PERIODS} value="2026-07" />);

    await user.click(trigger());
    const labels = (await screen.findAllByRole("option")).map((o) => o.textContent?.trim());

    expect(labels).toEqual(["All time", "2026", "Q3 2026", "Q2 2026", "July 2026", "June 2026"]);
  });

  it("navigates to ?period=all when All time is chosen", async () => {
    const user = userEvent.setup();
    render(<ReportPeriodPicker periods={PERIODS} value="2026-07" />);

    await user.click(trigger());
    await user.click(await screen.findByRole("option", { name: "All time" }));

    // The param is always written — an absent param means "no choice yet" and
    // the decoder resolves that to the newest month.
    expect(replace).toHaveBeenCalledWith("/clients/abc/report?period=all", { scroll: false });
  });

  it.each([
    ["2026", "2026"],
    ["Q2 2026", "2026-Q2"],
    ["June 2026", "2026-06"],
  ])("navigates to ?period=%s for the other period kinds", async (label, key) => {
    const user = userEvent.setup();
    render(<ReportPeriodPicker periods={PERIODS} value="2026-07" />);

    await user.click(trigger());
    await user.click(await screen.findByRole("option", { name: label }));

    expect(replace).toHaveBeenCalledWith(`/clients/abc/report?period=${key}`, { scroll: false });
  });

  // ── THE ROUND-TRIP ─────────────────────────────────────────────────────────
  // The picker holds no local state: the trigger only changes once the server
  // re-renders and sends a new `value` prop back. A rerender IS that hop, and
  // it is the one the click tests above cannot reach.
  describe("reflects the value the server sends back", () => {
    it("shows All time once the server confirms period=all", () => {
      const { rerender } = render(<ReportPeriodPicker periods={PERIODS} value="2026-07" />);
      expect(trigger()).toHaveTextContent("July 2026");

      rerender(<ReportPeriodPicker periods={PERIODS} value="all" />);

      expect(trigger()).toHaveTextContent("All time");
    });

    it.each([
      ["2026", "2026"],
      ["2026-Q2", "Q2 2026"],
      ["2026-06", "June 2026"],
    ])("shows the label for %s", (key, label) => {
      const { rerender } = render(<ReportPeriodPicker periods={PERIODS} value="2026-07" />);

      rerender(<ReportPeriodPicker periods={PERIODS} value={key} />);

      expect(trigger()).toHaveTextContent(label);
    });
  });
});
