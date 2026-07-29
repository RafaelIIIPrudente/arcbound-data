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
  window.matchMedia = ((query: string) => ({
    media: query,
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
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

// ⚠️ REPLACES the `role="combobox"` / `role="option"` selectors this file used
// while the control was a Radix `Select`. It is now a Popover — a `Select`
// cannot host a calendar inside a `SelectItem` — so the trigger is a button and
// the periods are buttons. The ACCESSIBLE NAME is unchanged and still asserted
// here; every behavioural expectation below is untouched.
function trigger() {
  return screen.getByRole("button", { name: "Reporting period" });
}

/** One period option, by its visible label. */
function option(name: string) {
  return screen.getByRole("button", { name });
}

describe("ReportPeriodPicker", () => {
  it("offers All time alongside every year, quarter and month", async () => {
    const user = userEvent.setup();
    render(<ReportPeriodPicker periods={PERIODS} value="2026-07" />);

    await user.click(trigger());
    const labels = [...document.querySelectorAll("[data-preset-key]")].map((o) =>
      o.textContent?.trim(),
    );

    expect(labels).toEqual(["All time", "2026", "Q3 2026", "Q2 2026", "July 2026", "June 2026"]);
  });

  it("navigates to ?period=all when All time is chosen", async () => {
    const user = userEvent.setup();
    render(<ReportPeriodPicker periods={PERIODS} value="2026-07" />);

    await user.click(trigger());
    await user.click(option("All time"));

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
    await user.click(option(label));

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

// ─────────────────────────────────────────────────────────────────────────────
// THE STAFF / CLIENT BOUNDARY.
//
// This same component renders on `/r/[token]`, the report a CLIENT holds. The
// custom-range calendar is a staff affordance, and the gate is a prop that
// FAILS CLOSED — so the interesting test is the one that proves the default,
// not the one that proves the opt-in.
// ─────────────────────────────────────────────────────────────────────────────
describe("ReportPeriodPicker — the custom range is gated", () => {
  it("SHIPS NO CALENDAR AND NO CUSTOM AFFORDANCE WHEN allowCustom IS OMITTED", async () => {
    // ⚠️ THIS IS THE CLIENT-FACING CASE. `/r/[token]` renders exactly this call
    // shape. If this test ever goes green for the wrong reason, a client gains a
    // control over a window nobody meant to give them.
    const user = userEvent.setup();
    render(<ReportPeriodPicker periods={PERIODS} value="2026-07" />);
    await user.click(trigger());

    expect(document.querySelector("[data-slot=calendar]")).toBeNull();
    expect(document.querySelectorAll("[data-slot=calendar] table")).toHaveLength(0);
    expect(document.body.textContent ?? "").not.toMatch(/custom/i);
  });

  it("ships none when allowCustom is explicitly false either", async () => {
    const user = userEvent.setup();
    render(<ReportPeriodPicker periods={PERIODS} value="2026-07" allowCustom={false} />);
    await user.click(trigger());

    expect(document.querySelector("[data-slot=calendar]")).toBeNull();
  });

  it("still offers every NAMED period to a client — only the calendar is withheld", async () => {
    // The gate narrows one affordance, not the screen. A client keeps all-time,
    // years, quarters and months.
    const user = userEvent.setup();
    render(<ReportPeriodPicker periods={PERIODS} value="2026-07" />);
    await user.click(trigger());

    expect(
      [...document.querySelectorAll("[data-preset-key]")].map((o) => o.textContent?.trim()),
    ).toEqual(["All time", "2026", "Q3 2026", "Q2 2026", "July 2026", "June 2026"]);
  });

  it("offers the calendar on a STAFF screen, which opts in explicitly", async () => {
    const user = userEvent.setup();
    render(
      <ReportPeriodPicker
        periods={PERIODS}
        value="2026-07"
        allowCustom
        today={new Date(2026, 6, 29)}
      />,
    );
    await user.click(trigger());

    expect(document.querySelector("[data-slot=calendar]")).not.toBeNull();
  });
});

describe("ReportPeriodPicker — a custom window travels as a prefixed key", () => {
  it("ALWAYS WRITES the param for a custom window, exactly as for a named one", async () => {
    // ⚠️ The never-strip rule (report-period.ts) extends to custom keys verbatim:
    // an absent param means "no choice yet", so a stripped custom key would
    // silently revert to the newest month.
    const user = userEvent.setup();
    render(
      <ReportPeriodPicker
        periods={PERIODS}
        value="2026-07"
        allowCustom
        today={new Date(2026, 6, 29)}
      />,
    );
    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: /July 10th, 2026/ }));
    await user.click(screen.getByRole("button", { name: /July 25th, 2026/ }));

    expect(replace).toHaveBeenCalledWith(
      "/clients/abc/report?period=custom%3A2026-07-10..2026-07-25",
      { scroll: false },
    );
  });

  it("reads a custom key back as its dates, not as a raw token", () => {
    render(
      <ReportPeriodPicker
        periods={PERIODS}
        value="custom:2026-06-12..2026-07-29"
        allowCustom
        today={new Date(2026, 6, 29)}
      />,
    );

    expect(trigger()).toHaveTextContent("12 JUN – 29 JUL 2026");
  });
});
