import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    expect(within(unreadable!).getByText(/Last upload could not be read/)).toBeInTheDocument();
  });
});

describe("sorting", () => {
  const mixed = [
    client({ id: "c1", name: "Bravo", postsCount: 10 }),
    client({ id: "c2", name: "Alpha", postsCount: null }),
    client({ id: "c3", name: "Charlie", postsCount: 2 }),
  ];
  // Each row holds TWO links — the client name and the LinkedIn URL. The name
  // is first in DOM order.
  const names = () => bodyRows().map((r) => within(r).getAllByRole("link")[0]!.textContent);

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

  it("sorts by last upload, parking unreadable dates last", async () => {
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

    await user.click(screen.getByRole("button", { name: "Sort by last upload" }));
    expect(names()).toEqual(["Older", "Newer", "Unreadable"]);

    await user.click(screen.getByRole("button", { name: "Sort by last upload" }));
    expect(names()).toEqual(["Newer", "Older", "Unreadable"]);
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
