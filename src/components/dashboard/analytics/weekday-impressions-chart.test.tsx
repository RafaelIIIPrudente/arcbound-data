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
      <WeekdayImpressionsChart
        data={DATA}
        rangeLabel="30 days"
        placedPosts={3}
        coarsePosts={0}
        undatedPosts={0}
      />,
    );

    expect(screen.getByText("Average impressions by day of week posted")).toBeInTheDocument();

    // ⚠️ The data cannot support a causal "post on X" claim at book-level sample
    // sizes — the same discipline that forbids ranks in the comparison. No word
    // that turns a measurement into advice may appear anywhere in the card.
    expect(container.textContent).not.toMatch(/\b(best|optimal|recommended?|top)\b/i);
  });

  it("states the window and the number of posts it averaged", () => {
    render(
      <WeekdayImpressionsChart
        data={DATA}
        rangeLabel="30 days"
        placedPosts={3}
        coarsePosts={0}
        undatedPosts={0}
      />,
    );

    expect(screen.getByText("30 days")).toBeInTheDocument();
    expect(screen.getByText(/3 posts/)).toBeInTheDocument();
  });

  it("discloses posts excluded for having no date at all, pluralised", () => {
    render(
      <WeekdayImpressionsChart
        data={DATA}
        rangeLabel="30 days"
        placedPosts={3}
        coarsePosts={0}
        undatedPosts={2}
      />,
    );

    // The exclusion is stated, not hidden — a reader must know the chart rests on
    // fewer posts than the window holds, and WHY.
    expect(screen.getByText(/2 posts have no publish date at all/i)).toBeInTheDocument();
    expect(screen.getByText(/built from the 3 posts/i)).toBeInTheDocument();
  });

  it("uses the singular when exactly one post was excluded", () => {
    render(
      <WeekdayImpressionsChart
        data={DATA}
        rangeLabel="30 days"
        placedPosts={3}
        coarsePosts={0}
        undatedPosts={1}
      />,
    );

    expect(screen.getByText(/1 post has no publish date at all/i)).toBeInTheDocument();
  });

  it("says nothing about exclusions when every post was placed", () => {
    render(
      <WeekdayImpressionsChart
        data={DATA}
        rangeLabel="30 days"
        placedPosts={3}
        coarsePosts={0}
        undatedPosts={0}
      />,
    );

    expect(screen.queryByText(/built from/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no publish date/i)).not.toBeInTheDocument();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ⚠️ THE THIRD STATE. A post dated only to the week or month HAS a date; it
  // simply cannot say which weekday it went out on. Describing it as undated
  // would send the reader hunting an ingestion fault that is not there.
  // ───────────────────────────────────────────────────────────────────────────

  it("⚠️ discloses coarse posts as DATED-BUT-BLUNT, never as missing a date", () => {
    render(
      <WeekdayImpressionsChart
        data={DATA}
        rangeLabel="30 days"
        placedPosts={3}
        coarsePosts={5}
        undatedPosts={0}
      />,
    );

    expect(screen.getByText(/5 posts are dated only to the week or month/i)).toBeInTheDocument();
    // ⚠️ ASSERT THE WORDS. The failure this guards against is a coarse post being
    // announced with the undated sentence, which reads plausibly and is false.
    expect(screen.queryByText(/no publish date at all/i)).not.toBeInTheDocument();
  });

  it("⚠️ keeps the two exclusions in separate sentences when both occur", () => {
    render(
      <WeekdayImpressionsChart
        data={DATA}
        rangeLabel="30 days"
        placedPosts={3}
        coarsePosts={5}
        undatedPosts={2}
      />,
    );

    const note = screen.getByRole("note");
    expect(note.textContent).toMatch(/built from the 3 posts whose exact publish day is known/i);
    expect(note.textContent).toMatch(/5 posts are dated only to the week or month/i);
    expect(note.textContent).toMatch(/2 posts have no publish date at all/i);
    // ⚠️ AND THE COUNTS ARE NEVER SUMMED. "7 posts excluded" would be true and
    // would collapse two facts a reader needs apart.
    expect(note.textContent).not.toMatch(/\b7\b/);
  });

  it("uses the singular for a single coarse post", () => {
    render(
      <WeekdayImpressionsChart
        data={DATA}
        rangeLabel="30 days"
        placedPosts={3}
        coarsePosts={1}
        undatedPosts={0}
      />,
    );

    expect(screen.getByText(/1 post is dated only to the week or month/i)).toBeInTheDocument();
  });

  it('⚠️ prints no age token — a reader never sees "4m" or "1w"', () => {
    const { container } = render(
      <WeekdayImpressionsChart
        data={DATA}
        rangeLabel="30 days"
        placedPosts={3}
        coarsePosts={5}
        undatedPosts={2}
      />,
    );

    // The scrape's own vocabulary is an implementation detail of the pipeline.
    expect(container.textContent).not.toMatch(/\b\d+(m|w|d|y|h|mo)\b/);
    expect(container.textContent).not.toMatch(/precision|granularity|estimated_post_date/i);
  });

  it("shows a calm empty state when no datable posts fell in the window", () => {
    const zeros = DATA.map((d) => ({ ...d, value: 0 }));
    render(
      <WeekdayImpressionsChart
        data={zeros}
        rangeLabel="30 days"
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
      <WeekdayImpressionsChart
        data={zeros}
        rangeLabel="30 days"
        placedPosts={0}
        coarsePosts={0}
        undatedPosts={4}
      />,
    );

    // There ARE posts in the window — they simply have no resolvable weekday.
    // Saying "No posts in this period" would be a lie the disclosure contradicts.
    expect(
      screen.getByText(/no posts with a known publish day in this period/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("No posts in this period.")).not.toBeInTheDocument();
    expect(screen.getByText(/4 posts have no publish date at all/i)).toBeInTheDocument();
  });

  it("⚠️ says the same when every post is merely too coarse — not 'no posts'", () => {
    // The window is full of real, DATED posts. Only their precision keeps them
    // off this chart, and the empty state must not report them as absent.
    const zeros = DATA.map((d) => ({ ...d, value: 0 }));
    render(
      <WeekdayImpressionsChart
        data={zeros}
        rangeLabel="30 days"
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
