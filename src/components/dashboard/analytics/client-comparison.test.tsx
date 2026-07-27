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
    connections: 5_000,
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
      connections: { value: 5_000, clients: rows.length },
    },
    unattributedPosts: 0,
    unavailable: false,
    followersUnavailable: false,
    connectionsUnavailable: false,
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
    connections: null,
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
            connections: { value: 5_000, clients: 2 },
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
            connections: { value: null, clients: 0 },
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

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ A FAILED FOLLOWER READ IS NOT AN ABSENCE OF FOLLOWERS.
//
// When the upload read fails the two follower columns em-dash for every row —
// identical to a book where nobody recorded a follower count. Those are two
// different facts ("could not be read" vs "not reported"), and the table must
// keep them apart rather than let a reader guess.
// ─────────────────────────────────────────────────────────────────────────────
describe("ClientComparisonTable — a failed follower read is stated, not silent", () => {
  it("notes that follower figures could not be read when the upload read failed", () => {
    render(<ClientComparisonTable comparison={comparison({ followersUnavailable: true })} />);

    expect(screen.getByText(/follower figures could not be read/i)).toBeInTheDocument();
    // The three post-derived columns are still shown — the table is built, not
    // blanked, so the note qualifies two columns rather than replacing the table.
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("stays silent about follower reads when they SUCCEEDED", () => {
    // followersUnavailable defaults false: an all-em-dash followers column is
    // then "no client has a follower figure", not an outage, and mislabelling it
    // would be the very collapse this note exists to prevent.
    render(<ClientComparisonTable comparison={comparison()} />);

    expect(screen.queryByText(/could not be read/i)).not.toBeInTheDocument();
  });

  it("names no raw database column in the follower-unavailable note", () => {
    render(<ClientComparisonTable comparison={comparison({ followersUnavailable: true })} />);

    for (const token of ["uploads", "follower_count", "followersUnavailable"]) {
      expect(screen.queryByText(new RegExp(token))).not.toBeInTheDocument();
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE CONNECTION COLUMNS OBEY THE SAME DENOMINATOR RULES — AND CARRY AN EXTRA
// BURDEN. The count is OPTIONAL at capture and no upload predating the column
// carries one, so an all-em-dash Connections column is the ORDINARY state.
// Rendering those gaps as 0 would rank the entire book bottom of a normalised
// column for a measurement nobody took.
// ─────────────────────────────────────────────────────────────────────────────
describe("ClientComparisonTable — the connection columns", () => {
  it("gives connections a RAW column and NO derived per-1,000 column", () => {
    // ⚠️ THE SUBTRACTION, PINNED AT THE SCREEN. The derived column was removed on
    // purpose; a reinstated one would restore a symmetry that was rejected.
    render(<ClientComparisonTable comparison={comparison()} />);

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent ?? "");
    expect(headers.some((h) => /^connections$/i.test(h.trim()))).toBe(true);
    expect(headers.some((h) => /per 1k connections/i.test(h))).toBe(false);
    // Followers KEEPS its rate — the asymmetry is deliberate.
    expect(headers.some((h) => /per 1k followers/i.test(h))).toBe(true);
    // Client · Posts · Avg impressions · Engagement · Followers · Per 1K followers
    // · Connections = 7 header cells.
    expect(headers).toHaveLength(7);
  });

  it("prints a recorded connection count", () => {
    render(<ClientComparisonTable comparison={comparison()} />);

    const line = screen.getByRole("link", { name: "Bryan Wish" }).closest("tr")!;
    expect(within(line).getByText("5,000")).toBeInTheDocument();
  });

  it("renders an unrecorded connection count as a SPOKEN em dash, never 0", () => {
    render(
      <ClientComparisonTable
        comparison={comparison({
          rows: [row({ connections: null })],
        })}
      />,
    );

    expect(screen.getByText("Connections not reported")).toBeInTheDocument();
  });

  it("keeps a measured 0 connections as 0 — a fact, not an absence", () => {
    render(
      <ClientComparisonTable
        comparison={comparison({
          rows: [row({ posts: 3, connections: 0 })],
        })}
      />,
    );

    const line = screen.getByRole("link", { name: "Bryan Wish" }).closest("tr")!;
    expect(within(line).getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("Connections not reported")).not.toBeInTheDocument();
  });

  it("states its OWN median with its OWN sample size", () => {
    render(
      <ClientComparisonTable
        comparison={comparison({
          medians: {
            avgImpressions: { value: 1000, clients: 4 },
            engagementRate: { value: 5, clients: 4 },
            followers: { value: 10_000, clients: 4 },
            interactionsPer1K: { value: 20, clients: 4 },
            // Far fewer clients report connections — the table must not imply
            // this median is as well-supported as the follower one beside it.
            connections: { value: 5_000, clients: 1 },
          },
        })}
      />,
    );

    expect(screen.getAllByText(/of 1 client/i)).toHaveLength(1);
    expect(screen.getAllByText(/of 4 clients/i)).toHaveLength(4);
  });

  it("shows a spoken em dash for a connections median nobody could contribute to", () => {
    render(
      <ClientComparisonTable
        comparison={comparison({
          medians: {
            avgImpressions: { value: 1000, clients: 1 },
            engagementRate: { value: 5, clients: 1 },
            followers: { value: 10_000, clients: 1 },
            interactionsPer1K: { value: 20, clients: 1 },
            connections: { value: null, clients: 0 },
          },
        })}
      />,
    );

    expect(screen.getByText(/no client has a connection count/i)).toBeInTheDocument();
  });
});

describe("ClientComparisonTable — a failed connection read is stated separately", () => {
  it("notes that connection figures could not be read when the upload read failed", () => {
    render(<ClientComparisonTable comparison={comparison({ connectionsUnavailable: true })} />);

    expect(screen.getByText(/connection figures could not be read/i)).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("describes ONLY the Connections column — there is no per-1K column left to blank", () => {
    // ⚠️ A NOTICE THAT NAMES A COLUMN THAT NO LONGER EXISTS IS A LIE ON SCREEN.
    // The wording has to shrink with the table.
    render(<ClientComparisonTable comparison={comparison({ connectionsUnavailable: true })} />);

    const note = screen.getByText(/connection figures could not be read/i);
    expect(note).toHaveTextContent(/Connections column/i);
    // It must not name a derived column, because none is left to blank.
    expect(note).not.toHaveTextContent(/per 1k/i);
  });

  it("stays silent when the read SUCCEEDED and the column is simply unrecorded", () => {
    // ⚠️ THE CRY-WOLF CASE. Blank connections is the normal state; calling it an
    // outage would put a permanent false alarm under the table.
    render(
      <ClientComparisonTable
        comparison={comparison({
          rows: [row({ connections: null })],
        })}
      />,
    );

    expect(screen.queryByText(/could not be read/i)).not.toBeInTheDocument();
  });

  it("names no raw database column in the connection-unavailable note", () => {
    render(<ClientComparisonTable comparison={comparison({ connectionsUnavailable: true })} />);

    for (const token of ["uploads", "connections_count", "connectionsUnavailable"]) {
      expect(screen.queryByText(new RegExp(token))).not.toBeInTheDocument();
    }
  });
});
