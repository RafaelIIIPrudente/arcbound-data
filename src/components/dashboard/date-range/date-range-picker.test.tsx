import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DateRangePicker } from "./date-range-picker";

// Radix drives its popover with Pointer Events + layout APIs jsdom does not
// implement (same stubs as report-period-picker.test.tsx).
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

// ⚠️ THE ROUTER MUST NEVER BE REACHED. Both callers build their URLs
// differently — `hrefFor` on the dashboard, `reportPeriodHref` on the report,
// and the second carries the never-strip-the-param rule. A router in here would
// duplicate that logic and let the two drift.
const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push, prefetch: vi.fn() }),
  usePathname: () => "/",
}));

/** Local 29 July 2026 — the day the user is looking at, not an instant. */
const TODAY = new Date(2026, 6, 29);

const DASHBOARD_PRESETS = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "all", label: "All time" },
];

const REPORT_PRESETS = [
  { key: "all", label: "All time" },
  { key: "2026", label: "2026", group: "Years" },
  { key: "2026-Q3", label: "Q3 2026", group: "Quarters" },
  { key: "2026-07", label: "July 2026", group: "Months" },
];

let matches = false;

beforeEach(() => {
  replace.mockClear();
  push.mockClear();
  matches = false;
  window.matchMedia = ((query: string) => ({
    media: query,
    get matches() {
      return matches;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

function trigger() {
  return screen.getByRole("button", { name: "Date range" });
}

/** A calendar day button, found by the ARIA label react-day-picker gives it. */
function day(name: RegExp) {
  return screen.getByRole("button", { name });
}

function monthGrids() {
  return document.querySelectorAll("[data-slot=calendar] table");
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(trigger());
}

describe("DateRangePicker — the trigger", () => {
  it("reads the label of the preset currently selected", () => {
    render(
      <DateRangePicker presets={DASHBOARD_PRESETS} value="30d" onSelect={vi.fn()} today={TODAY} />,
    );

    expect(trigger()).toHaveTextContent("Last 30 days");
  });

  it("reads a custom window as its dates", () => {
    render(
      <DateRangePicker
        presets={DASHBOARD_PRESETS}
        value="2026-06-12..2026-07-29"
        allowCustom
        onSelect={vi.fn()}
        today={TODAY}
      />,
    );

    expect(trigger()).toHaveTextContent("12 JUN – 29 JUL 2026");
  });

  it("reads the REPORT's prefixed custom window too", () => {
    render(
      <DateRangePicker
        presets={REPORT_PRESETS}
        value="custom:2026-06-12..2026-07-29"
        customPrefix="custom:"
        allowCustom
        onSelect={vi.fn()}
        today={TODAY}
      />,
    );

    expect(trigger()).toHaveTextContent("12 JUN – 29 JUL 2026");
  });

  it("takes the accessible name its surface gives it", () => {
    render(
      <DateRangePicker
        presets={REPORT_PRESETS}
        value="2026-07"
        ariaLabel="Reporting period"
        onSelect={vi.fn()}
        today={TODAY}
      />,
    );

    expect(screen.getByRole("button", { name: "Reporting period" })).toHaveTextContent("July 2026");
  });
});

describe("DateRangePicker — presets", () => {
  it("renders every preset it is given, in order", async () => {
    const user = userEvent.setup();
    render(
      <DateRangePicker presets={DASHBOARD_PRESETS} value="30d" onSelect={vi.fn()} today={TODAY} />,
    );
    await open(user);

    const keys = [...document.querySelectorAll("[data-preset-key]")].map((el) =>
      el.getAttribute("data-preset-key"),
    );
    expect(keys).toEqual(["7d", "30d", "90d", "all"]);
  });

  it("hard-codes nothing: the report's own periods render just as well", async () => {
    const user = userEvent.setup();
    render(
      <DateRangePicker presets={REPORT_PRESETS} value="2026-07" onSelect={vi.fn()} today={TODAY} />,
    );
    await open(user);

    const keys = [...document.querySelectorAll("[data-preset-key]")].map((el) =>
      el.getAttribute("data-preset-key"),
    );
    expect(keys).toEqual(["all", "2026", "2026-Q3", "2026-07"]);
  });

  it("groups the presets that carry a group, and only those", async () => {
    const user = userEvent.setup();
    render(
      <DateRangePicker presets={REPORT_PRESETS} value="2026-07" onSelect={vi.fn()} today={TODAY} />,
    );
    await open(user);

    const groups = [...document.querySelectorAll("[data-preset-group]")].map((el) =>
      el.textContent?.trim(),
    );
    expect(groups).toEqual(["Years", "Quarters", "Months"]);
  });

  it("renders no group headings when no preset carries one", async () => {
    const user = userEvent.setup();
    render(
      <DateRangePicker presets={DASHBOARD_PRESETS} value="30d" onSelect={vi.fn()} today={TODAY} />,
    );
    await open(user);

    expect(document.querySelectorAll("[data-preset-group]")).toHaveLength(0);
  });

  it("hands back the preset's KEY, once, when one is chosen", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DateRangePicker presets={DASHBOARD_PRESETS} value="30d" onSelect={onSelect} today={TODAY} />,
    );
    await open(user);
    await user.click(screen.getByRole("button", { name: "Last 7 days" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("7d");
  });

  it("hands back a named report key untouched — no prefix, no rewriting", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DateRangePicker
        presets={REPORT_PRESETS}
        value="all"
        customPrefix="custom:"
        allowCustom
        onSelect={onSelect}
        today={TODAY}
      />,
    );
    await open(user);
    await user.click(screen.getByRole("button", { name: "Q3 2026" }));

    expect(onSelect).toHaveBeenCalledWith("2026-Q3");
  });
});

describe("DateRangePicker — allowCustom is the client/staff gate", () => {
  it("DEFAULTS TO CLOSED: omitting the prop renders no calendar at all", async () => {
    // ⚠️ FAILS CLOSED ON PURPOSE. The same component renders on /r/[token], the
    // report a CLIENT holds. A caller that forgets this prop must ship the
    // narrower surface, never the wider one.
    const user = userEvent.setup();
    render(
      <DateRangePicker presets={REPORT_PRESETS} value="2026-07" onSelect={vi.fn()} today={TODAY} />,
    );
    await open(user);

    expect(monthGrids()).toHaveLength(0);
    expect(document.querySelector("[data-slot=calendar]")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/custom/i);
  });

  it("stays closed when explicitly false", async () => {
    const user = userEvent.setup();
    render(
      <DateRangePicker
        presets={REPORT_PRESETS}
        value="2026-07"
        allowCustom={false}
        onSelect={vi.fn()}
        today={TODAY}
      />,
    );
    await open(user);

    expect(document.querySelector("[data-slot=calendar]")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/custom/i);
  });

  it("opens the calendar when the surface allows it", async () => {
    const user = userEvent.setup();
    render(
      <DateRangePicker
        presets={DASHBOARD_PRESETS}
        value="30d"
        allowCustom
        onSelect={vi.fn()}
        today={TODAY}
      />,
    );
    await open(user);

    expect(document.querySelector("[data-slot=calendar]")).not.toBeNull();
  });
});

describe("DateRangePicker — choosing a window", () => {
  async function openCalendar(onSelect: ReturnType<typeof vi.fn>, customPrefix?: string) {
    const user = userEvent.setup();
    render(
      <DateRangePicker
        presets={DASHBOARD_PRESETS}
        value="30d"
        allowCustom
        customPrefix={customPrefix}
        onSelect={onSelect}
        today={TODAY}
      />,
    );
    await open(user);
    return user;
  }

  it("emits ONE token after the SECOND day, and nothing after the first", async () => {
    const onSelect = vi.fn();
    const user = await openCalendar(onSelect);

    await user.click(day(/July 10th, 2026/));
    expect(onSelect).not.toHaveBeenCalled(); // a lone anchor is not a window

    await user.click(day(/July 25th, 2026/));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("2026-07-10..2026-07-25");
  });

  it("emits the REPORT's prefixed token on that surface", async () => {
    const onSelect = vi.fn();
    const user = await openCalendar(onSelect, "custom:");

    await user.click(day(/July 10th, 2026/));
    await user.click(day(/July 25th, 2026/));

    expect(onSelect).toHaveBeenCalledWith("custom:2026-07-10..2026-07-25");
  });

  it("RESTARTS rather than inverting when the second day precedes the first", async () => {
    // ⚠️ An inverted range must be unreachable, not repaired: silently swapping
    // the ends answers a question the user did not ask, and `decodeRange`
    // rejects the token anyway.
    const onSelect = vi.fn();
    const user = await openCalendar(onSelect);

    await user.click(day(/July 20th, 2026/));
    await user.click(day(/July 10th, 2026/)); // earlier — becomes the new anchor
    expect(onSelect).not.toHaveBeenCalled();

    await user.click(day(/July 25th, 2026/));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("2026-07-10..2026-07-25");
  });

  // ⚠️ THE ZONE MUST STRADDLE UTC IN BOTH DIRECTIONS, AND `today` MUST BE BUILT
  // INSIDE IT. Local midnight maps to the SAME UTC day everywhere west of UTC,
  // so a west-only test cannot fail for the bug it names — reading the tapped
  // square with toISOString() goes wrong east of UTC, where local midnight is
  // still the previous day in UTC. Kiritimati (UTC+14) is the extreme case.
  it.each(["Pacific/Kiritimati", "America/New_York"])(
    "reads the day the user TAPPED, from %s",
    async (tz) => {
      const before = process.env.TZ;
      process.env.TZ = tz;
      try {
        const onSelect = vi.fn();
        const user = userEvent.setup();
        render(
          <DateRangePicker
            presets={DASHBOARD_PRESETS}
            value="30d"
            allowCustom
            onSelect={onSelect}
            // Built here, not at module load: `TODAY`'s local day is itself
            // read in the ambient zone, so a shared constant would silently
            // become a different calendar day in each of these runs.
            today={new Date(2026, 6, 29)}
          />,
        );
        await open(user);

        await user.click(day(/July 10th, 2026/));
        await user.click(day(/July 25th, 2026/));

        expect(onSelect).toHaveBeenCalledWith("2026-07-10..2026-07-25");
      } finally {
        if (before === undefined) delete process.env.TZ;
        else process.env.TZ = before;
      }
    },
  );

  it("selecting the same day twice is a one-day window", async () => {
    const onSelect = vi.fn();
    const user = await openCalendar(onSelect);

    await user.click(day(/July 10th, 2026/));
    await user.click(day(/July 10th, 2026/));

    expect(onSelect).toHaveBeenCalledWith("2026-07-10..2026-07-10");
  });
});

describe("DateRangePicker — the future is not selectable", () => {
  async function openCalendar() {
    const user = userEvent.setup();
    render(
      <DateRangePicker
        presets={DASHBOARD_PRESETS}
        value="30d"
        allowCustom
        onSelect={vi.fn()}
        today={TODAY}
      />,
    );
    await open(user);
    return user;
  }

  it("disables the day after today", async () => {
    // No post exists in the future, and an end date beyond today would pad the
    // window and shift the prior baseline by the same amount.
    await openCalendar();
    expect(day(/July 30th, 2026/)).toBeDisabled();
  });

  it("leaves today itself selectable", async () => {
    await openCalendar();
    expect(day(/July 29th, 2026/)).not.toBeDisabled();
  });
});

describe("DateRangePicker — the router is not its business", () => {
  it("navigates NOWHERE when a preset is chosen", async () => {
    const user = userEvent.setup();
    render(
      <DateRangePicker presets={DASHBOARD_PRESETS} value="30d" onSelect={vi.fn()} today={TODAY} />,
    );
    await open(user);
    await user.click(screen.getByRole("button", { name: "Last 7 days" }));

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates NOWHERE when a window is chosen", async () => {
    const user = userEvent.setup();
    render(
      <DateRangePicker
        presets={DASHBOARD_PRESETS}
        value="30d"
        allowCustom
        onSelect={vi.fn()}
        today={TODAY}
      />,
    );
    await open(user);
    await user.click(day(/July 10th, 2026/));
    await user.click(day(/July 25th, 2026/));

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("DateRangePicker — two months, but not on a phone", () => {
  it("shows two months from the sm breakpoint up", async () => {
    matches = true;
    const user = userEvent.setup();
    render(
      <DateRangePicker
        presets={DASHBOARD_PRESETS}
        value="30d"
        allowCustom
        onSelect={vi.fn()}
        today={TODAY}
      />,
    );
    await open(user);

    expect(monthGrids()).toHaveLength(2);
  });

  it("shows ONE below it — two side by side do not fit on a phone", async () => {
    matches = false;
    const user = userEvent.setup();
    render(
      <DateRangePicker
        presets={DASHBOARD_PRESETS}
        value="30d"
        allowCustom
        onSelect={vi.fn()}
        today={TODAY}
      />,
    );
    await open(user);

    expect(monthGrids()).toHaveLength(1);
  });
});
