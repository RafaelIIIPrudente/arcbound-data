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
  },
}));

vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.in = (_column: string, ids: string[]) => {
        state.queries.push(ids);
        return q;
      };
      q.then = (resolve: (v: unknown) => unknown) => {
        const index = state.queries.length - 1;
        const data = state.dataQueue.length > 0 ? (state.dataQueue[index] ?? []) : state.data;
        return Promise.resolve({ data, error: state.error }).then(resolve);
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

  it("never exceeds the chunk size on any single query", async () => {
    await listPostAttributes(Array.from({ length: 501 }, (_, i) => `p${i}`));

    expect(state.queries).toHaveLength(2);
    for (const chunk of state.queries) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE);
    }
  });
});
