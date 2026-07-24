import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_PAGES, PAGE_SIZE, readAllPages, type PageReader } from "./paged";

// ── No Supabase here at all. `readAllPages` takes a `PageReader`, so it can be
// tested against a plain function — which is the point of the seam. ───────────

interface Row {
  id: number;
}

/** Every `(from, to, opts)` the pager asked for, in call order. */
let calls: { from: number; to: number; count?: string }[] = [];

/**
 * A reader over `total` rows that MODELS POSTGREST: it serves exactly the slice
 * asked for, and reports the exact count only when page 0 requests it.
 *
 * `countOverride` fakes a server that ignored the count option (null) or
 * reported a different total than it can actually serve.
 */
function reader(
  total: number,
  opts: { countOverride?: number | null; errorOnPage?: number; throwOnPage?: number } = {},
): PageReader<Row> {
  const all: Row[] = Array.from({ length: total }, (_, i) => ({ id: i }));
  return (from, to, pageOpts) => {
    const page = from / PAGE_SIZE;
    calls.push({ from, to, count: pageOpts?.count });
    if (opts.throwOnPage === page) throw new Error(`page ${page} exploded`);
    if (opts.errorOnPage === page) {
      return Promise.resolve({ data: null, error: { message: `page ${page} failed` } });
    }
    return Promise.resolve({
      data: all.slice(from, to + 1),
      error: null,
      count:
        pageOpts?.count === "exact"
          ? opts.countOverride === undefined
            ? total
            : opts.countOverride
          : null,
    });
  };
}

beforeEach(() => {
  calls = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("readAllPages", () => {
  it("issues ONE request for a table that fits in a single page", async () => {
    const result = await readAllPages(reader(12), "table");

    expect(result).toEqual({ rows: expect.any(Array), unavailable: false, truncated: false });
    expect(result.rows).toHaveLength(12);
    expect(calls).toEqual([{ from: 0, to: PAGE_SIZE - 1, count: "exact" }]);
  });

  it("asks for an EXACT count, on page 0 ONLY", async () => {
    await readAllPages(reader(PAGE_SIZE * 2 + 5), "table");

    // "planned"/"estimated" are PostgREST's cheap approximations, and an
    // under-estimate would compute too few pages and drop rows in silence —
    // exactly the failure this paging exists to prevent.
    expect(calls.map((c) => c.count)).toEqual(["exact", undefined, undefined]);
  });

  it("assembles every page IN ORDER across an exact multi-page read", async () => {
    const result = await readAllPages(reader(PAGE_SIZE * 2 + 5), "table");

    expect(result.rows).toHaveLength(PAGE_SIZE * 2 + 5);
    // Row ORDER, not just the count: `Promise.all` preserves INPUT order, and a
    // construct that resolved out of order would keep the count right while
    // scrambling the rows.
    expect(result.rows.map((r) => r.id)).toEqual(
      Array.from({ length: PAGE_SIZE * 2 + 5 }, (_, i) => i),
    );
    expect(calls.map((c) => [c.from, c.to])).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
      [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1],
    ]);
  });

  it("requests no second page when the total lands EXACTLY on a page boundary", async () => {
    const result = await readAllPages(reader(PAGE_SIZE), "table");

    // An off-by-one here would cost a pointless empty round-trip on every read
    // of a table that happens to be a clean multiple of the page size.
    expect(calls).toHaveLength(1);
    expect(result.rows).toHaveLength(PAGE_SIZE);
  });

  it("falls back to page 0's own length when the server reports a NULL count", async () => {
    // A null count means the option was ignored. Guessing at a total would be
    // inventing one; what page 0 actually returned is the only thing known.
    const result = await readAllPages(reader(PAGE_SIZE, { countOverride: null }), "table");

    expect(calls).toHaveLength(1);
    expect(result.rows).toHaveLength(PAGE_SIZE);
    expect(result.unavailable).toBe(false);
  });

  it("flags UNAVAILABLE — with no rows — when page 0 errors", async () => {
    const result = await readAllPages(reader(PAGE_SIZE * 3, { errorOnPage: 0 }), "table");

    expect(result).toEqual({ rows: [], unavailable: true, truncated: false });
    // Nothing else was attempted: page 0 carries the count that sizes the rest.
    expect(calls).toHaveLength(1);
  });

  it("fails the WHOLE read when a LATE page errors, never returning its siblings", async () => {
    const result = await readAllPages(reader(PAGE_SIZE * 3, { errorOnPage: 2 }), "table");

    // ⚠️ THE ASSERTION THIS MODULE EXISTS FOR. Supabase RESOLVES with `{ error }`
    // rather than rejecting, so page 2 arrives looking like a normal result
    // while pages 0 and 1 hold 2000 real rows. Returning those would report a
    // partial table as a complete one — worse than an unavailable banner,
    // because it looks like data.
    expect(result.rows).toEqual([]);
    expect(result.unavailable).toBe(true);
    // ...and it really did read the siblings successfully, so this is not
    // passing because nothing was fetched.
    expect(calls).toHaveLength(3);
  });

  it("degrades rather than throwing when the reader itself throws", async () => {
    const result = await readAllPages(reader(10, { throwOnPage: 0 }), "table");

    expect(result).toEqual({ rows: [], unavailable: true, truncated: false });
    expect(console.warn).toHaveBeenCalled();
  });

  it("caps at MAX_PAGES and reports TRUNCATED — a successful but incomplete read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await readAllPages(reader(MAX_PAGES * PAGE_SIZE + 1), "bi.linkedin_post_latest");

    expect(calls).toHaveLength(MAX_PAGES);
    expect(result.rows).toHaveLength(MAX_PAGES * PAGE_SIZE);
    // NOT unavailable: the read worked. The rows are real, just incomplete —
    // three distinct outcomes, and callers must keep them apart.
    expect(result.unavailable).toBe(false);
    expect(result.truncated).toBe(true);

    // The console warning is for operators; the flag is what lets a screen say
    // it is incomplete. A warning alone was the old behaviour, and it meant a
    // truncated read still rendered as a complete one.
    const message = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(message).toContain("bi.linkedin_post_latest");
    expect(message).toContain(String(MAX_PAGES * PAGE_SIZE));
    warn.mockRestore();
  });

  it("does NOT flag truncated at exactly the cap — the flag must mean something", async () => {
    const result = await readAllPages(reader(MAX_PAGES * PAGE_SIZE), "table");

    expect(result.rows).toHaveLength(MAX_PAGES * PAGE_SIZE);
    expect(result.truncated).toBe(false);
  });

  it("labels its warnings with the caller's noun, never a raw builder detail", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await readAllPages(reader(10, { errorOnPage: 0 }), "public.uploads");

    expect(String(warn.mock.calls[0]?.[0])).toContain("public.uploads");
    warn.mockRestore();
  });

  it("returns an empty, available result for a genuinely empty table", async () => {
    const result = await readAllPages(reader(0), "table");

    // Empty and available — distinct from empty and unavailable, which is the
    // distinction every caller of this module is built around.
    expect(result).toEqual({ rows: [], unavailable: false, truncated: false });
  });
});
