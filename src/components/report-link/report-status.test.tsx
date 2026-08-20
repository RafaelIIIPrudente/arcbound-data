import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { METRIC_DEFINITIONS, REPORT_STATUS_METRIC_KEYS } from "@/lib/metric-definitions";
import type { ClientReport, MonthPoint, PostingCadence } from "@/services/types";

import { ReportStatus, type ReportFreshness } from "./report-status";

// ─────────────────────────────────────────────────────────────────────────────
// A full ClientReport is large; this factory fills the fields ReportStatus reads
// with sensible values and lets a test override the few it cares about.
// ─────────────────────────────────────────────────────────────────────────────
function cadence(over: Partial<PostingCadence> = {}): PostingCadence {
  return {
    totalPosts: 6,
    datedPosts: 6,
    undatedPosts: 0,
    postsPerWeek: 1.5,
    medianGapDays: 4,
    longestGapDays: 9,
    daysSinceLastPost: 3,
    timeline: [
      Date.UTC(2026, 5, 1), // 1 Jun 2026 — earliest POST (must NOT be "tracked since")
      Date.UTC(2026, 6, 20), // 20 Jul 2026 — latest post
    ],
    weekly: [],
    monthly: [],
    weeklyPlacedPosts: 6,
    weeklyCoarsePosts: 0,
    dayPlacedPosts: 6,
    dayCoarsePosts: 0,
    lastPostDateIsExact: true,
    ...over,
  };
}

function series(...values: (number | null)[]): MonthPoint[] {
  return values.map((value, i) => ({ label: `M${i}`, value }));
}

// Freshness comes from UPLOAD dates, deliberately DIFFERENT from the cadence post
// dates above so a test can prove the strip reads uploads, not the post timeline.
function freshness(over: Partial<ReportFreshness> = {}): ReportFreshness {
  return {
    currentAsOf: "2026-07-25T00:00:00.000Z", // 25 Jul — latest upload
    trackedSince: "2026-05-01T00:00:00.000Z", // 1 May — earliest upload
    ...over,
  };
}

function makeReport(over: Partial<ClientReport> = {}): ClientReport {
  return {
    period: { kind: "all", key: "all", label: "All time" },
    availablePeriods: [{ kind: "all", key: "all", label: "All time" }],
    totalPostsAllTime: 6,
    keyPerformance: {
      selected: [],
      matrix: [],
      perThousandFollowers: { label: "x", value: null, approximate: true },
      connections: { label: "Connections", value: null },
    },
    interactionsComparison: [],
    impressionsSeries: series(100, 150, 220),
    impressionsBucket: "month",
    impressionsAverage: 157,
    impressionsByWeekday: [],
    weekdayPlacedPosts: 0,
    weekdayCoarsePosts: 0,
    weekdayUndatedPosts: 0,
    interactionsByAsset: [],
    postTypeDistribution: [],
    cadence: cadence(),
    composition: {
      totalPosts: 6,
      analysedPosts: 6,
      unanalysablePosts: 0,
      hashtags: [],
      medianLength: 500,
      pastFold: 0,
      withQuestion: 0,
      withLink: 0,
      withMention: 0,
      withEmoji: 0,
    },
    impressionsPostCount: 6,
    assetPostCount: 6,
    ...over,
  };
}

const GRADE_WORDS = /\b(best|optimal|recommended?|top|score|grade)\b/i;

/**
 * ⚠️ DOM `textContent` GLUES ADJACENT ELEMENTS WITH NO SEPARATOR, so a word at
 * the end of one block abuts the next block's first word ("…scoreReporting…") and
 * a `\b`-anchored guard silently misses it. Join TEXT NODES with spaces so every
 * word keeps its boundaries and the guard actually catches a planted grade word.
 */
function spacedText(el: HTMLElement): string {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.textContent ?? "");
  return parts.join(" ");
}

describe("ReportStatus — freshness + non-graded activity", () => {
  it("renders the reporting period and a most-recent-post date", () => {
    render(<ReportStatus report={makeReport()} freshness={freshness()} />);
    expect(screen.getByText(/all time/i)).toBeInTheDocument();
    // The latest dated POST (20 Jul 2026) surfaces as activity.
    expect(screen.getByText(/20 Jul 2026/)).toBeInTheDocument();
    expect(screen.getByText(/3 days ago/)).toBeInTheDocument();
  });

  it("takes freshness (current as of / tracked since) from real UPLOAD dates, not post dates", () => {
    render(<ReportStatus report={makeReport()} freshness={freshness()} />);
    // ⚠️ THE DISCRIMINATOR: current-as-of = latest upload (25 Jul), tracked-since =
    // earliest upload (1 May) — NOT the cadence post dates. The earliest POST
    // (1 Jun) must never appear as "tracked since".
    expect(screen.getByText(/25 Jul 2026/)).toBeInTheDocument();
    expect(screen.getByText(/1 May 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/1 Jun 2026/)).toBeNull();
  });

  it("shows an em dash for freshness when there are no uploads (honest absence)", () => {
    render(
      <ReportStatus
        report={makeReport()}
        freshness={freshness({ currentAsOf: null, trackedSince: null })}
      />,
    );
    // Both freshness slots fall back to em dashes rather than faking a date.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("states the post count in the view, with the undated split disclosed", () => {
    render(
      <ReportStatus
        report={makeReport({ cadence: cadence({ totalPosts: 7, datedPosts: 6, undatedPosts: 1 }) })}
        freshness={freshness()}
      />,
    );
    expect(screen.getByText(/7/)).toBeInTheDocument();
    expect(screen.getByText(/1 without a date/i)).toBeInTheDocument();
  });

  it("describes the impressions trend as a plain DIRECTION, never a grade", () => {
    const { container } = render(
      <ReportStatus
        report={makeReport({ impressionsSeries: series(100, 150, 220) })}
        freshness={freshness()}
      />,
    );
    expect(screen.getByText(/trending up|rising|higher/i)).toBeInTheDocument();
    expect(spacedText(container)).not.toMatch(GRADE_WORDS);
  });

  it("contains NO grade / score / advice word in any state (grep guard)", () => {
    for (const report of [
      makeReport(),
      makeReport({ impressionsSeries: series(220, 150, 100) }), // down
      makeReport({ impressionsSeries: series(100) }), // too few to trend
      makeReport({
        cadence: cadence({
          totalPosts: 0,
          datedPosts: 0,
          undatedPosts: 0,
          timeline: [],
          daysSinceLastPost: null,
          postsPerWeek: null,
          medianGapDays: null,
          longestGapDays: null,
        }),
      }),
    ]) {
      const { container, unmount } = render(
        <ReportStatus report={report} freshness={freshness()} />,
      );
      expect(spacedText(container)).not.toMatch(GRADE_WORDS);
      unmount();
    }
  });

  it("renders honest empty states when nothing is dated yet (no crash, no fake zero)", () => {
    render(
      <ReportStatus
        report={makeReport({
          totalPostsAllTime: 0,
          cadence: cadence({
            totalPosts: 0,
            datedPosts: 0,
            undatedPosts: 0,
            timeline: [],
            daysSinceLastPost: null,
            postsPerWeek: null,
            medianGapDays: null,
            longestGapDays: null,
          }),
          impressionsSeries: [],
        })}
        freshness={freshness({ currentAsOf: null, trackedSince: null })}
      />,
    );
    expect(screen.getByText(/no dated posts|no posts/i)).toBeInTheDocument();
  });
});

describe("ReportStatus — the ⓘ a CLIENT can open", () => {
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

  it("defines every block except the one that would collide with the picker", () => {
    render(<ReportStatus report={makeReport()} freshness={freshness()} />);

    for (const name of [
      "Current as of",
      "Tracked since",
      "Most recent post",
      "Posts in this view",
      "Posting rhythm",
      "Impressions trend",
    ]) {
      expect(screen.getByRole("button", { name: `What is ${name}?` }), name).toBeInTheDocument();
    }
    // ⚠️ "Reporting period" gets NO ⓘ: its accessible name would collide with
    // the period picker's on the same screen, and the block only echoes that
    // picker's value anyway.
    expect(
      screen.queryByRole("button", { name: "What is Reporting period?" }),
    ).not.toBeInTheDocument();
  });

  it("says 'Current as of' is the last UPLOAD, not the last post", async () => {
    // ⚠️ THE MISREADING A CLIENT IS MOST LIKELY TO MAKE. A report can be current
    // while its newest post is weeks old; without this the two dates beside each
    // other look like a contradiction.
    const user = userEvent.setup();
    render(<ReportStatus report={makeReport()} freshness={freshness()} />);

    await user.click(screen.getByRole("button", { name: "What is Current as of?" }));

    expect(await screen.findByText(/NOT the date of the most recent post/)).toBeInTheDocument();
  });

  it("says the trend reads only the two endpoints, and is not a verdict", async () => {
    // ⚠️ "Trending up" is a two-point comparison with a 5% band — a client would
    // otherwise read it as a graded judgement on their performance.
    const user = userEvent.setup();
    render(<ReportStatus report={makeReport()} freshness={freshness()} />);

    await user.click(screen.getByRole("button", { name: "What is Impressions trend?" }));

    const d = METRIC_DEFINITIONS.statusImpressionsTrend.definition;
    expect(await screen.findByText(d)).toBeInTheDocument();
    expect(d).toMatch(/direction, not a verdict/);
    expect(d).toMatch(/5%/);
  });

  it("says the rhythm is measured while ACTIVE, not up to today", () => {
    const d = METRIC_DEFINITIONS.statusPostingRhythm.definition;

    expect(d).toMatch(/not measured up to today/);
    // The not-applicable branch: one dated post, or all on one day.
    expect(d).toMatch(/no span to divide by/);
  });

  it("maps only labels this component actually renders", () => {
    // Guard the map: an entry for a label that no longer exists is an ⓘ nobody
    // will ever see, and it would hide the fact that a block lost its definition.
    render(<ReportStatus report={makeReport()} freshness={freshness()} />);

    for (const label of Object.keys(REPORT_STATUS_METRIC_KEYS)) {
      expect(screen.getByRole("button", { name: `What is ${label}?` }), label).toBeInTheDocument();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ RECENCY IS THE ONE FIGURE HERE THAT INHERITS A SINGLE POST'S PRECISION.
//
// "Most recent post" prints an exact calendar date and, beside it, how many days
// ago that was. Both are day-level claims about ONE post. When that post's date
// came from a month-aged scrape it was snapped to the 1st of a month, so the day
// is an artifact — and this strip is on the tokenized report a client opens.
//
// ⚠️ WITHHOLDING THE DAY COUNT WHILE STILL PRINTING THE EXACT DATE WOULD BE NO
// FIX AT ALL: the reader still gets a precise day. They are one claim and they
// are treated as one.
// ─────────────────────────────────────────────────────────────────────────────
describe("ReportStatus — the most-recent-post date matches what is known", () => {
  it("⚠️ prints no exact day when the most recent post is not dated to the day", () => {
    render(
      <ReportStatus
        report={makeReport({
          cadence: cadence({ lastPostDateIsExact: false, daysSinceLastPost: null }),
        })}
        freshness={freshness()}
      />,
    );

    // 20 Jul 2026 is the latest timeline mark. Neither the day nor a day count
    // may appear — only the month, which is what a month-aged post really says.
    expect(screen.queryByText(/20 Jul 2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/days ago/)).not.toBeInTheDocument();
    expect(screen.getByText(/around Jul 2026/i)).toBeInTheDocument();
  });

  it("⚠️ POSITIVE CONTROL — prints the exact date and day count when it is known", () => {
    // Fails against a component that hedges unconditionally.
    render(<ReportStatus report={makeReport()} freshness={freshness()} />);
    expect(screen.getByText(/20 Jul 2026/)).toBeInTheDocument();
    expect(screen.getByText(/3 days ago/)).toBeInTheDocument();
    expect(screen.queryByText(/around/i)).not.toBeInTheDocument();
  });

  it("⚠️ KEEPS the posting rhythm in both cases — a rate is not a recency", () => {
    // The rate's numerator is a count and its denominator is one span; it does
    // not depend on any single post's precision. Withholding it alongside the
    // date would delete a figure the data supports.
    render(
      <ReportStatus
        report={makeReport({
          cadence: cadence({ lastPostDateIsExact: false, daysSinceLastPost: null }),
        })}
        freshness={freshness()}
      />,
    );
    expect(screen.getByText(/1.5/)).toBeInTheDocument();
    expect(screen.getByText(/posts per week/i)).toBeInTheDocument();
  });

  it("⚠️ speaks plainly — no age token, no internal vocabulary", () => {
    const { container } = render(
      <ReportStatus
        report={makeReport({
          cadence: cadence({ lastPostDateIsExact: false, daysSinceLastPost: null }),
        })}
        freshness={freshness()}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/precision|granularity|resolver|estimated_post_date|snap/i);
  });
});
