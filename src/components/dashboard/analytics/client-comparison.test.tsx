import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ClientComparison, ClientComparisonRow } from "@/services/types";

import { ClientComparisonTable } from "./client-comparison";

function row(over: Partial<ClientComparisonRow>): ClientComparisonRow {
  return {
    clientId: "c1",
    clientName: "Bryan Wish",
    posts: 4,
    avgImpressions: 1000,
    engagementRate: 5,
    followers: 10_000,
    interactionsPer1K: 20,
    ...over,
  };
}

function comparison(over: Partial<ClientComparison> = {}): ClientComparison {
  const rows = over.rows ?? [row({})];
  return {
    rows,
    medians: {
      avgImpressions: { value: 1000, clients: rows.length },
      engagementRate: { value: 5, clients: rows.length },
      followers: { value: 10_000, clients: rows.length },
      interactionsPer1K: { value: 20, clients: rows.length },
    },
    unattributedPosts: 0,
    unavailable: false,
    ...over,
  };
}

/** Client names in the order the table currently renders them. */
function namesInOrder(): string[] {
  return screen.getAllByRole("link").map((a) => a.textContent ?? "");
}

describe("ClientComparisonTable — the four states stay apart", () => {
  it("links each Client's name to its detail page", () => {
    render(<ClientComparisonTable comparison={comparison()} />);

    expect(screen.getByRole("link", { name: "Bryan Wish" })).toHaveAttribute("href", "/clients/c1");
  });

  it("says the comparison could not be read, distinctly from an empty book", () => {
    render(<ClientComparisonTable comparison={comparison({ rows: [], unavailable: true })} />);

    expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
    expect(screen.queryByText(/no clients registered/i)).not.toBeInTheDocument();
  });

  it("shows an empty state — not an outage — when no Client is registered", () => {
    render(<ClientComparisonTable comparison={comparison({ rows: [] })} />);

    expect(screen.getByText(/no clients registered/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not be read/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ ABSENCE IS NOT ZERO, AND ON A NORMALISED TABLE THE DIFFERENCE IS RANKING.
// A Client who published nothing scored 0 posts; a Client whose followers were
// never recorded scored nothing at all. Rendering either as 0 puts them at the
// bottom of a column as though the figure had been measured.
// ─────────────────────────────────────────────────────────────────────────────
describe("ClientComparisonTable — absence never renders as zero", () => {
  const silent = row({
    clientId: "c2",
    clientName: "Ada Lovelace",
    posts: 0,
    avgImpressions: null,
    engagementRate: null,
    followers: null,
    interactionsPer1K: null,
  });

  it("shows a Client with no posts as a genuine 0 with em dashes across the rest", () => {
    render(<ClientComparisonTable comparison={comparison({ rows: [silent] })} />);

    const line = screen.getByRole("link", { name: "Ada Lovelace" }).closest("tr")!;
    expect(within(line).getByText("0")).toBeInTheDocument();
    // ⚠️ NO 0% ANYWHERE. That would claim a measured failure to engage.
    expect(within(line).queryByText("0%")).not.toBeInTheDocument();
    expect(within(line).queryByText("0.0%")).not.toBeInTheDocument();
    expect(within(line).getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  it("spells out what each em dash means, rather than leaving a blank cell", () => {
    render(<ClientComparisonTable comparison={comparison({ rows: [silent] })} />);

    // Exact strings: "Followers not reported" and "Interactions per 1,000
    // followers not reported" are two different cells, and a loose regex would
    // match both and prove neither.
    expect(screen.getByText("Engagement rate not reported")).toBeInTheDocument();
    expect(screen.getByText("Followers not reported")).toBeInTheDocument();
    expect(screen.getByText("Interactions per 1,000 followers not reported")).toBeInTheDocument();
  });

  it("keeps a measured 0 as 0 — it is a fact, not an absence", () => {
    render(
      <ClientComparisonTable
        comparison={comparison({
          rows: [row({ posts: 3, followers: 0, interactionsPer1K: null })],
        })}
      />,
    );

    const line = screen.getByRole("link", { name: "Bryan Wish" }).closest("tr")!;
    // The follower count of 0 is real and printed; the rate PER it is undefined.
    expect(within(line).getByText("0")).toBeInTheDocument();
  });
});

describe("ClientComparisonTable — the sample size stays visible", () => {
  // ⚠️ EVERY AVERAGE IN THE ROW IS ONLY AS GOOD AS THE POST COUNT BEHIND IT. The
  // reader must not be able to take in an average without it.
  it("puts the posts column beside the derived figures, not at the far end", () => {
    render(<ClientComparisonTable comparison={comparison()} />);

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent ?? "");
    const posts = headers.findIndex((h) => /posts/i.test(h));
    const avg = headers.findIndex((h) => /avg impressions/i.test(h));

    expect(posts).toBeGreaterThanOrEqual(0);
    // Immediately before the first derived figure.
    expect(posts).toBe(avg - 1);
  });

  // ⚠️ A MEDIAN OVER THREE CLIENTS AND ONE OVER THIRTY ARE DIFFERENT CLAIMS.
  it("states how many Clients each median was computed over", () => {
    render(
      <ClientComparisonTable
        comparison={comparison({
          rows: [row({}), row({ clientId: "c2", clientName: "Ada Lovelace" })],
          medians: {
            avgImpressions: { value: 1000, clients: 2 },
            engagementRate: { value: 5, clients: 2 },
            followers: { value: 10_000, clients: 1 },
            interactionsPer1K: { value: 20, clients: 2 },
          },
        })}
      />,
    );

    expect(screen.getByText(/median/i)).toBeInTheDocument();
    // The follower median covers only one Client and must say so.
    expect(screen.getByText(/of 1 client/i)).toBeInTheDocument();
    expect(screen.getAllByText(/of 2 clients/i).length).toBeGreaterThan(0);
  });

  it("shows an em dash for a median no Client could contribute to", () => {
    render(
      <ClientComparisonTable
        comparison={comparison({
          medians: {
            avgImpressions: { value: 1000, clients: 1 },
            engagementRate: { value: 5, clients: 1 },
            followers: { value: null, clients: 0 },
            interactionsPer1K: { value: null, clients: 0 },
          },
        })}
      />,
    );

    expect(screen.getByText(/no client has a follower count/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ ATTRIBUTION HAPPENS DOWNSTREAM (ADR 0009). ArcBase submits Posts and can
// only observe whether they came back attributed, so posts matching no Client
// are a real and expected population — and without them on screen the rows
// cannot be reconciled against the post count above.
// ─────────────────────────────────────────────────────────────────────────────
describe("ClientComparisonTable — unattributed posts are surfaced", () => {
  it("states the count plainly beneath the table", () => {
    render(<ClientComparisonTable comparison={comparison({ unattributedPosts: 7 })} />);

    expect(screen.getByText(/7 posts/i)).toBeInTheDocument();
    expect(screen.getByText(/attributed/i)).toBeInTheDocument();
  });

  it("names no raw database column when it does so", () => {
    render(<ClientComparisonTable comparison={comparison({ unattributedPosts: 7 })} />);

    for (const token of ["client_id", "linkedin_post_latest", "bi.", "unattributedPosts"]) {
      expect(screen.queryByText(new RegExp(token))).not.toBeInTheDocument();
    }
  });

  it("says nothing about unattributed posts when there are none", () => {
    render(<ClientComparisonTable comparison={comparison({ unattributedPosts: 0 })} />);

    expect(screen.queryByText(/came back without matching/i)).not.toBeInTheDocument();
  });
});

describe("ClientComparisonTable — sorting matches the per-post table's convention", () => {
  const rows = [
    row({ clientId: "a", clientName: "Low", engagementRate: 1, posts: 1 }),
    row({ clientId: "b", clientName: "High", engagementRate: 9, posts: 2 }),
    row({ clientId: "c", clientName: "Unknown", engagementRate: null, posts: 0 }),
  ];

  it("opens a numeric column DESCENDING on first click", async () => {
    const user = userEvent.setup();
    render(<ClientComparisonTable comparison={comparison({ rows })} />);

    await user.click(screen.getByRole("button", { name: /sort by engagement rate/i }));

    expect(namesInOrder().slice(0, 2)).toEqual(["High", "Low"]);
  });

  // ⚠️ NULLS PARK LAST IN BOTH DIRECTIONS. Sorting them as 0 would rank a Client
  // we could not measure as the worst performer on the book.
  it("parks a Client with no rate LAST ascending as well as descending", async () => {
    const user = userEvent.setup();
    render(<ClientComparisonTable comparison={comparison({ rows })} />);
    const header = screen.getByRole("button", { name: /sort by engagement rate/i });

    await user.click(header); // desc
    expect(namesInOrder().at(-1)).toBe("Unknown");

    await user.click(header); // asc
    expect(namesInOrder().at(-1)).toBe("Unknown");
  });
});
