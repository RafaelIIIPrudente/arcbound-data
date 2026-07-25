import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import type { FollowerTrend } from "@/lib/follower-trend";

import { FollowerTrendPanel, toChartPoints } from "./follower-trend";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const TREND: FollowerTrend = {
  kind: "trend",
  series: [
    { followers: 1000, at: "2026-04-01T00:00:00.000Z" },
    { followers: 1200, at: "2026-06-01T00:00:00.000Z" },
    { followers: 1400, at: "2026-07-01T00:00:00.000Z" },
  ],
  net: 400,
  percent: 40,
  spanDays: 91,
};

function figure(label: string) {
  return screen.getByText(label).parentElement!;
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ FOUR STATES, FOUR TREATMENTS. "Could not be read", "nothing recorded", "one
// reading" and "a trend" are four different facts, and the screen has to keep
// them apart as carefully as the module does.
// ─────────────────────────────────────────────────────────────────────────────
describe("FollowerTrendPanel — the states stay apart on screen", () => {
  it("shows an em dash with a spoken reason when the read failed", () => {
    render(<FollowerTrendPanel trend={{ kind: "unavailable" }} />);

    expect(screen.getByText("—")).toHaveAttribute("aria-hidden");
    // The dash is spoken as a reason, and the reason is also visible.
    expect(screen.getByText(/follower trend could not be read/i)).toBeInTheDocument();
    expect(screen.getByText(/upload history could not be read/i)).toBeInTheDocument();
    // A failed read is not an empty history.
    expect(screen.queryByText(/no follower count has been recorded/i)).not.toBeInTheDocument();
  });

  it("says nothing has been recorded when no upload carried a count", () => {
    render(<FollowerTrendPanel trend={{ kind: "none" }} />);

    expect(screen.getByText(/no follower count has been recorded yet/i)).toBeInTheDocument();
    // Distinct from a failed read.
    expect(screen.queryByText(/could not be read/i)).not.toBeInTheDocument();
  });

  // ⚠️ THE STATE MOST LIKELY TO BE GOT WRONG. One reading is a level. It must
  // never render as a flat line, a 0% change, or a one-dot chart implying
  // stability that was never observed.
  it("shows a single reading as a level, and says a trend needs a second upload", () => {
    render(
      <FollowerTrendPanel
        trend={{ kind: "single", latest: { followers: 1200, at: "2026-07-01T00:00:00.000Z" } }}
      />,
    );

    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(screen.getByText(/needs a second upload/i)).toBeInTheDocument();
  });

  it("prints no percentage and no net change for a single reading", () => {
    render(
      <FollowerTrendPanel
        trend={{ kind: "single", latest: { followers: 1200, at: "2026-07-01T00:00:00.000Z" } }}
      />,
    );

    // Not 0%, not "no change" — there is simply no movement to report.
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/net change/i)).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("FollowerTrendPanel — a trend", () => {
  it("reports net change and percent change, each stated over the observed span", () => {
    render(<FollowerTrendPanel trend={TREND} />);

    expect(within(figure("Net change")).getByText(/\+400/)).toBeInTheDocument();
    expect(within(figure("Percent change")).getByText(/\+40\.0%/)).toBeInTheDocument();
    // ⚠️ EVERY FIGURE CARRIES THE WINDOW IT WAS MEASURED OVER. "+400" alone
    // means nothing without knowing whether that was a week or a year.
    expect(screen.getByText(/91 days/i)).toBeInTheDocument();
  });

  it("states how many readings the trend is drawn from", () => {
    render(<FollowerTrendPanel trend={TREND} />);

    expect(screen.getByText(/3 readings/i)).toBeInTheDocument();
  });

  // ⚠️ A DECLINE IS A FINDING, NOT AN ERROR. Direction is never carried by
  // colour alone, and the magnitude is never printed bare — "200" for a loss of
  // 200 reads as a gain.
  it("renders a decline with a ▼ glyph, a spoken direction, and a signed number", () => {
    render(
      <FollowerTrendPanel
        trend={{
          kind: "trend",
          series: [
            { followers: 1000, at: "2026-06-01T00:00:00.000Z" },
            { followers: 800, at: "2026-07-01T00:00:00.000Z" },
          ],
          net: -200,
          percent: -20,
          spanDays: 30,
        }}
      />,
    );

    const net = figure("Net change");
    expect(within(net).getByText("▼")).toHaveAttribute("aria-hidden");
    expect(within(net).getByText(/down/i)).toBeInTheDocument();
    // Signed, NOT an absolute value.
    expect(within(net).getByText(/[-−]200/)).toBeInTheDocument();
    expect(within(net).queryByText(/^200$/)).not.toBeInTheDocument();
  });

  it("renders growth with a ▲ glyph and a spoken direction", () => {
    render(<FollowerTrendPanel trend={TREND} />);

    const net = figure("Net change");
    expect(within(net).getByText("▲")).toHaveAttribute("aria-hidden");
    expect(within(net).getByText(/up/i)).toBeInTheDocument();
  });

  // ⚠️ A PERCENTAGE OF NOTHING IS UNDEFINED — not Infinity, not 100%.
  it("explains an undefined percentage rather than printing a number", () => {
    render(
      <FollowerTrendPanel
        trend={{
          kind: "trend",
          series: [
            { followers: 0, at: "2026-06-01T00:00:00.000Z" },
            { followers: 500, at: "2026-07-01T00:00:00.000Z" },
          ],
          net: 500,
          percent: null,
          spanDays: 30,
        }}
      />,
    );

    const pct = figure("Percent change");
    expect(within(pct).getByText("—")).toHaveAttribute("aria-hidden");
    expect(screen.getByText(/first reading was 0/i)).toBeInTheDocument();
    // The net change is still perfectly reportable.
    expect(within(figure("Net change")).getByText(/\+500/)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE X-AXIS IS THE THING MOST LIKELY TO LIE HERE. Uploads are irregularly
// spaced, so plotting points at equal intervals would draw a three-month gap
// exactly like a one-week gap — every plotted value correct, the shape wrong.
// jsdom cannot measure SVG, so this pins the DATA the axis is given: real
// timestamps on a numeric domain, which is what makes spacing proportional.
// ─────────────────────────────────────────────────────────────────────────────
describe("toChartPoints — the x-axis is time, not position", () => {
  it("carries a real timestamp per point rather than an ordinal index", () => {
    const points = toChartPoints(TREND.series);

    expect(points.map((p) => p.t)).toEqual([
      Date.parse("2026-04-01T00:00:00.000Z"),
      Date.parse("2026-06-01T00:00:00.000Z"),
      Date.parse("2026-07-01T00:00:00.000Z"),
    ]);
  });

  it("spaces an irregular gap proportionally to the time it represents", () => {
    // 1 Apr → 1 Jun is 61 days; 1 Jun → 1 Jul is 30. An ordinal axis would draw
    // these two gaps identically; a time axis draws the first twice as wide.
    const [a, b, c] = toChartPoints(TREND.series);

    expect((b!.t - a!.t) / (c!.t - b!.t)).toBeCloseTo(61 / 30, 5);
  });

  it("keeps the follower value alongside its time", () => {
    expect(toChartPoints(TREND.series)).toEqual([
      { t: Date.parse("2026-04-01T00:00:00.000Z"), followers: 1000 },
      { t: Date.parse("2026-06-01T00:00:00.000Z"), followers: 1200 },
      { t: Date.parse("2026-07-01T00:00:00.000Z"), followers: 1400 },
    ]);
  });
});
