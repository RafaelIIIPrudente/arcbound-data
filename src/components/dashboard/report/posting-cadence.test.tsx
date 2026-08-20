import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

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
  // Six weekly buckets, two monthly — enough to prove the bar count follows the
  // data. Counts sum to the twelve dated posts.
  weekly: [
    { label: "25 May", count: 1 },
    { label: "1 Jun", count: 3 },
    { label: "8 Jun", count: 4 },
    { label: "15 Jun", count: 2 },
    { label: "22 Jun", count: 1 },
    { label: "29 Jun", count: 1 },
  ],
  monthly: [
    { label: "May 26", count: 1 },
    { label: "Jun 26", count: 11 },
  ],
  // Every post here is precise enough for a weekly bar, so the two bases coincide.
  weeklyPlacedPosts: 12,
  weeklyCoarsePosts: 0,
  // …and precise enough for the day-level figures too, so the gaps are real.
  dayPlacedPosts: 12,
  dayCoarsePosts: 0,
  lastPostDateIsExact: true,
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

  it("explains what a timeline mark means, so the strip is not a mystery", () => {
    // Without this caption the axis of ticks reads as a broken chart — the whole
    // reason the section was hard to understand.
    render(<PostingCadenceSection cadence={FULL} />);
    expect(screen.getByText(/each mark is one post/i)).toBeInTheDocument();
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
      weekly: [],
      monthly: [],
      weeklyPlacedPosts: 0,
      weeklyCoarsePosts: 0,
      dayPlacedPosts: 0,
      dayCoarsePosts: 0,
      lastPostDateIsExact: false,
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
      weekly: [],
      monthly: [],
      weeklyPlacedPosts: 0,
      weeklyCoarsePosts: 0,
      dayPlacedPosts: 0,
      dayCoarsePosts: 0,
      lastPostDateIsExact: false,
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
      weekly: [{ label: "29 Dec", count: 1 }],
      monthly: [{ label: "Jan 26", count: 1 }],
      weeklyPlacedPosts: 1,
      weeklyCoarsePosts: 0,
      dayPlacedPosts: 1,
      dayCoarsePosts: 0,
      lastPostDateIsExact: true,
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

describe("PostingCadence — the switchable chart (Marks / Week / Month)", () => {
  it("offers all three views and starts on Marks", () => {
    render(<PostingCadenceSection cadence={FULL} />);

    expect(screen.getByRole("button", { name: "Marks" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Week" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Month" })).toBeInTheDocument();
    // Marks is showing to begin with.
    expect(screen.getByRole("list", { name: /posting timeline/i })).toBeInTheDocument();
  });

  it("switches to weekly bars — one bar per week bucket", () => {
    render(<PostingCadenceSection cadence={FULL} />);

    fireEvent.click(screen.getByRole("button", { name: "Week" }));

    const bars = screen.getByRole("list", { name: /posts per week/i });
    expect(within(bars).getAllByRole("listitem")).toHaveLength(FULL.weekly.length);
    // The marks axis is replaced, not stacked alongside.
    expect(screen.queryByRole("list", { name: /posting timeline/i })).not.toBeInTheDocument();
  });

  it("switches to monthly bars — one bar per month bucket", () => {
    render(<PostingCadenceSection cadence={FULL} />);

    fireEvent.click(screen.getByRole("button", { name: "Month" }));

    const bars = screen.getByRole("list", { name: /posts per month/i });
    expect(within(bars).getAllByRole("listitem")).toHaveLength(FULL.monthly.length);
  });

  it("renders a FIXED view with no toggle for print (staticView)", () => {
    // The printed report is a static document — a dead toggle would be worse than
    // no toggle, so print pins one view and drops the control.
    render(<PostingCadenceSection cadence={FULL} staticView="month" />);

    expect(screen.getByRole("list", { name: /posts per month/i })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /timeline view/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marks" })).not.toBeInTheDocument();
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

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE WEEK VIEW RESTS ON FEWER POSTS THAN THE MONTH VIEW, AND MUST SAY SO.
//
// A post dated only to the month was snapped to the 1st, so the calendar week it
// would land in is whichever week that 1st fell in — a bar the Client never
// earned. Those posts stay in the Month view (where the date IS precise enough)
// and in the marks, so the same panel legitimately shows two different totals
// behind a toggle. Unexplained, that reads as a bug; explained, it is the finding.
// ─────────────────────────────────────────────────────────────────────────────
describe("PostingCadence — the Week view discloses its narrower basis", () => {
  /** Twelve dated posts, only four of them precise enough for a weekly bar. */
  const COARSE: PostingCadence = {
    ...FULL,
    weeklyPlacedPosts: 4,
    weeklyCoarsePosts: 8,
    weekly: [
      { label: "1 Jun", count: 3 },
      { label: "8 Jun", count: 1 },
    ],
  };

  it("⚠️ says nothing about coarseness on the Marks view — it places every dated post", () => {
    render(<PostingCadenceSection cadence={COARSE} />);
    expect(screen.queryByText(/dated only to the month/i)).not.toBeInTheDocument();
  });

  it("⚠️ discloses the held-back posts once the reader switches to Week", () => {
    render(<PostingCadenceSection cadence={COARSE} />);
    fireEvent.click(screen.getByRole("button", { name: "Week" }));

    const note = screen.getByText(/dated only to the month/i);
    expect(note.textContent).toMatch(/8/);
    // ⚠️ AND IT SAYS WHERE THEY DID COUNT. Told only that 8 posts are missing, a
    // reader concludes the data is broken; told they are in the Month view, they
    // read the panel correctly.
    expect(note.textContent).toMatch(/month view/i);
  });

  it("⚠️ never calls a coarse post undated", () => {
    render(<PostingCadenceSection cadence={COARSE} />);
    fireEvent.click(screen.getByRole("button", { name: "Week" }));

    const note = screen.getByText(/dated only to the month/i);
    expect(note.textContent).not.toMatch(/no post date|no date/i);
  });

  it("says nothing on the Month view — every dated post is counted there", () => {
    render(<PostingCadenceSection cadence={COARSE} />);
    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    expect(screen.queryByText(/dated only to the month/i)).not.toBeInTheDocument();
  });

  it("stays quiet when nothing was held back", () => {
    render(<PostingCadenceSection cadence={FULL} />);
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    expect(screen.queryByText(/dated only to the month/i)).not.toBeInTheDocument();
  });

  it("⚠️ shows an honest empty Week view when NO post is week-precise", () => {
    // Distinct from "nothing is dated": the marks and the monthly bars still
    // draw. An empty bar strip with no words reads as a broken chart.
    const none: PostingCadence = {
      ...COARSE,
      weeklyPlacedPosts: 0,
      weeklyCoarsePosts: 12,
      weekly: [],
    };
    render(<PostingCadenceSection cadence={none} />);
    fireEvent.click(screen.getByRole("button", { name: "Week" }));

    expect(screen.queryByRole("list", { name: /posts per week/i })).not.toBeInTheDocument();
    expect(screen.getByText(/dated only to the month/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE CAPTIONS ARE THE CHART. Each one is a sentence a Client reads as fact,
// so a caption that has gone false is a false statement in a client document.
// ─────────────────────────────────────────────────────────────────────────────
describe("PostingCadence — captions claim only what the dates support", () => {
  it("⚠️ the Week caption no longer says an empty slot is a week with no posts", () => {
    render(<PostingCadenceSection cadence={FULL} />);
    fireEvent.click(screen.getByRole("button", { name: "Week" }));

    const body = document.body.textContent ?? "";
    // That sentence was true while every dated post was placed here. It is not
    // any more: a week whose only post is month-dated reads 0 with a real post in
    // it. Correcting the code and leaving the sentence is the worse half-fix.
    expect(body).not.toMatch(/an empty slot is a week with no posts/i);
  });

  it("⚠️ the Marks caption does not promise same-day accuracy it cannot keep", () => {
    render(<PostingCadenceSection cadence={FULL} />);

    const body = document.body.textContent ?? "";
    // Month-dated posts all land on the 1st, so "posts on the same day share a
    // mark" invites the reader to read a bunch as a burst of real activity.
    expect(body).not.toMatch(/posts on the same day share a mark/i);
    expect(body).toMatch(/estimated|only to the week or month/i);
  });

  it("keeps the Month caption, which is still exactly true", () => {
    render(<PostingCadenceSection cadence={FULL} />);
    fireEvent.click(screen.getByRole("button", { name: "Month" }));

    expect(screen.getByText(/an empty slot is a month with no posts/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE PANEL MUST NOT SHOW A DAY-LEVEL FIGURE IT CANNOT SUPPORT — and it must
// not show one silently either. A withheld figure with no reason reads as broken
// software; a withheld figure with a reason reads as an honest limit.
//
// The three figures do NOT move together, which is the whole point: a coarse
// HISTORY withholds the gaps and leaves recency alone; a coarse LAST POST
// withholds recency and leaves the gaps alone (when the rest is exact); and the
// rate survives both, because a rate does not depend on the time between posts.
// ─────────────────────────────────────────────────────────────────────────────
describe("PostingCadence — day-level figures are withheld with a spoken reason", () => {
  /** Twelve dated posts, none of them precise to the day. */
  const COARSE_HISTORY: PostingCadence = {
    ...FULL,
    dayPlacedPosts: 0,
    dayCoarsePosts: 12,
    lastPostDateIsExact: false,
    medianGapDays: null,
    longestGapDays: null,
    daysSinceLastPost: null,
  };

  it("⚠️ shows an em dash for both gap figures, never a zero", () => {
    render(<PostingCadenceSection cadence={COARSE_HISTORY} />);
    // Rate is still shown (1.5), so the em dashes are gaps + days-since only.
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("⚠️ gives the SPOKEN reason the real one — not 'needs at least two posts'", () => {
    // ⚠️ THE REASON IS READ ALOUD AND HAS GONE FALSE. Every em dash here carries
    // an sr-only "Not applicable: …". The existing text says a gap "needs at
    // least two dated posts" — true when the panel was written, and a lie against
    // a history of twelve. A screen-reader user would be told the client barely
    // posts, when the truth is that we cannot date the posts finely enough.
    render(<PostingCadenceSection cadence={COARSE_HISTORY} />);
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/needs at least two dated posts/i);
    expect(body).toMatch(/dated only to the week or month/i);
  });

  it("KEEPS the two-post reason where it is still true", () => {
    // The old wording is correct for a genuinely short history, and must survive.
    render(
      <PostingCadenceSection
        cadence={{
          ...FULL,
          totalPosts: 1,
          datedPosts: 1,
          dayPlacedPosts: 1,
          dayCoarsePosts: 0,
          medianGapDays: null,
          longestGapDays: null,
          postsPerWeek: null,
        }}
      />,
    );
    expect(document.body.textContent ?? "").toMatch(/at least two dated posts/i);
  });

  it("⚠️ says WHY the gaps are missing, in plain words, on screen", () => {
    render(<PostingCadenceSection cadence={COARSE_HISTORY} />);
    const note = screen.getByText(/gaps between posts aren’t shown/i);
    expect(note.textContent).toMatch(/12 posts are dated only to the week or month/i);
    // ⚠️ AND IT SAYS WHAT SURVIVES. A reader told only that figures are missing
    // concludes the data is broken; told which figures still hold and why, they
    // read the panel correctly.
    expect(note.textContent).toMatch(/posts per week/i);
  });

  it("⚠️ KEEPS the rate — a rate is not a gap", () => {
    render(<PostingCadenceSection cadence={COARSE_HISTORY} />);
    expect(screen.getByText("1.5")).toBeInTheDocument();
  });

  it("⚠️ names an omitted post as an OMISSION, not as coarseness", () => {
    render(
      <PostingCadenceSection
        cadence={{
          ...FULL,
          totalPosts: 13,
          undatedPosts: 1,
          medianGapDays: null,
          longestGapDays: null,
        }}
      />,
    );
    const note = screen.getByText(/gaps between posts aren’t shown/i);
    expect(note.textContent).toMatch(/1 post has no date at all/i);
    expect(note.textContent).not.toMatch(/dated only to the week or month/i);
  });

  it("⚠️ POSITIVE CONTROL — an all-day-precise history still shows real gaps", () => {
    // Fails against a component that withholds unconditionally.
    render(<PostingCadenceSection cadence={FULL} />);
    expect(screen.getByText("3")).toBeInTheDocument(); // median gap
    expect(screen.getByText("21")).toBeInTheDocument(); // longest gap
    expect(screen.queryByText(/gaps between posts aren’t shown/i)).not.toBeInTheDocument();
  });

  it("⚠️ withholds RECENCY on its own when only the LAST post is coarse", () => {
    // The gaps are fine here (every post day-precise except… none), but the most
    // recent post is not exactly dated, so the day count is unknowable. The two
    // figures move independently and this proves it.
    render(
      <PostingCadenceSection
        cadence={{ ...FULL, lastPostDateIsExact: false, daysSinceLastPost: null }}
      />,
    );
    expect(screen.getByText("3")).toBeInTheDocument(); // median gap survives
    expect(screen.getByText("21")).toBeInTheDocument(); // longest gap survives
    expect(screen.getAllByText("—")).toHaveLength(1); // days-since alone
  });

  it("⚠️ speaks plainly — no age token, no internal vocabulary", () => {
    const { container } = render(<PostingCadenceSection cadence={COARSE_HISTORY} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\b\d+(m|w|d|y|h|mo)\b/);
    expect(text).not.toMatch(/precision|granularity|resolver|estimated_post_date|snap/i);
  });
});
