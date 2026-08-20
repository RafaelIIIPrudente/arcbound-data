import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ReportPeriod, SeriesPoint } from "@/services/types";

import { ImpressionsByWeekdayChart } from "./impressions-by-weekday-chart";

// recharts measures its container; jsdom has no layout engine.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const JULY: ReportPeriod = {
  kind: "month",
  key: "2026-07",
  label: "July 2026",
  year: 2026,
  month: 6,
};

const DATA: SeriesPoint[] = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 0 },
  { label: "Tue", value: 0 },
  { label: "Wed", value: 200 },
  { label: "Thu", value: 0 },
  { label: "Fri", value: 500 },
  { label: "Sat", value: 0 },
];

describe("ImpressionsByWeekdayChart (report, on-screen)", () => {
  it("titles the card as a MEASUREMENT, never as a recommendation", () => {
    const { container } = render(
      <ImpressionsByWeekdayChart
        data={DATA}
        period={JULY}
        placedPosts={3}
        coarsePosts={0}
        undatedPosts={0}
      />,
    );

    expect(screen.getByText("Average impressions by day of week posted")).toBeInTheDocument();

    // ⚠️ No word that turns a measurement into advice may appear — the same
    // discipline that forbids ranks in the cross-client comparison. This is a
    // client-facing document; "best day to post" is a causal claim the data
    // has not earned.
    expect(container.textContent).not.toMatch(/\b(best|optimal|recommended?|top)\b/i);
  });

  it("labels the card with the period and the number of DATED posts it averaged", () => {
    render(
      <ImpressionsByWeekdayChart
        data={DATA}
        period={JULY}
        placedPosts={3}
        coarsePosts={0}
        undatedPosts={0}
      />,
    );

    expect(screen.getByText("July 2026")).toBeInTheDocument();
    expect(screen.getByText(/3 posts/)).toBeInTheDocument();
  });

  it("discloses posts excluded for having no date at all, pluralised", () => {
    render(
      <ImpressionsByWeekdayChart
        data={DATA}
        period={JULY}
        placedPosts={3}
        coarsePosts={0}
        undatedPosts={2}
      />,
    );

    expect(screen.getByText(/2 posts have no publish date at all/i)).toBeInTheDocument();
  });

  it("uses the singular when exactly one post was excluded", () => {
    render(
      <ImpressionsByWeekdayChart
        data={DATA}
        period={JULY}
        placedPosts={3}
        coarsePosts={0}
        undatedPosts={1}
      />,
    );

    expect(screen.getByText(/1 post has no publish date at all/i)).toBeInTheDocument();
  });

  it("says nothing about exclusions when every post was placed", () => {
    render(
      <ImpressionsByWeekdayChart
        data={DATA}
        period={JULY}
        placedPosts={3}
        coarsePosts={0}
        undatedPosts={0}
      />,
    );

    expect(screen.queryByText(/built from/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no publish date/i)).not.toBeInTheDocument();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ⚠️ THIS PANEL IS PRINTED AND HANDED TO THE CLIENT. The three-state note is
  // the only thing standing between "which weekday works for you" and a chart
  // built mostly from month-snapped dates. It has to be plain, calm, and true.
  // ───────────────────────────────────────────────────────────────────────────

  it("⚠️ discloses coarse posts as DATED-BUT-BLUNT, never as missing a date", () => {
    render(
      <ImpressionsByWeekdayChart
        data={DATA}
        period={JULY}
        placedPosts={3}
        coarsePosts={5}
        undatedPosts={0}
      />,
    );

    expect(screen.getByText(/5 posts are dated only to the week or month/i)).toBeInTheDocument();
    // ⚠️ ASSERT THE WORDS. A coarse post announced with the undated sentence
    // reads perfectly and tells the Client something untrue about their own data.
    expect(screen.queryByText(/no publish date at all/i)).not.toBeInTheDocument();
  });

  it("⚠️ keeps the two exclusions in separate sentences when both occur", () => {
    render(
      <ImpressionsByWeekdayChart
        data={DATA}
        period={JULY}
        placedPosts={3}
        coarsePosts={5}
        undatedPosts={2}
      />,
    );

    const note = screen.getByRole("note");
    expect(note.textContent).toMatch(/built from the 3 posts whose exact publish day is known/i);
    expect(note.textContent).toMatch(/5 posts are dated only to the week or month/i);
    expect(note.textContent).toMatch(/2 posts have no publish date at all/i);
    expect(note.textContent).not.toMatch(/\b7\b/);
  });

  it("⚠️ speaks plainly — no age token, no internal vocabulary", () => {
    const { container } = render(
      <ImpressionsByWeekdayChart
        data={DATA}
        period={JULY}
        placedPosts={3}
        coarsePosts={5}
        undatedPosts={2}
      />,
    );

    expect(container.textContent).not.toMatch(/\b\d+(m|w|d|y|h|mo)\b/);
    expect(container.textContent).not.toMatch(
      /precision|granularity|estimated_post_date|resolver|scrape/i,
    );
  });

  it("draws the chart for a datable 0-impression weekday — a real zero is not empty", () => {
    // Every weekday reads 0 because the sole dated post earned 0 impressions. It
    // is still a DATED post, so the chart draws (a flat line) rather than showing
    // the empty state — the genuine-zero-vs-empty distinction the old
    // `data.every(v===0)` check collapsed.
    const zeros = DATA.map((d) => ({ ...d, value: 0 }));
    const { container } = render(
      <ImpressionsByWeekdayChart
        data={zeros}
        period={JULY}
        placedPosts={1}
        coarsePosts={0}
        undatedPosts={0}
      />,
    );

    expect(screen.queryByText("No posts in this period.")).not.toBeInTheDocument();
    // The chart surface renders, not the empty paragraph. Asserted on the
    // ChartContainer wrapper, not an <svg> — recharts' ResponsiveContainer draws
    // nothing under jsdom's zero-size layout, so an svg query would be flaky.
    expect(container.querySelector('[data-slot="chart"]')).not.toBeNull();
  });

  it("shows a calm empty state when no datable posts fell in the period", () => {
    const zeros = DATA.map((d) => ({ ...d, value: 0 }));
    render(
      <ImpressionsByWeekdayChart
        data={zeros}
        period={JULY}
        placedPosts={0}
        coarsePosts={0}
        undatedPosts={0}
      />,
    );

    expect(screen.getByText("No posts in this period.")).toBeInTheDocument();
  });

  it("distinguishes 'no placeable posts' from 'no posts' when all posts were undated", () => {
    const zeros = DATA.map((d) => ({ ...d, value: 0 }));
    render(
      <ImpressionsByWeekdayChart
        data={zeros}
        period={JULY}
        placedPosts={0}
        coarsePosts={0}
        undatedPosts={4}
      />,
    );

    expect(
      screen.getByText(/no posts with a known publish day in this period/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("No posts in this period.")).not.toBeInTheDocument();
    expect(screen.getByText(/4 posts have no publish date at all/i)).toBeInTheDocument();
  });

  it("⚠️ says the same when every post is merely too coarse — not 'no posts'", () => {
    // The period is full of real, DATED posts. Telling a Client "no posts in this
    // period" when they posted nine times is the worst sentence on the page.
    const zeros = DATA.map((d) => ({ ...d, value: 0 }));
    render(
      <ImpressionsByWeekdayChart
        data={zeros}
        period={JULY}
        placedPosts={0}
        coarsePosts={9}
        undatedPosts={0}
      />,
    );

    expect(
      screen.getByText(/no posts with a known publish day in this period/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("No posts in this period.")).not.toBeInTheDocument();
    expect(screen.getByText(/9 posts are dated only to the week or month/i)).toBeInTheDocument();
  });
});
