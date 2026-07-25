import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { PostingCadence } from "@/services/types";

import { PostingCadence as PostingCadenceSection } from "./posting-cadence";

const DAY = 86_400_000;
const JAN1 = Date.parse("2026-01-01");

/** A full, healthy cadence: twelve dated posts, no undated. */
const FULL: PostingCadence = {
  totalPosts: 12,
  datedPosts: 12,
  undatedPosts: 0,
  postsPerWeek: 1.5,
  medianGapDays: 3,
  longestGapDays: 21,
  daysSinceLastPost: 5,
  timeline: Array.from({ length: 12 }, (_, i) => JAN1 + i * 3 * DAY),
};

describe("PostingCadence — the healthy 2+ dated case", () => {
  it("renders all five figures with their values", () => {
    render(<PostingCadenceSection cadence={FULL} />);

    for (const label of [
      "Total posts",
      "Posts per week",
      "Median gap between posts",
      "Longest gap",
      "Days since last post",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    expect(screen.getByText("12")).toBeInTheDocument(); // total
    expect(screen.getByText("1.5")).toBeInTheDocument(); // posts/week
    expect(screen.getByText("3")).toBeInTheDocument(); // median gap
    expect(screen.getByText("21")).toBeInTheDocument(); // longest gap
    expect(screen.getByText("5")).toBeInTheDocument(); // days since last
    // The three day-figures each carry a "days" unit beside the number.
    expect(screen.getAllByText("days")).toHaveLength(3);
  });

  it("plots one timeline mark per dated post", () => {
    render(<PostingCadenceSection cadence={FULL} />);

    const timeline = screen.getByRole("list", { name: /posting timeline/i });
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(12);
  });

  it("discloses that posts/week is measured over the active span, not to today", () => {
    render(<PostingCadenceSection cadence={FULL} />);
    expect(screen.getByText(/active span/i)).toBeInTheDocument();
  });

  it("shows no undated-posts disclosure when every post is dated", () => {
    render(<PostingCadenceSection cadence={FULL} />);
    expect(screen.queryByText(/no post date/i)).not.toBeInTheDocument();
  });

  it("SCORES nothing — no index, percentile or regularity label anywhere", () => {
    const { container } = render(<PostingCadenceSection cadence={FULL} />);
    // The gaps are the finding; the section must never grade them.
    expect(container.textContent).not.toMatch(/consisten|regularity|percentile|score|\/\s*100/i);
  });
});

describe("PostingCadence — print-safety by construction", () => {
  it("keeps the whole section together across a page break", () => {
    const { container } = render(<PostingCadenceSection cadence={FULL} />);
    // `print-block` → break-inside: avoid, so the exported timeline is never
    // split across the fold. Asserted on the markup, not by rendering a PDF.
    expect((container.firstChild as HTMLElement).className).toContain("print-block");
  });

  it("positions every mark by PERCENTAGE, so it needs no measurement to print", () => {
    render(<PostingCadenceSection cadence={FULL} />);
    const marks = within(screen.getByRole("list", { name: /posting timeline/i })).getAllByRole(
      "listitem",
    );
    // A percentage resolves against the fixed print column with no ResizeObserver
    // and no layout race — the failure mode that breaks recharts at print time.
    for (const mark of marks) {
      expect(mark.style.left).toMatch(/%$/);
    }
  });
});

describe("PostingCadence — the low-N four states", () => {
  it("renders nothing at all for a client with zero posts", () => {
    const zero: PostingCadence = {
      totalPosts: 0,
      datedPosts: 0,
      undatedPosts: 0,
      postsPerWeek: null,
      medianGapDays: null,
      longestGapDays: null,
      daysSinceLastPost: null,
      timeline: [],
    };
    const { container } = render(<PostingCadenceSection cadence={zero} />);
    expect(container.firstChild).toBeNull();
  });

  it("0 dated: not-applicable figures and the disclosure line, no timeline", () => {
    const allUndated: PostingCadence = {
      totalPosts: 24,
      datedPosts: 0,
      undatedPosts: 24,
      postsPerWeek: null,
      medianGapDays: null,
      longestGapDays: null,
      daysSinceLastPost: null,
      timeline: [],
    };
    render(<PostingCadenceSection cadence={allUndated} />);

    // Total posts is a real figure; the other four cannot be measured.
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(4);
    // No rate, no gap computed from nothing.
    expect(screen.queryByText(/active span/i)).not.toBeInTheDocument();
    // No timeline is rendered when nothing is dated.
    expect(screen.queryByRole("list", { name: /posting timeline/i })).not.toBeInTheDocument();
    // The disclosure is present, in plain staff language.
    expect(screen.getByText(/no post date/i)).toBeInTheDocument();
  });

  it("1 dated: a single mark, em-dash gaps and rate, but days-since-last shown", () => {
    const one: PostingCadence = {
      totalPosts: 4,
      datedPosts: 1,
      undatedPosts: 3,
      postsPerWeek: null,
      medianGapDays: null,
      longestGapDays: null,
      daysSinceLastPost: 20,
      timeline: [JAN1],
    };
    render(<PostingCadenceSection cadence={one} />);

    // ⚠️ Rate + both gaps are not-applicable — never a fabricated zero.
    expect(screen.getAllByText("—")).toHaveLength(3);
    // days-since-last is defined for one post.
    expect(screen.getByText("20")).toBeInTheDocument();
    // The single mark still appears.
    const timeline = screen.getByRole("list", { name: /posting timeline/i });
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(1);
  });
});

describe("PostingCadence — the undated disclosure", () => {
  it("names counts in plain language and never a raw column", () => {
    const someUndated: PostingCadence = {
      ...FULL,
      totalPosts: 15,
      datedPosts: 12,
      undatedPosts: 3,
    };
    render(<PostingCadenceSection cadence={someUndated} />);

    const disclosure = screen.getByText(/no post date/i);
    expect(disclosure.textContent).toMatch(/3/);
    expect(disclosure.textContent).toMatch(/15/);
    // Staff language only — the storage column name must never surface.
    expect(disclosure.textContent).not.toMatch(/estimated_post_date/);
  });
});
