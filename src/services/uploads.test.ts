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

import { listUploads } from "./uploads";

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

    expect(uploads).toHaveLength(2);
    expect(uploads[0]).toEqual({
      id: "u1",
      clientId: "c1",
      sourceType: "csv",
      rowsInserted: 5,
      rowsUpdated: 2,
      rowsUnchanged: 1,
      followerCount: 18420,
      createdAt: "2026-07-16T09:12:00.000Z",
    });
    expect(uploads[1]!.sourceType).toBe("json");
    expect(uploads[1]!.followerCount).toBeNull();
  });

  it("returns [] when there are no uploads", async () => {
    state.data = [];
    expect(await listUploads("c1")).toEqual([]);
  });

  it("degrades to [] (does not throw) on a read error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.error = { message: "permission denied" };

    const uploads = await listUploads("c1");

    expect(uploads).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
