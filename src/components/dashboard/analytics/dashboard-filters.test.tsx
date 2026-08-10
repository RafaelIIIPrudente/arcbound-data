import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardFilters, DEFAULT_RANGE, PRESET_DAYS } from "./dashboard-filters";

// Radix drives Select and Popover with Pointer Events + layout APIs jsdom does
// not implement (same stubs as report-period-picker.test.tsx).
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

// ⚠️ WARMS THE CALENDAR MODULE HERE, IN A FILE-LOCAL HOOK — see vitest.config.ts
// for why. `date-range-picker.tsx` code-splits react-day-picker behind a
// dynamic `import()` on purpose (kept dynamic; not this file's concern to
// change), so resolving and instantiating that module graph costs real time
// exactly once per file. Paying it here, under `hookTimeout`, means no
// individual test absorbs it — see the file's own measured before/after in
// the F2 handoff.
beforeAll(async () => {
  await import("@/components/ui/calendar");
});

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));

const CLIENTS = [{ id: "c1", name: "Ada Lovelace" }];
/** Local 29 July 2026. */
const TODAY = new Date(2026, 6, 29);

beforeEach(() => {
  replace.mockClear();
  window.matchMedia = ((query: string) => ({
    media: query,
    matches: false, // one calendar month, the narrow default
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

function renderBar(range = DEFAULT_RANGE, client = "all") {
  render(<DashboardFilters clients={CLIENTS} client={client} range={range} today={TODAY} />);
  return userEvent.setup();
}

function rangeTrigger() {
  return screen.getByRole("button", { name: "Filter by date range" });
}

describe("DashboardFilters — the trigger states the window on screen", () => {
  // A preset shows the label the surface passed in ("Last 30 days"), which the
  // shared mono `uppercase` style renders as LAST 30 DAYS — the same treatment
  // the Select trigger it replaces had. A custom window has no passed-in label,
  // so `triggerLabel` supplies one, already uppercase.
  it.each([
    [DEFAULT_RANGE, "Last 30 days"],
    ["7d", "Last 7 days"],
    ["all", "All time"],
    ["2026-06-12..2026-07-29", "12 JUN – 29 JUL 2026"],
  ])("reads %s as %s", (token, label) => {
    renderBar(token);
    expect(rangeTrigger()).toHaveTextContent(label);
  });

  it("renders those labels UPPERCASE, which is what makes the above read right", () => {
    renderBar();
    expect(rangeTrigger().className).toMatch(/\buppercase\b/);
  });
});

describe("DashboardFilters — the URL it writes", () => {
  it("OMITS the param at the default, keeping `/` a clean address", async () => {
    const user = renderBar("7d");
    await user.click(rangeTrigger());
    await user.click(screen.getByRole("button", { name: "Last 30 days" }));

    expect(replace).toHaveBeenCalledWith("/", { scroll: false });
  });

  it("writes each non-default preset", async () => {
    const user = renderBar();
    await user.click(rangeTrigger());
    await user.click(screen.getByRole("button", { name: "Last 90 days" }));

    expect(replace).toHaveBeenCalledWith("/?range=90d", { scroll: false });
  });

  it("writes all-time", async () => {
    const user = renderBar();
    await user.click(rangeTrigger());
    await user.click(screen.getByRole("button", { name: "All time" }));

    expect(replace).toHaveBeenCalledWith("/?range=all", { scroll: false });
  });

  it("writes a custom window as its two days", async () => {
    const user = renderBar();
    await user.click(rangeTrigger());
    await user.click(screen.getByRole("button", { name: /July 10th, 2026/ }));
    await user.click(screen.getByRole("button", { name: /July 25th, 2026/ }));

    expect(replace).toHaveBeenCalledWith("/?range=2026-07-10..2026-07-25", { scroll: false });
  });

  it("keeps the selected client alongside the range", async () => {
    const user = renderBar(DEFAULT_RANGE, "c1");
    await user.click(rangeTrigger());
    await user.click(screen.getByRole("button", { name: "All time" }));

    expect(replace).toHaveBeenCalledWith("/?client=c1&range=all", { scroll: false });
  });

  it("keeps the range when the CLIENT changes", async () => {
    const user = renderBar("90d");
    await user.click(screen.getByRole("combobox", { name: "Filter by client" }));
    await user.click(await screen.findByRole("option", { name: "Ada Lovelace" }));

    expect(replace).toHaveBeenCalledWith("/?client=c1&range=90d", { scroll: false });
  });
});

describe("DashboardFilters — a staff screen, so custom ranges are opted INTO", () => {
  it("renders the calendar, because it passes allowCustom explicitly", async () => {
    // The prop defaults to false so a forgetful caller ships the narrower
    // surface; this screen is staff-only and opts in.
    const user = renderBar();
    await user.click(rangeTrigger());

    expect(document.querySelector("[data-slot=calendar]")).not.toBeNull();
  });

  it("offers exactly the presets the decoder accepts, plus all-time", async () => {
    const user = renderBar();
    await user.click(rangeTrigger());

    const keys = [...document.querySelectorAll("[data-preset-key]")].map((el) =>
      el.getAttribute("data-preset-key"),
    );
    expect(keys).toEqual([...PRESET_DAYS.map((d) => `${d}d`), "all"]);
  });

  it("disables tomorrow — the future is not selectable", async () => {
    const user = renderBar();
    await user.click(rangeTrigger());

    expect(screen.getByRole("button", { name: /July 30th, 2026/ })).toBeDisabled();
  });
});
