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
      <ImpressionsByWeekdayChart data={DATA} period={JULY} datedPosts={3} undatedPosts={0} />,
    );

    expect(screen.getByText("Average impressions by day of week posted")).toBeInTheDocument();

    // ⚠️ No word that turns a measurement into advice may appear — the same
    // discipline that forbids ranks in the cross-client comparison. This is a
    // client-facing document; "best day to post" is a causal claim the data
    // has not earned.
    expect(container.textContent).not.toMatch(/\b(best|optimal|recommended?|top)\b/i);
  });

  it("labels the card with the period and the number of DATED posts it averaged", () => {
    render(<ImpressionsByWeekdayChart data={DATA} period={JULY} datedPosts={3} undatedPosts={0} />);

    expect(screen.getByText("July 2026")).toBeInTheDocument();
    expect(screen.getByText(/3 posts/)).toBeInTheDocument();
  });

  it("discloses posts excluded for having no resolved date, pluralised", () => {
    render(<ImpressionsByWeekdayChart data={DATA} period={JULY} datedPosts={3} undatedPosts={2} />);

    expect(
      screen.getByText(/2 posts without a resolved date are not counted here/i),
    ).toBeInTheDocument();
  });

  it("uses the singular when exactly one post was excluded", () => {
    render(<ImpressionsByWeekdayChart data={DATA} period={JULY} datedPosts={3} undatedPosts={1} />);

    expect(
      screen.getByText(/1 post without a resolved date is not counted here/i),
    ).toBeInTheDocument();
  });

  it("says nothing about exclusions when every post had a resolved date", () => {
    render(<ImpressionsByWeekdayChart data={DATA} period={JULY} datedPosts={3} undatedPosts={0} />);

    expect(screen.queryByText(/not counted here/i)).not.toBeInTheDocument();
  });

  it("draws the chart for a datable 0-impression weekday — a real zero is not empty", () => {
    // Every weekday reads 0 because the sole dated post earned 0 impressions. It
    // is still a DATED post, so the chart draws (a flat line) rather than showing
    // the empty state — the genuine-zero-vs-empty distinction the old
    // `data.every(v===0)` check collapsed.
    const zeros = DATA.map((d) => ({ ...d, value: 0 }));
    const { container } = render(
      <ImpressionsByWeekdayChart data={zeros} period={JULY} datedPosts={1} undatedPosts={0} />,
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
      <ImpressionsByWeekdayChart data={zeros} period={JULY} datedPosts={0} undatedPosts={0} />,
    );

    expect(screen.getByText("No posts in this period.")).toBeInTheDocument();
  });

  it("distinguishes 'no datable posts' from 'no posts' when all posts were undated", () => {
    const zeros = DATA.map((d) => ({ ...d, value: 0 }));
    render(
      <ImpressionsByWeekdayChart data={zeros} period={JULY} datedPosts={0} undatedPosts={4} />,
    );

    expect(
      screen.getByText(/no posts with a resolved publish date in this period/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("No posts in this period.")).not.toBeInTheDocument();
    expect(
      screen.getByText(/4 posts without a resolved date are not counted here/i),
    ).toBeInTheDocument();
  });
});
