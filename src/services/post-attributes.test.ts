import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostAttributes } from "@/services/types";

// ── Mocks: keep the suite hermetic — never touch the live DB. ────────────────
const { state } = vi.hoisted(() => ({
  state: {
    /** The id list passed to each `.in()` call, in order — one entry per query. */
    queries: [] as string[][],
    /** Per-query rows; falls back to `data` when empty. */
    dataQueue: [] as unknown[][],
    data: [] as unknown[],
    error: null as { message: string } | null,
    /** Per-query error by chunk index; falls back to `error` when empty. */
    errorQueue: [] as (null | { message: string })[],
    /** Set to make every query REJECT rather than resolve with an error. */
    rejectWith: null as string | null,
    /** Concurrency probe — see `peakInFlight`. */
    inFlight: 0,
    /** The most queries outstanding at once. Serial execution can never exceed 1. */
    peakInFlight: 0,
  },
}));

vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      // Captured PER QUERY at `.in()` time. Reading `queries.length - 1` inside
      // `then` gave the right index only while the chunks ran one at a time;
      // once they are all issued before any resolves, every query would read the
      // LAST index and take the wrong slice of `dataQueue`.
      let index = -1;
      q.select = () => q;
      q.in = (_column: string, ids: string[]) => {
        state.queries.push(ids);
        index = state.queries.length - 1;
        return q;
      };
      q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        state.inFlight += 1;
        state.peakInFlight = Math.max(state.peakInFlight, state.inFlight);

        const data = state.dataQueue.length > 0 ? (state.dataQueue[index] ?? []) : state.data;
        const error = state.errorQueue.length > 0 ? (state.errorQueue[index] ?? null) : state.error;

        // Resolve on a LATER macrotask so overlap is observable. Resolving
        // synchronously would drain each query before the next was issued, and
        // peak in-flight would read 1 even for a fully concurrent caller —
        // making the concurrency assertion below pass for the wrong reason.
        return new Promise((r) => setTimeout(r, 0))
          .then(() => {
            state.inFlight -= 1;
            // A genuine transport failure REJECTS; a query error RESOLVES with
            // `{ error }`. The seam has to survive both.
            if (state.rejectWith !== null) throw new Error(state.rejectWith);
            return { data, error };
          })
          .then(resolve, reject);
      };
      return q;
    },
  }),
}));

import { CHUNK_SIZE, listPostAttributes, toFormatMap } from "./post-attributes";

function row(id: string, format: string | null): PostAttributes {
  return {
    linkedin_post_id: id,
    post_format_type: format,
    recorded_at: "2026-07-22T00:00:00.000Z",
  };
}

beforeEach(() => {
  state.queries = [];
  state.dataQueue = [];
  state.data = [];
  state.error = null;
  state.errorQueue = [];
  state.rejectWith = null;
  state.inFlight = 0;
  state.peakInFlight = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("toFormatMap (pure)", () => {
  it("maps each post id to its RAW format value", () => {
    const map = toFormatMap([row("a", "DOCUMENT"), row("b", "image")]);
    expect(map.get("a")).toBe("DOCUMENT");
    // Raw casing is preserved — never normalised on the way through (ADR 0009).
    expect(map.get("b")).toBe("image");
    expect(map.size).toBe(2);
  });

  it("omits rows with no recorded format", () => {
    const map = toFormatMap([row("a", "VIDEO"), row("b", null)]);
    expect(map.has("b")).toBe(false);
    expect(map.size).toBe(1);
  });

  it("returns an empty map for no rows", () => {
    expect(toFormatMap([]).size).toBe(0);
  });
});

describe("listPostAttributes", () => {
  it("returns the matching rows for a small id list in one query", async () => {
    state.data = [row("a", "DOCUMENT")];

    const result = await listPostAttributes(["a"]);

    expect(result).toHaveLength(1);
    expect(result[0]!.post_format_type).toBe("DOCUMENT");
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0]).toEqual(["a"]);
  });

  it("degrades to [] on a query error instead of throwing", async () => {
    state.error = { message: "permission denied" };

    await expect(listPostAttributes(["a"])).resolves.toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it("issues no query at all for an empty id list", async () => {
    await expect(listPostAttributes([])).resolves.toEqual([]);
    expect(state.queries).toHaveLength(0);
  });

  it("splits more than 500 ids across multiple queries and merges the results", async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `p${i}`);
    // One row back per chunk so we can prove the merge.
    state.dataQueue = [[row("p0", "DOCUMENT")], [row("p500", "VIDEO")], [row("p1000", "POLL")]];

    const result = await listPostAttributes(ids);

    expect(state.queries).toHaveLength(3);
    expect(state.queries[0]).toHaveLength(CHUNK_SIZE);
    expect(state.queries[1]).toHaveLength(CHUNK_SIZE);
    expect(state.queries[2]).toHaveLength(1200 - 2 * CHUNK_SIZE);
    // Every chunk's rows are merged into one flat result.
    expect(result.map((r) => r.linkedin_post_id)).toEqual(["p0", "p500", "p1000"]);
  });

  it("issues its chunks CONCURRENTLY, not one after another", async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `p${i}`);

    await listPostAttributes(ids);

    // Peak in-flight is the whole discriminator. Serial execution can only ever
    // have ONE query outstanding, so this reads 1 under a `for`-await loop and 3
    // once the chunks go out together. Asserting the query COUNT instead would
    // pass under both implementations and prove nothing.
    expect(state.queries).toHaveLength(3);
    expect(state.peakInFlight).toBe(3);
  });

  it("returns [] when a LATER chunk fails, never the earlier chunks' rows", async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `p${i}`);
    state.dataQueue = [[row("p0", "DOCUMENT")], [row("p500", "VIDEO")], [row("p1000", "POLL")]];
    // The case concurrency creates: with every chunk in flight at once, two have
    // already succeeded by the time the third reports an error. Handing back
    // those two would be a silent partial result — something the serial version,
    // which short-circuited on the first failure, could never produce.
    state.errorQueue = [null, null, { message: "statement timeout" }];

    await expect(listPostAttributes(ids)).resolves.toEqual([]);
    expect(console.warn).toHaveBeenCalledWith("Failed to load post attributes: statement timeout");
  });

  it("degrades to [] rather than throwing when a query REJECTS outright", async () => {
    // Supabase resolves with `{ error }` for query errors, so this covers the
    // other path: a genuine transport failure, which must still be caught.
    state.rejectWith = "socket hang up";

    await expect(
      listPostAttributes(Array.from({ length: 1200 }, (_, i) => `p${i}`)),
    ).resolves.toEqual([]);
    expect(console.warn).toHaveBeenCalledWith("Failed to load post attributes: socket hang up");
  });

  it("never exceeds the chunk size on any single query", async () => {
    await listPostAttributes(Array.from({ length: 501 }, (_, i) => `p${i}`));

    expect(state.queries).toHaveLength(2);
    for (const chunk of state.queries) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE);
    }
  });
});
