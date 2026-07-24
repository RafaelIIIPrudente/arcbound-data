import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ClientPostRow } from "@/services/types";

import { PostsTable } from "./posts-table";

function post(over: Partial<ClientPostRow> & { id: string }): ClientPostRow {
  return {
    url: `https://www.linkedin.com/feed/update/${over.id}`,
    snippet: `Post ${over.id}`,
    date: "2026-07-10",
    age: null,
    sortMs: Date.parse("2026-07-10"),
    format: "IMAGE",
    formatLabel: "Image",
    impressions: 100,
    likes: 10,
    comments: 2,
    shares: 1,
    saves: 3,
    interactions: 16,
    ...over,
  };
}

/** Body rows only — `getAllByRole("row")` would include the header. */
function bodyRows() {
  return within(screen.getAllByRole("rowgroup")[1]!).getAllByRole("row");
}

const snippets = () =>
  bodyRows().map((r) => within(r).getByRole("cell", { name: /^Post / }).textContent);

describe("PostsTable", () => {
  it("renders every column the drill-down promises", () => {
    render(<PostsTable data={[post({ id: "a" })]} />);

    for (const header of [
      "Date",
      "Post",
      "Asset type",
      "Impressions",
      "Likes",
      "Comments",
      "Shares",
      "Saves",
      "Interactions",
    ]) {
      expect(
        screen.getByRole("columnheader", { name: new RegExp(header, "i") }),
      ).toBeInTheDocument();
    }
  });

  it("renders a row per post", () => {
    render(<PostsTable data={[post({ id: "a" }), post({ id: "b" }), post({ id: "c" })]} />);

    expect(bodyRows()).toHaveLength(3);
  });

  it("shows an EMPTY period as an empty state, not as an error", () => {
    render(<PostsTable data={[]} />);

    expect(screen.getByText("No posts in this period.")).toBeInTheDocument();
    // A failed read never reaches this component; the page renders the
    // unavailable banner instead. No error language belongs here.
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
  });

  it("renders NO pagination controls", () => {
    render(<PostsTable data={[post({ id: "a" })]} />);

    expect(screen.queryByRole("button", { name: /previous/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
  });
});

describe("the Post cell never renders a dead link", () => {
  it("links out in a new tab when the post has a url", () => {
    render(<PostsTable data={[post({ id: "a", snippet: "A real post" })]} />);

    const link = screen.getByRole("link", { name: "A real post" });
    expect(link).toHaveAttribute("href", "https://www.linkedin.com/feed/update/a");
    expect(link).toHaveAttribute("target", "_blank");
    // `noopener` matters: without it the opened tab can reach back via
    // window.opener.
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders PLAIN TEXT — no anchor at all — when the url is missing", () => {
    const { container } = render(
      <PostsTable data={[post({ id: "a", url: null, snippet: "No link here" })]} />,
    );

    // ⚠️ ASSERTED ON THE TAG, NOT THE ROLE. An `<a>` with no href has no `link`
    // role, so a role-based query finds nothing and `expect(queryByRole("link"))
    // .not.toBeInTheDocument()` SUCCEEDS while a bare anchor is still sitting in
    // the DOM — exactly the shape a careless `url ?` removal produces. Querying
    // the element is what makes this test able to fail.
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("[href]")).toBeNull();
    expect(screen.getByText("No link here")).toBeInTheDocument();
  });

  it("says so when a post carries no text content", () => {
    render(<PostsTable data={[post({ id: "a", snippet: "" })]} />);

    expect(screen.getByText("No text content")).toBeInTheDocument();
  });
});

describe("dates: a resolved date, an approximate age, or neither", () => {
  it("formats a resolved publish date", () => {
    render(<PostsTable data={[post({ id: "a", date: "2026-07-10" })]} />);

    expect(screen.getByText("Jul 10, 2026")).toBeInTheDocument();
  });

  it("shows the RAW AGE, marked approximate, when the date was never resolved", () => {
    render(
      <PostsTable
        data={[
          post({
            id: "a",
            date: null,
            age: "23h",
            sortMs: Date.parse("2026-07-15T09:00:00.000Z"),
          }),
        ]}
      />,
    );

    expect(screen.getByText("23h")).toBeInTheDocument();
    expect(screen.getByText(/approximate age; publish date not resolved/i)).toBeInTheDocument();
    // ⚠️ `scraped_at` is the WINDOWING key and must never surface as a publish
    // date. The sort key holds 15 July; no cell may say so.
    expect(screen.queryByText(/Jul 15, 2026/)).not.toBeInTheDocument();
  });

  it("renders an em dash when there is neither a date nor an age", () => {
    render(<PostsTable data={[post({ id: "a", date: null, age: null, sortMs: null })]} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText(/Publish date not reported/i)).toBeInTheDocument();
  });
});

describe("a metric that was not reported is NOT a zero", () => {
  it("renders an unreported `saves` as an em dash and a measured zero as 0", () => {
    render(
      <PostsTable
        data={[
          post({ id: "unreported", snippet: "Post unreported", saves: null, impressions: 200 }),
          post({ id: "zero", snippet: "Post zero", saves: 0, impressions: 100 }),
        ]}
      />,
    );

    const [unreported, zero] = bodyRows();

    // ⚠️ The distinction this repo has fixed twice. These two cells must never
    // render identically.
    expect(within(unreported!).getByText("—")).toBeInTheDocument();
    expect(within(unreported!).getByText(/Saves not reported/i)).toBeInTheDocument();

    expect(within(zero!).getByText("0")).toBeInTheDocument();
    expect(within(zero!).queryByText("—")).not.toBeInTheDocument();
  });

  it("renders a genuinely zero metric as 0, never as blank", () => {
    render(<PostsTable data={[post({ id: "a", likes: 0, comments: 0, interactions: 0 })]} />);

    expect(within(bodyRows()[0]!).getAllByText("0")).toHaveLength(3);
  });
});

describe("asset type", () => {
  it("shows the human label, never a raw scraper token", () => {
    render(
      <PostsTable data={[post({ id: "a", format: "SLIDE_SHOW", formatLabel: "Slide show" })]} />,
    );

    expect(screen.getByText("Slide show")).toBeInTheDocument();
    expect(screen.queryByText("SLIDE_SHOW")).not.toBeInTheDocument();
  });

  it("shows UNKNOWN as a real format, not as an error state", () => {
    render(<PostsTable data={[post({ id: "a", format: "UNKNOWN", formatLabel: "Unknown" })]} />);

    expect(screen.getByText("Unknown")).toBeInTheDocument();
    // A post with no attribute record is a normal row, not a broken one.
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });
});

describe("sorting", () => {
  const mixed = [
    post({ id: "mid", snippet: "Post mid", impressions: 500, likes: 5, saves: 7 }),
    post({ id: "top", snippet: "Post top", impressions: 900, likes: 1, saves: null }),
    post({ id: "low", snippet: "Post low", impressions: 100, likes: 9, saves: 2 }),
  ];

  it("opens with the highest impressions first — the question this screen answers", () => {
    render(<PostsTable data={mixed} />);

    // The seam hands the rows over already sorted; this pins that the default
    // sorting state agrees with them rather than reordering on mount.
    expect(snippets()).toEqual(["Post top", "Post mid", "Post low"]);
  });

  it("sorts every numeric column, in both directions", async () => {
    const user = userEvent.setup();
    render(<PostsTable data={mixed} />);

    await user.click(screen.getByRole("button", { name: "Sort by likes" }));
    expect(snippets()).toEqual(["Post low", "Post mid", "Post top"]); // 9, 5, 1

    await user.click(screen.getByRole("button", { name: "Sort by likes" }));
    expect(snippets()).toEqual(["Post top", "Post mid", "Post low"]); // 1, 5, 9
  });

  it("parks an UNREPORTED metric last in BOTH directions", async () => {
    const user = userEvent.setup();
    render(<PostsTable data={mixed} />);
    const sortSaves = screen.getByRole("button", { name: "Sort by saves" });

    // THE RULE: `—` is missing information, not an extreme value. Asserting both
    // directions is what discriminates — a naive comparator flips it to the top
    // on the second click.
    await user.click(sortSaves);
    expect(snippets()).toEqual(["Post mid", "Post low", "Post top"]); // 7, 2, —

    await user.click(sortSaves);
    expect(snippets()).toEqual(["Post low", "Post mid", "Post top"]); // 2, 7, —

    expect(snippets().at(-1)).toBe("Post top");
  });

  it("sorts the Date column by the report's windowing key, undatable rows last", async () => {
    const user = userEvent.setup();
    render(
      <PostsTable
        data={[
          post({
            id: "older",
            snippet: "Post older",
            date: "2026-06-01",
            sortMs: Date.parse("2026-06-01"),
          }),
          post({ id: "ghost", snippet: "Post ghost", date: null, age: "23h", sortMs: null }),
          post({
            id: "newer",
            snippet: "Post newer",
            date: "2026-07-20",
            sortMs: Date.parse("2026-07-20"),
          }),
        ]}
      />,
    );
    const sortDate = screen.getByRole("button", { name: "Sort by date" });

    // Opens DESCENDING — TanStack's default for a numeric key, and the useful
    // one here: "what went out most recently" is the question being asked.
    await user.click(sortDate);
    expect(snippets()).toEqual(["Post newer", "Post older", "Post ghost"]);

    await user.click(sortDate);
    expect(snippets()).toEqual(["Post older", "Post newer", "Post ghost"]);

    // Both directions park the undatable post last. A `sortMs` of null left to
    // sort as a value would land at epoch 0 and claim to be the oldest post.
    expect(snippets().at(-1)).toBe("Post ghost");
  });

  it("does NOT offer a sort on the Post column", () => {
    render(<PostsTable data={mixed} />);

    // Sorting posts by their opening words answers no question anyone has.
    expect(screen.queryByRole("button", { name: /sort by post$/i })).not.toBeInTheDocument();
  });
});
