import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { ClientReport } from "@/services/types";

import { KeyPerformance } from "./key-performance";

const GRID: ClientReport["keyPerformance"] = {
  selected: [
    { label: "Total posts", value: 12 },
    { label: "Avg interactions", value: 56 },
    { label: "Total interactions", value: 1234 },
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
  it("leads with the three selected-period figures", () => {
    render(<KeyPerformance keyPerformance={GRID} hasPosts />);

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("56")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("Total posts")).toBeInTheDocument();
    expect(screen.getByText("Avg interactions")).toBeInTheDocument();
    expect(screen.getByText("Total interactions")).toBeInTheDocument();
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

    for (const hero of ["12", "56", "1,234"]) {
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
