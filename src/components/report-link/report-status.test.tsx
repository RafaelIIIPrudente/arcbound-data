import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

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
    },
    interactionsComparison: [],
    impressionsSeries: series(100, 150, 220),
    impressionsBucket: "month",
    impressionsAverage: 157,
    impressionsByWeekday: [],
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
