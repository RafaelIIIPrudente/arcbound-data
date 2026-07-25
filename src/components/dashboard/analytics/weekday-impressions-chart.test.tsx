import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { SeriesPoint } from "@/services/types";

import { WeekdayImpressionsChart } from "./weekday-impressions-chart";

// recharts measures its container; jsdom has no layout engine.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const DATA: SeriesPoint[] = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 0 },
  { label: "Tue", value: 0 },
  { label: "Wed", value: 200 },
  { label: "Thu", value: 0 },
  { label: "Fri", value: 500 },
  { label: "Sat", value: 0 },
];

describe("WeekdayImpressionsChart", () => {
  it("titles the card as a MEASUREMENT, never as a recommendation", () => {
    const { container } = render(
      <WeekdayImpressionsChart data={DATA} rangeLabel="30 days" datedPosts={3} undatedPosts={0} />,
    );

    expect(screen.getByText("Average impressions by day of week posted")).toBeInTheDocument();

    // ⚠️ The data cannot support a causal "post on X" claim at book-level sample
    // sizes — the same discipline that forbids ranks in the comparison. No word
    // that turns a measurement into advice may appear anywhere in the card.
    expect(container.textContent).not.toMatch(/\b(best|optimal|recommended?|top)\b/i);
  });

  it("states the window and the number of posts it averaged", () => {
    render(
      <WeekdayImpressionsChart data={DATA} rangeLabel="30 days" datedPosts={3} undatedPosts={0} />,
    );

    expect(screen.getByText("30 days")).toBeInTheDocument();
    expect(screen.getByText(/3 posts/)).toBeInTheDocument();
  });

  it("discloses posts excluded for having no resolved date, pluralised", () => {
    render(
      <WeekdayImpressionsChart data={DATA} rangeLabel="30 days" datedPosts={3} undatedPosts={2} />,
    );

    // The exclusion is stated, not hidden — a reader must know the chart rests on
    // fewer posts than the window holds, and WHY.
    expect(
      screen.getByText(/2 posts without a resolved date are not counted here/i),
    ).toBeInTheDocument();
  });

  it("uses the singular when exactly one post was excluded", () => {
    render(
      <WeekdayImpressionsChart data={DATA} rangeLabel="30 days" datedPosts={3} undatedPosts={1} />,
    );

    expect(
      screen.getByText(/1 post without a resolved date is not counted here/i),
    ).toBeInTheDocument();
  });

  it("says nothing about exclusions when every post had a resolved date", () => {
    render(
      <WeekdayImpressionsChart data={DATA} rangeLabel="30 days" datedPosts={3} undatedPosts={0} />,
    );

    expect(screen.queryByText(/not counted here/i)).not.toBeInTheDocument();
  });

  it("shows a calm empty state when no datable posts fell in the window", () => {
    const zeros = DATA.map((d) => ({ ...d, value: 0 }));
    render(
      <WeekdayImpressionsChart data={zeros} rangeLabel="30 days" datedPosts={0} undatedPosts={0} />,
    );

    expect(screen.getByText("No posts in this period.")).toBeInTheDocument();
  });

  it("distinguishes 'no datable posts' from 'no posts' when all posts were undated", () => {
    const zeros = DATA.map((d) => ({ ...d, value: 0 }));
    render(
      <WeekdayImpressionsChart data={zeros} rangeLabel="30 days" datedPosts={0} undatedPosts={4} />,
    );

    // There ARE posts in the window — they simply have no resolvable weekday.
    // Saying "No posts in this period" would be a lie the disclosure contradicts.
    expect(
      screen.getByText(/no posts with a resolved publish date in this period/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("No posts in this period.")).not.toBeInTheDocument();
    expect(
      screen.getByText(/4 posts without a resolved date are not counted here/i),
    ).toBeInTheDocument();
  });
});
