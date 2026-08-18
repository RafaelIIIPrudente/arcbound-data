import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { METRIC_DEFINITIONS } from "@/lib/metric-definitions";
import type { ClientListRow } from "@/services/types";

import { ClientsTable } from "./clients-table";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/clients",
}));

function client(over: Partial<ClientListRow> & { id: string; name: string }): ClientListRow {
  return {
    linkedin_url: `https://linkedin.com/in/${over.name.toLowerCase().replace(/\s/g, "")}`,
    createdAt: "2026-01-04T09:00:00.000Z",
    postsCount: 5,
    lastUpload: "2026-07-15T09:00:00.000Z",
    // Both default to unset — the state every Client was in before S1 added the
    // columns. This table does not render either field yet (S4 owns that); they
    // are here because `ClientListRow` now requires them.
    industry: null,
    writer: null,
    ...over,
  };
}

const rows: ClientListRow[] = [
  client({ id: "c1", name: "Bryan Wish", postsCount: 5 }),
  client({ id: "c2", name: "Senthil Kumar", postsCount: 62 }),
];

/** Body rows only — `getAllByRole("row")` would include the header. */
function bodyRows() {
  return within(screen.getAllByRole("rowgroup")[1]!).getAllByRole("row");
}

/**
 * The client names in render order — the whole vocabulary of a sorting
 * assertion. Each row holds TWO links (the client name and the LinkedIn URL);
 * the name is first in DOM order.
 */
function names() {
  return bodyRows().map((r) => within(r).getAllByRole("link")[0]!.textContent);
}

beforeEach(() => {
  replace.mockClear();
});

describe("ClientsTable", () => {
  it("renders a row per client with the name and scheme-stripped LinkedIn URL", () => {
    render(<ClientsTable data={rows} />);

    expect(screen.getByRole("link", { name: "Bryan Wish" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Senthil Kumar" })).toBeInTheDocument();
    expect(screen.getByText("linkedin.com/in/bryanwish")).toBeInTheDocument();
    expect(screen.getByText("linkedin.com/in/senthilkumar")).toBeInTheDocument();
  });

  it("shows an empty state when there are no clients", () => {
    render(<ClientsTable data={[]} />);
    expect(screen.getByText("No clients found.")).toBeInTheDocument();
  });

  it("renders NO pagination controls", () => {
    render(<ClientsTable data={rows} />);

    // The comp has no pager, and the page fetches every row it shows. Previous/
    // Next were permanently disabled chrome that could never do anything.
    expect(screen.queryByRole("button", { name: /previous/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
  });
});

describe("a count that could not be read is NOT a zero", () => {
  it("renders an unreadable count as an em dash, and a real zero as 0", () => {
    render(
      <ClientsTable
        data={[
          client({ id: "c1", name: "Unreadable", postsCount: null }),
          client({ id: "c2", name: "Genuinely Empty", postsCount: 0 }),
        ]}
      />,
    );

    const [unreadable, empty] = bodyRows();

    // ⚠️ THE POINT OF THE WHOLE SLICE. These two rows used to be identical.
    expect(within(unreadable!).getByText("—")).toBeInTheDocument();
    expect(within(unreadable!).getByText(/Post count could not be read/)).toBeInTheDocument();
    expect(within(unreadable!).queryByText("0")).not.toBeInTheDocument();

    expect(within(empty!).getByText("0")).toBeInTheDocument();
    expect(within(empty!).queryByText("—")).not.toBeInTheDocument();
  });

  it("distinguishes a client never ingested from one whose uploads could not be read", () => {
    render(
      <ClientsTable
        data={[
          client({ id: "c1", name: "Never Ingested", lastUpload: null }),
          client({ id: "c2", name: "Unreadable", lastUpload: "unavailable" }),
        ]}
      />,
    );

    const [never, unreadable] = bodyRows();

    // "Never" is a FACT; the em dash is the absence of one.
    expect(within(never!).getByText("Never")).toBeInTheDocument();
    expect(within(unreadable!).getByText("—")).toBeInTheDocument();
    // ⚠️ "Last ArcBase upload", MATCHING THE HEADER. The cell's screen-reader
    // text used to say "Last upload" while the column heading said "Last ArcBase
    // upload" — so the one reader who cannot see the header was told the
    // narrower claim under its unqualified name, which is the exact ambiguity
    // the rename removed.
    expect(
      within(unreadable!).getByText(/Last ArcBase upload could not be read/),
    ).toBeInTheDocument();
  });
});

describe("sorting", () => {
  const mixed = [
    client({ id: "c1", name: "Bravo", postsCount: 10 }),
    client({ id: "c2", name: "Alpha", postsCount: null }),
    client({ id: "c3", name: "Charlie", postsCount: 2 }),
  ];
  it("sorts by client name", async () => {
    const user = userEvent.setup();
    render(<ClientsTable data={mixed} />);

    await user.click(screen.getByRole("button", { name: "Sort by client" }));
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie"]);

    await user.click(screen.getByRole("button", { name: "Sort by client" }));
    expect(names()).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("parks unreadable counts LAST in BOTH directions", async () => {
    const user = userEvent.setup();
    render(<ClientsTable data={mixed} />);
    const sortPosts = screen.getByRole("button", { name: "Sort by posts" });

    // THE RULE: `—` is missing information, not an extreme value. It never
    // competes for the top of the list, so the informative rows stay adjacent
    // to the header the user just clicked.
    //
    // Posts opens DESCENDING (TanStack's default for numbers, and the useful
    // one here — "who posts most" is the question being asked).
    await user.click(sortPosts);
    expect(names()).toEqual(["Bravo", "Charlie", "Alpha"]); // 10, 2, —

    await user.click(sortPosts);
    expect(names()).toEqual(["Charlie", "Bravo", "Alpha"]); // 2, 10, —

    // Asserting BOTH directions is what discriminates: a naive comparator would
    // flip the em-dash row to the top on the second click.
    expect(names().at(-1)).toBe("Alpha");
  });

  it("sorts by last ArcBase upload, parking unreadable dates last", async () => {
    const user = userEvent.setup();
    render(
      <ClientsTable
        data={[
          client({ id: "c1", name: "Older", lastUpload: "2026-06-01T09:00:00.000Z" }),
          client({ id: "c2", name: "Unreadable", lastUpload: "unavailable" }),
          client({ id: "c3", name: "Newer", lastUpload: "2026-07-15T09:00:00.000Z" }),
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sort by last ArcBase upload" }));
    expect(names()).toEqual(["Older", "Newer", "Unreadable"]);

    await user.click(screen.getByRole("button", { name: "Sort by last ArcBase upload" }));
    expect(names()).toEqual(["Newer", "Older", "Unreadable"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TWO TRUE COLUMNS THAT READ AS A CONTRADICTION.
//
// `Last ArcBase upload` comes from `public.uploads` — this app's own ingest.
// `Posts` comes from `bi.linkedin_post_latest` — the external pipeline. A client
// with no ArcBase upload and 45 posts is entirely ordinary, but under a bare
// "Last upload" header it reads as one number calling the other a liar. That is
// what got filed as a bug, and the reader was right: the screen was saying the
// wrong thing with correct figures.
//
// ⚠️ NOTHING BELOW ASSERTS A FIGURE. The fix is labels and definitions only; the
// three-state cell and both counts are covered above and must not move.
// ─────────────────────────────────────────────────────────────────────────────

describe("the Client List names which pipeline each column measures", () => {
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

  it("names ArcBase in the upload header, so “Never” is a claim about ONE source", () => {
    // ⚠️ THE WHOLE FIX IN ONE STRING. Under "Last upload", "Never" reads as a
    // claim about everything known of this client; under "Last ArcBase upload"
    // it is a claim about this app's ingest and nothing else, which is all it
    // ever meant.
    render(<ClientsTable data={rows} />);

    expect(screen.getByRole("columnheader", { name: "Last ArcBase upload" })).toBeInTheDocument();
    expect(screen.queryByText("Last upload")).not.toBeInTheDocument();
  });

  it("keeps the sort control's accessible name agreeing with the visible label", () => {
    // A hardcoded aria-label is exactly the thing a rename leaves behind, and a
    // control announced as something other than what it reads is worse than one
    // announced clumsily.
    render(<ClientsTable data={rows} />);

    expect(screen.getByRole("button", { name: "Sort by last ArcBase upload" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sort by last upload" })).not.toBeInTheDocument();
  });

  it("offers a definition on every column that has one — and only those", () => {
    render(<ClientsTable data={rows} />);

    // ⚠️ THREE NOW, NOT TWO. S5 added Writer, whose four states are the reason
    // it has an ⓘ at all; Industry deliberately has none (D11).
    expect(
      screen.getByRole("button", { name: "What is Last ArcBase upload?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What is Posts?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What is Writer?" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "What is Industry?" })).toBeNull();
  });

  it("explains that a client can have posts with no ArcBase upload at all", async () => {
    // ⚠️ THE RECONCILIATION ITSELF. The rename narrows the claim; only this
    // sentence tells the reader the two columns are ALLOWED to disagree.
    const user = userEvent.setup();
    render(<ClientsTable data={rows} />);

    await user.click(screen.getByRole("button", { name: "What is Last ArcBase upload?" }));

    expect(
      await screen.findByText(METRIC_DEFINITIONS.clientListLastArcbaseUpload.definition),
    ).toBeInTheDocument();
  });

  it("discloses name-match attribution on the Posts column", async () => {
    const user = userEvent.setup();
    render(<ClientsTable data={rows} />);

    await user.click(screen.getByRole("button", { name: "What is Posts?" }));

    expect(
      await screen.findByText(METRIC_DEFINITIONS.clientListPosts.definition),
    ).toBeInTheDocument();
  });

  it("keeps both ⓘ OUT of the column headers' accessible names", () => {
    // ⚠️ A `<th>` computes its name from its content, so without an explicit
    // name the ⓘ's label would be announced as part of the column on every one
    // of its cells.
    render(<ClientsTable data={rows} />);

    for (const name of ["Last ArcBase upload", "Posts", "Writer"]) {
      const header = screen.getByRole("columnheader", { name });
      expect(header.getAttribute("aria-label")).toBe(name);
    }
  });

  it("still sorts after the ⓘ were added — the nested-button trap would break this", async () => {
    // ⚠️ THE FAILURE THIS PATTERN EXISTS TO AVOID. A sortable header renders its
    // content INSIDE a `<button>`, so an ⓘ declared in `columnDef.header` would
    // nest one button in another: invalid markup, unreachable by keyboard, and
    // a sort click that lands on the wrong control.
    const user = userEvent.setup();
    render(
      <ClientsTable
        data={[
          client({ id: "c1", name: "Bravo", postsCount: 10 }),
          client({ id: "c2", name: "Charlie", postsCount: 2 }),
        ]}
      />,
    );

    const header = screen.getByRole("columnheader", { name: "Posts" });
    expect(within(header).getByRole("button", { name: "Sort by posts" })).toBeVisible();
    expect(within(header).getByRole("button", { name: "What is Posts?" })).toBeVisible();

    await user.click(within(header).getByRole("button", { name: "Sort by posts" }));
    expect(bodyRows().map((r) => within(r).getAllByRole("link")[0]!.textContent)).toEqual([
      "Bravo",
      "Charlie",
    ]);
  });

  it("changes no figure — Never, the em dash and the count all still render", () => {
    // ⚠️ THE GUARDRAIL OF THE SLICE, ASSERTED RATHER THAN PROMISED. The defect
    // was adjacency, so a fix that moved a number would have been a different
    // and worse change.
    render(
      <ClientsTable
        data={[
          client({ id: "c1", name: "Never Ingested", lastUpload: null, postsCount: 45 }),
          client({ id: "c2", name: "Unreadable", lastUpload: "unavailable", postsCount: null }),
        ]}
      />,
    );

    const [never, unreadable] = bodyRows();

    // The exact pairing the reviewer read as a bug, still rendering exactly as
    // it did — now under a header that says which pipeline "Never" is about.
    expect(within(never!).getByText("Never")).toBeInTheDocument();
    expect(within(never!).getByText("45")).toBeInTheDocument();
    expect(within(unreadable!).getAllByText("—")).toHaveLength(2);
  });
});

describe("the filter writes the URL", () => {
  // Real timers deliberately: userEvent and Vitest's fake timers deadlock here,
  // and the debounce is short enough to simply wait out.
  it("rewrites ?q= after typing settles, ONCE per burst", async () => {
    const user = userEvent.setup();
    render(<ClientsTable data={rows} />);

    await user.type(screen.getByRole("textbox", { name: /filter clients/i }), "bryan");

    // The URL is the source of truth: this is what makes the filter survive a
    // reload and travel in a shared link.
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/clients?q=bryan", { scroll: false }),
    );
    // Debounced — five keystrokes, one navigation, not five.
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("clears the param entirely rather than leaving ?q=", async () => {
    const user = userEvent.setup();
    render(<ClientsTable data={rows} q="bryan" />);

    await user.clear(screen.getByRole("textbox", { name: /filter clients/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/clients", { scroll: false }));
  });

  it("seeds the input from the URL so a shared link shows its own filter", () => {
    render(<ClientsTable data={rows} q="senthil" />);

    expect(screen.getByRole("textbox", { name: /filter clients/i })).toHaveValue("senthil");
  });

  it("does NOT filter rows itself — the server already did", () => {
    // The old table filtered in React while the server filtered too. Only one
    // mechanism remains; the table renders exactly what it is handed.
    render(<ClientsTable data={rows} q="nomatch" />);

    expect(bodyRows()).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TWO MORE COLUMNS, ONE OF THEM WITH FOUR STATES.
//
// `ClientWriter` is `null | resolved | unknown | unavailable`, and two of those
// four sound alarming while meaning opposite things: `unknown` is a broken LINK
// (a human must reassign) and `unavailable` is a broken READ (retry). ⚠️
// Collapsing either into "nobody is assigned" reports a staffing gap that does
// not exist — the same defect shape as the em dash that used to render as `0`.
//
// The column indices below are the intended order, and they are the reason
// these assertions can name a cell at all: two rows both showing "Not recorded"
// in different columns are two different facts.
// ─────────────────────────────────────────────────────────────────────────────

const COL = { name: 0, linkedin: 1, industry: 2, writer: 3, lastUpload: 4, posts: 5 } as const;

/** One cell of a body row, by column — `getAllByText` cannot tell two apart. */
function cell(row: HTMLElement, col: keyof typeof COL): HTMLElement {
  return within(row).getAllByRole("cell")[COL[col]]!;
}

const RESOLVED = { status: "resolved", userId: "u1", email: "ana@arcbound.com" } as const;
const ORPHANED = { status: "unknown", userId: "u2" } as const;
const UNREADABLE = { status: "unavailable", userId: "u3" } as const;

describe("the Writer column keeps four states four", () => {
  const writers: ClientListRow[] = [
    client({ id: "w1", name: "Unset", writer: null }),
    client({ id: "w2", name: "Resolved", writer: RESOLVED }),
    client({ id: "w3", name: "Orphaned", writer: ORPHANED }),
    client({ id: "w4", name: "Unreadable", writer: UNREADABLE }),
  ];

  it("⚠️ renders all four writer states differently from one another", () => {
    // ⚠️ THE SLICE, IN ONE ASSERTION. Any two of these rendering alike is a
    // sentence the screen is not entitled to say: "nobody writes for them"
    // where somebody does, or "retry" where a person must be reassigned.
    render(<ClientsTable data={writers} />);

    const [unset, resolved, orphaned, unreadable] = bodyRows();
    const texts = [unset, resolved, orphaned, unreadable].map(
      (r) => cell(r!, "writer").textContent ?? "",
    );

    expect(new Set(texts).size, texts.join(" | ")).toBe(4);
  });

  it("⚠️ renders “not recorded” as words — the dash belongs to the unread read ALONE", () => {
    render(<ClientsTable data={writers} />);

    const [unset, resolved, orphaned, unreadable] = bodyRows();

    // A known fact, exactly like "Never" on the column two along.
    expect(cell(unset!, "writer")).toHaveTextContent(/not recorded/i);
    expect(within(cell(unset!, "writer")).queryByText("—")).toBeNull();

    expect(cell(resolved!, "writer")).toHaveTextContent("ana@arcbound.com");
    expect(within(cell(resolved!, "writer")).queryByText("—")).toBeNull();

    // ⚠️ NEITHER ALARMING STATE MAY READ AS "NOBODY". `unknown` is an assignment
    // pointing at an account that is gone; a human has to pick someone else.
    expect(cell(orphaned!, "writer")).not.toHaveTextContent(/not recorded/i);
    expect(within(cell(orphaned!, "writer")).queryByText("—")).toBeNull();

    // …and ONLY the failed read is a dash, with the sentence a sighted reader
    // gets from the glyph's position spelled out for the one who does not.
    expect(within(cell(unreadable!, "writer")).getByText("—")).toBeInTheDocument();
    expect(cell(unreadable!, "writer")).toHaveTextContent(/writer could not be read/i);
    expect(cell(unreadable!, "writer")).not.toHaveTextContent(/not recorded/i);
  });

  it("⚠️ parks ONLY the unreadable writer last, in BOTH directions", async () => {
    // ⚠️ `null` AND `unknown` ARE KNOWN FACTS AND SORT AS VALUES. Only a read
    // that failed is missing data, and missing data never competes for the top
    // of a list. Asserting the reversal of the other three is what discriminates:
    // a row that parked would keep its place when the direction flipped.
    const user = userEvent.setup();
    render(<ClientsTable data={writers} />);
    const sortWriter = screen.getByRole("button", { name: "Sort by writer" });

    await user.click(sortWriter);
    const asc = names();
    await user.click(sortWriter);
    const desc = names();

    expect(asc.at(-1), asc.join(" → ")).toBe("Unreadable");
    expect(desc.at(-1), desc.join(" → ")).toBe("Unreadable");
    expect(desc.slice(0, 3)).toEqual([...asc.slice(0, 3)].reverse());
  });
});

describe("the Industry column", () => {
  it("renders an unrecorded industry as words, never as the dash", () => {
    // ⚠️ THE REGISTRY IS EMPTY IN REALITY, so this is what every row shows on
    // the first run. It has to look deliberate — a table of em dashes reads as
    // a broken screen, and the dash means one specific thing on this table.
    render(
      <ClientsTable
        data={[
          client({ id: "c1", name: "Unset", industry: null }),
          client({ id: "c2", name: "Recorded", industry: { id: "i1", name: "SaaS" } }),
        ]}
      />,
    );

    const [unset, recorded] = bodyRows();

    expect(cell(unset!, "industry")).toHaveTextContent(/not recorded/i);
    expect(within(cell(unset!, "industry")).queryByText("—")).toBeNull();
    expect(cell(recorded!, "industry")).toHaveTextContent("SaaS");
  });

  it("carries NO ⓘ — two self-evident states need no sentence (D11)", () => {
    render(<ClientsTable data={rows} />);

    expect(screen.getByRole("columnheader", { name: "Industry" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "What is Industry?" })).toBeNull();
  });
});

describe("both new columns hide below the breakpoint, header WITH cell", () => {
  it("⚠️ carries the same hiding class on the header and on every cell", () => {
    // ⚠️ HEADER AND CELL TOGETHER OR THE TABLE MISALIGNS. `meta.className`
    // reaches both, which is why one string can do this; a hand-written class on
    // only one of them would shift every row by a column at the breakpoint.
    //
    // ⚠️ THIS IS NOT A RESPONSIVENESS PROOF. jsdom applies no CSS, so it asserts
    // the class is present — never that anything is hidden at any width.
    render(<ClientsTable data={rows} />);

    const [first] = bodyRows();
    for (const name of ["Industry", "Writer"] as const) {
      const header = screen.getByRole("columnheader", { name });
      expect(header.className, `${name} header`).toMatch(/(^|\s)hidden(\s|$)/);
      expect(header.className, `${name} header`).toMatch(/md:table-cell/);
    }
    for (const col of ["industry", "writer"] as const) {
      const c = cell(first!, col);
      expect(c.className, `${col} cell`).toMatch(/(^|\s)hidden(\s|$)/);
      expect(c.className, `${col} cell`).toMatch(/md:table-cell/);
    }
  });
});

describe("the Writer column's ⓘ", () => {
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

  it("keeps the sort control's accessible name agreeing with the visible header", () => {
    // The hardcoded aria-label in `clients-table.tsx` does not follow a header;
    // a new sortable column has to be added to it by hand, and this is the test
    // that notices when it was not.
    render(<ClientsTable data={rows} />);

    expect(screen.getByRole("button", { name: "Sort by writer" })).toBeInTheDocument();
  });

  it("⚠️ sits OUTSIDE the sort button — a button inside a button reaches no keyboard", () => {
    render(<ClientsTable data={rows} />);

    const header = screen.getByRole("columnheader", { name: "Writer" });
    const sort = within(header).getByRole("button", { name: "Sort by writer" });
    expect(within(header).getByRole("button", { name: "What is Writer?" })).toBeVisible();
    expect(within(sort).queryByRole("button")).toBeNull();
  });

  it("explains all four states, so the two alarming ones cannot be confused", async () => {
    const user = userEvent.setup();
    render(<ClientsTable data={rows} />);

    await user.click(screen.getByRole("button", { name: "What is Writer?" }));

    expect(
      await screen.findByText(METRIC_DEFINITIONS.clientListWriter.definition),
    ).toBeInTheDocument();
  });

  it("still sorts with the ⓘ beside it", async () => {
    const user = userEvent.setup();
    render(
      <ClientsTable
        data={[
          client({ id: "w1", name: "Zulu", writer: RESOLVED }),
          client({ id: "w2", name: "Alpha", writer: null }),
        ]}
      />,
    );

    const header = screen.getByRole("columnheader", { name: "Writer" });
    await user.click(within(header).getByRole("button", { name: "Sort by writer" }));

    // The rows REORDER, which is all this test claims: the sort control still
    // works with a second button beside it. (TanStack's comparator puts
    // "Not recorded" ahead of "ana@arcbound.com" — capitals sort first — which
    // is why the row order here is the reverse of the client names.)
    expect(names()).toEqual(["Alpha", "Zulu"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D6: "HOW MANY CLIENTS IN SaaS" MUST BE ANSWERABLE FROM THE LIST.
//
// Displaying the industry is not the same as being able to count by it. The two
// questions these fields exist to answer are "which clients are mine" and "how
// many clients in SaaS", and the decision record says neither is answerable from
// a detail page alone — so the list has to carry them. Sorting groups the rows;
// the filter (which the page's own count caption reads from) answers the count.
// ─────────────────────────────────────────────────────────────────────────────

describe("the Industry column can be grouped", () => {
  it("sorts by industry, with the sort control named for the header", async () => {
    const user = userEvent.setup();
    render(
      <ClientsTable
        data={[
          client({ id: "c1", name: "Zulu", industry: { id: "i2", name: "SaaS" } }),
          client({ id: "c2", name: "Alpha", industry: { id: "i1", name: "Fintech" } }),
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sort by industry" }));
    expect(names()).toEqual(["Alpha", "Zulu"]);

    await user.click(screen.getByRole("button", { name: "Sort by industry" }));
    expect(names()).toEqual(["Zulu", "Alpha"]);
  });

  it("sorts unrecorded industries as a value, because that is what they are", async () => {
    // ⚠️ NOT MISSING DATA. Nobody has recorded one — a fact, like "Never" — so it
    // takes its place in the order rather than parking with unreadable rows. The
    // Industry column has no unreadable state at all: the foreign key guarantees
    // a set industry resolves.
    const user = userEvent.setup();
    render(
      <ClientsTable
        data={[
          client({ id: "c1", name: "Recorded", industry: { id: "i1", name: "SaaS" } }),
          client({ id: "c2", name: "Unset", industry: null }),
        ]}
      />,
    );

    const sort = screen.getByRole("button", { name: "Sort by industry" });
    await user.click(sort);
    const asc = names();
    await user.click(sort);
    expect(names()).toEqual([...asc].reverse());
  });
});
