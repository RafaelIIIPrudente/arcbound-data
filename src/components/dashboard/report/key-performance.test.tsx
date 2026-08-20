import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MetricInfo } from "@/components/dashboard/metric-info";
import { METRIC_DEFINITIONS, REPORT_METRIC_KEYS, metricDefinition } from "@/lib/metric-definitions";
import type { PostMetricsRow } from "@/services/analytics";
import { buildClientReport } from "@/services/client-report";
import type { ClientReport } from "@/services/types";

import { KeyPerformance } from "./key-performance";

const NOW = new Date("2026-07-16T12:00:00.000Z");

/**
 * The ⓘ exactly as the staff report supplies it — the REAL `MetricInfo`, not a
 * stub, so every assertion below still exercises the real popover.
 *
 * ⚠️ THIS MIRRORS `reportMetricInfo` IN `app/(app)/clients/[id]/report/page.tsx`,
 * which cannot be imported: Next rejects arbitrary named exports from a
 * `page.tsx`. A mirror can drift from the original, so this file does NOT prove
 * the staff page is wired up — `report/page.test.tsx` does, by rendering what the
 * page actually passes. Neither test covers this on its own.
 */
const renderInfo = (label: string) => {
  const key = REPORT_METRIC_KEYS[label];
  return key ? <MetricInfo metric={key} /> : null;
};

/** A minimal BI row for the coverage test, which drives the REAL service. */
function metricsRow(over: Partial<PostMetricsRow> & { linkedin_post_id: string }): PostMetricsRow {
  return {
    client_id: "c1",
    client_name: "Bryan Wish",
    post_url: null,
    post_content: null,
    post_age: null,
    estimated_post_date: "2026-07-10",
    impressions: 1000,
    likes: 10,
    comments: 2,
    reposts: 1,
    saves: 3,
    interactions: 16,
    provided_engagement_rate: null,
    calculated_engagement_rate: null,
    scraped_at: "2026-07-16T06:00:00.000Z",
    uploaded_at: null,
    ...over,
  };
}

const GRID: ClientReport["keyPerformance"] = {
  selected: [
    { label: "Total posts", value: 12 },
    { label: "Avg interactions", value: 56 },
    { label: "Total interactions", value: 1234 },
    // Deliberately an order of magnitude wider than its three neighbours —
    // impressions is the figure that makes the 4-up layout a real question.
    { label: "Total impressions", value: 284391 },
  ],
  matrix: [
    {
      label: "Monthly avg",
      posts: { label: "Avg monthly posts", value: 4.5 },
      perPost: { label: "Avg interactions per post", value: 40 },
      interactions: { label: "Avg monthly interactions", value: 180 },
    },
    {
      label: "Monthly max",
      posts: { label: "Max monthly posts", value: 9 },
      perPost: null,
      interactions: { label: "Max monthly interactions", value: 400 },
    },
  ],
  perThousandFollowers: {
    label: "Avg interactions per 1K followers",
    value: 1.3,
    approximate: true,
  },
  connections: {
    label: "Connections",
    value: 4820,
  },
};

/** The same grid with no follower count on record. */
const NO_FOLLOWERS: ClientReport["keyPerformance"] = {
  ...GRID,
  perThousandFollowers: { ...GRID.perThousandFollowers, value: null },
  connections: { ...GRID.connections, value: null },
};

describe("KeyPerformance", () => {
  it("leads with the four selected-period figures", () => {
    render(<KeyPerformance keyPerformance={GRID} hasPosts />);

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("56")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    // Printed in full. `format()` is exact everywhere on this document, and a
    // compacted "284.4K" would be a precision claim the report cannot support.
    expect(screen.getByText("284,391")).toBeInTheDocument();
    expect(screen.getByText("Total posts")).toBeInTheDocument();
    expect(screen.getByText("Avg interactions")).toBeInTheDocument();
    expect(screen.getByText("Total interactions")).toBeInTheDocument();
    expect(screen.getByText("Total impressions")).toBeInTheDocument();
  });

  it("seats four hero figures without a three-column track", () => {
    // ⚠️ WHAT THIS PROVES, AND WHAT IT CANNOT. jsdom computes no layout, so it
    // can see neither an overflow nor a second-row orphan — it pins the
    // STRUCTURE that makes both safe. Four figures in a three-column track
    // strand one alone on a second row, on screen AND on page 1 of the client's
    // PDF. Two columns seat them 2×2 at every width, which is the choice the
    // fixed 700px print column forces: four across would leave ~163px a figure
    // against 48px type (D5). The printed sheet still wants one human look.
    render(<KeyPerformance keyPerformance={GRID} hasPosts />);

    const hero = screen.getByText("Total impressions").closest("div.grid");
    expect(hero).not.toBeNull();
    expect(hero!.className).toMatch(/\bgrid-cols-2\b/);
    expect(hero!.className).not.toMatch(/\bgrid-cols-3\b/);
    // ⚠️ 4-UP IS GATED ON THE CONTAINER, NOT THE VIEWPORT, AND THAT IS THE WHOLE
    // POINT. A viewport gate was tried and measured wrong: `xl:` fires at a
    // 1280px VIEWPORT, but the staff report spends 300px of that on the sidebar
    // and page padding, leaving a 233px cell against 239.2px of text — six pixels
    // past the margin line every other figure aligns to, in the 1280–1304 band.
    // `@6xl` (a 1152px CONTAINER) measures the thing that actually constrains the
    // figure, so the sidebar is accounted for automatically and `/r/[token]`,
    // which has no sidebar, goes 4-up at a narrower window than the staff page.
    // Paper is a 700px container, so it never fires there.
    //
    // jsdom evaluates no container query, so what is pinned here is only that the
    // class is DECLARED, that its container exists, and which breakpoint carries
    // it — never that the four fit. That was measured in a browser instead.
    expect(hero!.className).toMatch(/\B@6xl:grid-cols-4\b/);
    expect(hero!.className).not.toMatch(/\b(sm|md|lg|xl|2xl):grid-cols-4\b/);
    // A `@`-variant without a `@container` ancestor silently never matches.
    expect(hero!.parentElement!.className).toMatch(/\B@container\b/);
    // ...and it really is the hero grid holding all four, not some ancestor.
    expect(within(hero as HTMLElement).getAllByText(/^[\d,]+$/)).toHaveLength(4);
  });

  it("accents the hero with the brand colour and leaves the matrix neutral", () => {
    render(<KeyPerformance keyPerformance={GRID} hasPosts />);

    // The accent is emphasis, not a category label. The source Power BI page
    // gave each time window its own hue; spreading colour that way makes every
    // figure "marked" and flattens the hierarchy back to where it started.
    // Matched loosely so the opacity dial (`text-primary/75`) can be tuned
    // without breaking the test: what is pinned is WHERE the accent is, not how
    // strong it is.
    const accent = /\btext-primary\b/;

    for (const hero of ["12", "56", "1,234", "284,391"]) {
      expect(screen.getByText(hero).className).toMatch(accent);
    }
    for (const cell of ["4.5", "40", "180", "9", "400"]) {
      expect(screen.getByText(cell).className).not.toMatch(accent);
    }
    expect(screen.getByText("1.3").className).not.toMatch(accent);
  });

  it("does not repeat the period, which the caption and picker already name", () => {
    render(<KeyPerformance keyPerformance={GRID} hasPosts />);

    // The old layout captioned the hero row with the period label as well,
    // stating it three times inside the top 80px.
    expect(screen.queryByText("July 2026")).not.toBeInTheDocument();
  });

  it("labels the matrix with both its column and its row headers", () => {
    render(<KeyPerformance keyPerformance={GRID} hasPosts />);

    // Column headers appear once in the header row and again inside each cell
    // for the stacked (<sm) layout, so assert presence rather than uniqueness.
    for (const column of ["Posts", "Per post", "Interactions"]) {
      expect(screen.getAllByText(column).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("Monthly avg")).toBeInTheDocument();
    expect(screen.getByText("Monthly max")).toBeInTheDocument();
  });

  it("renders the matrix figures at their given values", () => {
    render(<KeyPerformance keyPerformance={GRID} hasPosts />);

    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("180")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("400")).toBeInTheDocument();
  });

  it("renders the absent maximum per-post cell as an em dash, never 0 or NaN", () => {
    const { container } = render(<KeyPerformance keyPerformance={GRID} hasPosts />);

    // Scoped to the "Monthly max" row: an em dash also means "no value"
    // elsewhere, so a document-wide search would not prove this cell.
    const maxRow = screen.getByText("Monthly max").parentElement!;
    expect(within(maxRow).getByText("—")).toBeInTheDocument();

    expect(container.textContent).not.toMatch(/NaN/);
  });

  it("gives the per-1K-followers average its own line, marked approximate", () => {
    render(<KeyPerformance keyPerformance={GRID} hasPosts />);

    const label = screen.getByText(/Avg interactions per 1K followers/);
    // It is an AVERAGE, so it must sit outside the maxima row it used to hide in.
    expect(
      within(screen.getByText("Monthly max").parentElement!).queryByText(/1K followers/),
    ).toBeNull();
    expect(label).toBeInTheDocument();
    expect(screen.getByText("1.3")).toBeInTheDocument();
    // Scoped to THIS line: the connection ratio beside it is also approximate,
    // so a document-wide search would match either and prove neither.
    expect(within(label.parentElement!).getByText("(approx.)")).toBeInTheDocument();
  });

  it("shows an em dash for the follower ratio when no upload carries a count", () => {
    render(<KeyPerformance keyPerformance={NO_FOLLOWERS} hasPosts />);

    // Three em dashes: the absent maxima cell, this follower ratio, and the
    // connection ratio (NO_FOLLOWERS carries no connection count either). All
    // three are legitimate absences.
    expect(screen.getAllByText("—")).toHaveLength(3);
    const line = screen.getByText(/Avg interactions per 1K followers/).parentElement!;
    expect(within(line).getByText("(approx.)")).toBeInTheDocument();
  });

  it("renders a calm empty state for a client with no posts", () => {
    render(<KeyPerformance keyPerformance={GRID} hasPosts={false} />);

    expect(screen.getByText("No posts in this period")).toBeInTheDocument();
    expect(screen.queryByText("Total posts")).not.toBeInTheDocument();
    expect(screen.queryByText("Monthly avg")).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ TWO DIFFERENT KINDS OF FIGURE SHARE THIS FOOTER, AND THE PAGE MUST NOT BLUR
// THEM. The follower line is an ALL-TIME AVERAGE and is approximate; the
// connection line is a POINT-IN-TIME COUNT and is exact. Rendering the count
// through the average's chrome — "· all time", "(approx.)" — would state two
// things about it that are both false, on a document that gets printed and handed
// to a client.
// ─────────────────────────────────────────────────────────────────────────────
describe("KeyPerformance — the raw connection count", () => {
  /** The footer row that carries `label`, so a claim can be scoped to one line. */
  function lineFor(label: RegExp) {
    return screen.getByText(label).closest("div")!.parentElement!;
  }

  it("shows the connection count beside the follower average", () => {
    render(<KeyPerformance keyPerformance={GRID} hasPosts />);

    expect(screen.getByText(/avg interactions per 1k followers/i)).toBeInTheDocument();
    expect(screen.getByText(/^connections/i)).toBeInTheDocument();
    expect(screen.getByText("4,820")).toBeInTheDocument();
  });

  it("mentions connections EXACTLY ONCE — the raw line, with no rate wording", () => {
    // ⚠️ A COUNT, NOT A BLACKLIST OF PHRASES. Any reinstated "per 1K connections"
    // line (or any other connection-derived figure) makes this two, whatever it
    // gets called. The FOLLOWER rate survives untouched — the asymmetry is
    // deliberate — so its own wording is asserted positively.
    const { container } = render(<KeyPerformance keyPerformance={GRID} hasPosts />);

    expect(container.textContent!.match(/connections/gi)).toHaveLength(1);
    expect(container.textContent).toMatch(/per 1K followers/i);
  });

  it("does NOT label the count 'all time' — it describes one moment, not the window", () => {
    // ⚠️ A COUNT UNDER AN ALL-TIME QUALIFIER READS AS A TOTAL ACCUMULATED OVER THE
    // REPORT. It is neither: it is whatever one upload recorded.
    render(<KeyPerformance keyPerformance={GRID} hasPosts />);

    expect(lineFor(/^connections/i)).not.toHaveTextContent(/all time/i);
    // The follower AVERAGE keeps its window — that one really is all-time.
    expect(lineFor(/avg interactions per 1k followers/i)).toHaveTextContent(/all time/i);
  });

  it("does NOT mark the count approximate — a captured count is exact", () => {
    render(<KeyPerformance keyPerformance={GRID} hasPosts />);

    expect(lineFor(/^connections/i)).not.toHaveTextContent(/approx/i);
    // Exactly one approximation mark remains, on the follower average.
    expect(screen.getAllByText(/approx\./i)).toHaveLength(1);
    expect(lineFor(/avg interactions per 1k followers/i)).toHaveTextContent(/approx/i);
  });

  it("STILL RENDERS THE LINE when the count is unknown, as a labelled em dash", () => {
    // ⚠️ THE GUARANTEE THIS SECTION EXISTS FOR. Hiding the line would leave a
    // reader unable to tell "we do not measure this" from "this report happens
    // not to show it". The label stays; only the value becomes a dash.
    render(
      <KeyPerformance
        keyPerformance={{ ...GRID, connections: { ...GRID.connections, value: null } }}
        hasPosts
      />,
    );

    const line = lineFor(/^connections/i);
    expect(line).toBeInTheDocument();
    expect(within(line).getByText("—")).toBeInTheDocument();
    expect(within(line).queryByText("0")).not.toBeInTheDocument();
    // The follower average beside it is untouched and still prints its figure.
    expect(screen.getByText("1.3")).toBeInTheDocument();
  });
});

describe("KeyPerformance — the ⓘ, and the two surfaces that must not have one", () => {
  // Radix's Popover needs the Pointer Events jsdom does not implement.
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

  it("renders NO ⓘ by default — print and /r/[token] must be unchanged", () => {
    // ⚠️ THE ACCEPTANCE CASE FOR THE WHOLE OPT-IN. This component is rendered by
    // three surfaces: the staff page, `print-report.tsx`, and
    // `report-link/public-report.tsx` — the report a CLIENT holds. A popover is
    // meaningless on paper and is a change to the public boundary, so a caller
    // that says nothing gets the narrower surface, exactly as `allowCustom`
    // works on DateRangePicker.
    render(<KeyPerformance keyPerformance={GRID} hasPosts />);

    expect(screen.queryByRole("button", { name: /^What is / })).not.toBeInTheDocument();
  });

  it("defines every hero figure, both matrix rows and both footer lines when asked", () => {
    render(<KeyPerformance keyPerformance={GRID} hasPosts renderInfo={renderInfo} />);

    for (const name of [
      "Total posts",
      "Avg interactions",
      "Total interactions",
      "Total impressions",
      "Monthly avg",
      "Monthly max",
      "Avg interactions per 1K followers",
      "Connections",
    ]) {
      expect(screen.getByRole("button", { name: `What is ${name}?` }), name).toBeInTheDocument();
    }
  });

  it("says the hero is the SELECTED period and the rows below are all-time", async () => {
    // ⚠️ THE MISREADING THIS SECTION INVITES. "26 total posts" sitting above
    // "Monthly max 26" reads as one claim stated twice; they are a period figure
    // and an all-time figure that happen to coincide. Both sentences say so.
    const user = userEvent.setup();
    render(<KeyPerformance keyPerformance={GRID} hasPosts renderInfo={renderInfo} />);

    await user.click(screen.getByRole("button", { name: "What is Total posts?" }));
    expect(await screen.findByText(/SELECTED period/)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "What is Monthly avg?" }));
    // ⚠️ Wording updated 2026-08-13 when these sentences were made voice-neutral
    // for the Client's own report ("the client's ENTIRE history" → "the ENTIRE
    // posting history"). The claim under test is unchanged: this row is all-time
    // and the hero above it is the selected period.
    expect(
      await screen.findByText(/ENTIRE posting history, not the selected period/),
    ).toBeInTheDocument();
  });

  it("says the per-month rates count only posts that carry a date", () => {
    // ⚠️ PINS THE DEFINITION TO THE FIX. The two per-month rates exclude undated
    // (hour-age) posts, because a post with no date belongs to no month — and
    // the sentence has to say where those posts DID go, or a reader reconciling
    // "Total posts" against "posts per month" finds a gap with no explanation.
    const d = METRIC_DEFINITIONS.reportMonthlyAvg.definition;

    expect(d).toMatch(/only posts carrying a publish date/i);
    expect(d).toMatch(/still in the totals above/i);
  });

  it("explains the maxima row's em dash, which is where a reader stops", async () => {
    const user = userEvent.setup();
    render(<KeyPerformance keyPerformance={GRID} hasPosts renderInfo={renderInfo} />);

    await user.click(screen.getByRole("button", { name: "What is Monthly max?" }));

    const text = await screen.findByText(METRIC_DEFINITIONS.reportMonthlyMax.definition);
    expect(text).toBeInTheDocument();
    // The two maxima are found independently — they need not be one month.
    expect(METRIC_DEFINITIONS.reportMonthlyMax.definition).toMatch(/need not be the same month/i);
    expect(METRIC_DEFINITIONS.reportMonthlyMax.definition).toMatch(/a maximum has no rate/i);
  });

  it("says why the per-1K figure is marked approximate", async () => {
    const user = userEvent.setup();
    render(<KeyPerformance keyPerformance={GRID} hasPosts renderInfo={renderInfo} />);

    await user.click(
      screen.getByRole("button", { name: "What is Avg interactions per 1K followers?" }),
    );

    expect(
      await screen.findByText(METRIC_DEFINITIONS.reportPerThousandFollowers.definition),
    ).toBeInTheDocument();
    expect(METRIC_DEFINITIONS.reportPerThousandFollowers.definition).toMatch(
      /not measured over the same span/i,
    );
  });

  it("keeps the ⓘ on the footer lines when their value is an em dash", () => {
    // Those are the two lines a reader most wants explained: the definition is
    // what separates "we don't measure this" from "this happens to be blank".
    render(<KeyPerformance keyPerformance={NO_FOLLOWERS} hasPosts renderInfo={renderInfo} />);

    expect(
      screen.getByRole("button", { name: "What is Avg interactions per 1K followers?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What is Connections?" })).toBeInTheDocument();
  });

  it("renders no ⓘ at all in the empty state", () => {
    render(<KeyPerformance keyPerformance={GRID} hasPosts={false} renderInfo={renderInfo} />);

    expect(screen.queryByRole("button", { name: /^What is / })).not.toBeInTheDocument();
  });

  it("keeps the ⓘ's own count of the hero figures true to what the service emits", () => {
    // ⚠️ A NUMBER SPELLED OUT IN A SENTENCE A CLIENT READS. "The four large
    // figures are all scoped to that period" is a claim about this array's
    // LENGTH, made inside a definition — and nothing else in the suite would
    // notice it going stale. It went stale once already: the sentence said
    // "three" on the day a fourth figure landed. Driven from the real service so
    // a fifth figure fails here rather than shipping a false count.
    const report = buildClientReport([metricsRow({ linkedin_post_id: "p1" })], {
      period: { kind: "all", key: "all", label: "All time" },
      now: NOW,
      followers: 1000,
      connections: 50,
      availablePeriods: [],
    });
    const words = ["no", "one", "two", "three", "four", "five", "six"];
    const spelled = words[report.keyPerformance.selected.length];

    expect(spelled, "hero grew past this test's number words").toBeDefined();
    expect(METRIC_DEFINITIONS.reportTotalPosts.definition).toContain(
      `The ${spelled} large figures are all scoped to that period`,
    );
  });

  it("covers every label the REAL service emits — a new figure cannot slip in undefined", () => {
    // ⚠️ DRIVEN FROM `buildClientReport`, NOT FROM THE FIXTURE ABOVE. The map is
    // keyed by label, so a label the service renames or adds would silently lose
    // its ⓘ. This is what fails instead.
    const report = buildClientReport(
      [
        metricsRow({ linkedin_post_id: "p1", estimated_post_date: "2026-07-10", interactions: 40 }),
        metricsRow({ linkedin_post_id: "p2", estimated_post_date: "2026-06-10", interactions: 20 }),
      ],
      {
        period: { kind: "all", key: "all", label: "All time" },
        now: NOW,
        followers: 1000,
        connections: 50,
        availablePeriods: [],
      },
    );
    const kp = report.keyPerformance;
    const labels = [
      ...kp.selected.map((f) => f.label),
      ...kp.matrix.map((r) => r.label),
      kp.perThousandFollowers.label,
      kp.connections.label,
    ];

    // ⚠️ RAISED 7 → 8 WITH THE FOURTH HERO FIGURE. The floor exists so the guard
    // cannot go slack the moment it is satisfied; leaving it at 7 would let a
    // figure be DELETED without this test noticing.
    expect(labels.length).toBeGreaterThanOrEqual(8);
    expect(labels.filter((l) => REPORT_METRIC_KEYS[l] === undefined)).toEqual([]);
    for (const label of labels) {
      expect(metricDefinition(REPORT_METRIC_KEYS[label]!), label).toBeDefined();
    }
  });
});
