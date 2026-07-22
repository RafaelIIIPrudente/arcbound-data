import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hermetic: mock the Supabase server client + cookies so nothing hits the DB. ─
const { state } = vi.hoisted(() => ({
  state: {
    data: [] as unknown,
    error: null as { message: string } | null,
    fromCalls: [] as string[],
    eqCalls: [] as unknown[][],
    orderCalls: [] as unknown[][],
  },
}));
vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (...a: unknown[]) => {
      state.eqCalls.push(a);
      return chain;
    };
    chain.order = (...a: unknown[]) => {
      state.orderCalls.push(a);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: state.data, error: state.error }).then(resolve);
    return {
      from: (t: string) => {
        state.fromCalls.push(t);
        return chain;
      },
    };
  },
}));

import { latestUploadByClient, listUploads } from "./uploads";

const dbRow = (id: string, createdAt: string, over: Record<string, unknown> = {}) => ({
  id,
  client_id: "c1",
  source_type: "csv",
  rows_inserted: 5,
  rows_updated: 2,
  rows_unchanged: 1,
  follower_count: 18420,
  created_at: createdAt,
  ...over,
});

beforeEach(() => {
  state.data = [];
  state.error = null;
  state.fromCalls = [];
  state.eqCalls = [];
  state.orderCalls = [];
});

describe("listUploads", () => {
  it("reads public.uploads for the client, newest-first, mapped snake→camel", async () => {
    state.data = [
      dbRow("u1", "2026-07-16T09:12:00.000Z"),
      dbRow("u2", "2026-07-10T08:00:00.000Z", { source_type: "json", follower_count: null }),
    ];

    const uploads = await listUploads("c1");

    expect(state.fromCalls).toContain("uploads");
    expect(state.eqCalls).toContainEqual(["client_id", "c1"]);
    expect(state.orderCalls).toContainEqual(["created_at", { ascending: false }]);

    // A successful read is never null — that value is reserved for failure.
    expect(uploads).not.toBeNull();
    expect(uploads).toHaveLength(2);
    expect(uploads![0]).toEqual({
      id: "u1",
      clientId: "c1",
      sourceType: "csv",
      rowsInserted: 5,
      rowsUpdated: 2,
      rowsUnchanged: 1,
      followerCount: 18420,
      createdAt: "2026-07-16T09:12:00.000Z",
    });
    expect(uploads![1]!.sourceType).toBe("json");
    expect(uploads![1]!.followerCount).toBeNull();
  });

  it("returns an EMPTY ARRAY when the client genuinely has no uploads", async () => {
    state.data = [];

    // A real answer: the read succeeded and found nothing.
    expect(await listUploads("c1")).toEqual([]);
  });

  // ⚠️ THIS TEST USED TO ASSERT `[]` AND ENCODED THE SAME DEFECT AS postsCount.
  //
  // A failed read and a client with no uploads both produced `[]`, so the detail
  // page rendered "0 uploads" and "No uploads yet" for a broken read — stating a
  // fact it did not have.
  it("returns NULL — not [] — on a read error, so callers can tell the difference", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.error = { message: "permission denied" };

    const uploads = await listUploads("c1");

    expect(uploads).toBeNull();
    expect(uploads).not.toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("latestUploadByClient", () => {
  it("returns the NEWEST upload per client from ONE query", async () => {
    // Newest-first, interleaved across clients — the reduce must keep the first
    // it sees per client, not the last.
    state.data = [
      dbRow("u4", "2026-07-16T09:00:00.000Z", { client_id: "c2" }),
      dbRow("u3", "2026-07-15T09:00:00.000Z", { client_id: "c1" }),
      dbRow("u2", "2026-07-02T09:00:00.000Z", { client_id: "c2" }),
      dbRow("u1", "2026-06-01T09:00:00.000Z", { client_id: "c1" }),
    ];

    const latest = await latestUploadByClient();

    // ⚠️ THE POINT OF THIS FUNCTION. One round-trip for every client — calling
    // `listUploads` per row would be an N+1.
    expect(state.fromCalls).toEqual(["uploads"]);
    expect(state.orderCalls).toContainEqual(["created_at", { ascending: false }]);

    expect(latest?.get("c1")).toBe("2026-07-15T09:00:00.000Z");
    expect(latest?.get("c2")).toBe("2026-07-16T09:00:00.000Z");
  });

  it("stays ONE query as the client count grows", async () => {
    state.data = Array.from({ length: 250 }, (_, i) =>
      dbRow(`u${i}`, `2026-07-16T09:00:00.000Z`, { client_id: `c${i}` }),
    );

    const latest = await latestUploadByClient();

    expect(latest?.size).toBe(250);
    // 250 clients, still one read. This is the assertion that would fail if
    // anyone "simplified" this back into a per-client call.
    expect(state.fromCalls).toHaveLength(1);
  });

  it("returns an EMPTY MAP when no client has ever been ingested", async () => {
    state.data = [];

    // Empty map, NOT null: the read succeeded and the answer is genuinely
    // "nobody has uploaded". The table shows those clients as Never.
    expect(await latestUploadByClient()).toEqual(new Map());
  });

  it("returns NULL (not an empty map) when the read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.error = { message: "permission denied" };

    // ⚠️ The whole reason this returns a nullable. An empty map would tell the
    // table every client has never been ingested — a broken read rendered as
    // a confident fact.
    expect(await latestUploadByClient()).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
