import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hermetic: mock the Supabase server client + cookies so nothing hits the DB. ─
const { state } = vi.hoisted(() => ({
  state: {
    data: [] as unknown,
    error: null as { message: string } | null,
    fromCalls: [] as string[],
    eqCalls: [] as unknown[][],
    orderCalls: [] as unknown[][],
    selectColumns: [] as string[],
  },
}));
vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    // A FRESH chainable per query: paged reads build every page before any
    // resolves, so a shared cursor would serve them all the same range and the
    // merge would look correct while being wrong.
    from: (t: string) => {
      state.fromCalls.push(t);
      const chain: Record<string, unknown> = {};
      let from = 0;
      // ⚠️ The implicit window PostgREST applies when no range is asked for.
      // Modelling this cap is what lets the regression guard below fail against
      // an unpaged read — the real database returns 1000 rows and a 200, with
      // no error and no signal that anything was left behind.
      let to = PAGE_SIZE - 1;
      let wantsCount = false;
      chain.select = (columns?: unknown, opts?: { count?: string }) => {
        if (typeof columns === "string") state.selectColumns.push(columns);
        if (opts?.count === "exact") wantsCount = true;
        return chain;
      };
      chain.range = (f: number, t2: number) => {
        from = f;
        to = t2;
        return chain;
      };
      chain.eq = (...a: unknown[]) => {
        state.eqCalls.push(a);
        return chain;
      };
      chain.order = (...a: unknown[]) => {
        state.orderCalls.push(a);
        return chain;
      };
      chain.then = (resolve: (v: unknown) => unknown) => {
        const all = Array.isArray(state.data) ? state.data : [];
        return Promise.resolve({
          data: state.error ? null : all.slice(from, to + 1),
          error: state.error,
          count: wantsCount ? all.length : null,
        }).then(resolve);
      };
      return chain;
    },
  }),
}));

import { MAX_PAGES, PAGE_SIZE } from "@/lib/supabase/paged";

import { latestUploadByClient, listAllUploads, listUploads } from "./uploads";

const dbRow = (id: string, createdAt: string, over: Record<string, unknown> = {}) => ({
  id,
  client_id: "c1",
  source_type: "csv",
  rows_inserted: 5,
  rows_updated: 2,
  rows_unchanged: 1,
  follower_count: 18420,
  connections_count: 3120,
  created_at: createdAt,
  ...over,
});

beforeEach(() => {
  state.data = [];
  state.error = null;
  state.fromCalls = [];
  state.eqCalls = [];
  state.orderCalls = [];
  state.selectColumns = [];
});

describe("listUploads", () => {
  it("reads public.uploads for the client, newest-first, mapped snake→camel", async () => {
    state.data = [
      dbRow("u1", "2026-07-16T09:12:00.000Z"),
      dbRow("u2", "2026-07-10T08:00:00.000Z", {
        source_type: "json",
        follower_count: null,
        connections_count: null,
      }),
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
      connectionsCount: 3120,
      createdAt: "2026-07-16T09:12:00.000Z",
    });
    expect(uploads![1]!.sourceType).toBe("json");
    expect(uploads![1]!.followerCount).toBeNull();
    expect(uploads![1]!.connectionsCount).toBeNull();
  });

  it("ASKS THE DATABASE for connections_count — a column left out of the select is a permanent gap", async () => {
    // ⚠️ THE COLUMN LIST IS THE CONTRACT. PostgREST returns exactly what it is
    // asked for, so a `connections_count` missing from UPLOAD_COLUMNS would map
    // to `undefined` → null on every row: an entire feature reading as "never
    // recorded" with no error anywhere to explain it.
    state.data = [dbRow("u1", "2026-07-16T09:12:00.000Z")];

    await listUploads("c1");

    expect(state.selectColumns.join(" ")).toContain("connections_count");
  });

  it("keeps a MISSING connections count absent — never 0", async () => {
    // A scrape that carried no connection count is not a Client with zero
    // connections. The seam preserves that distinction; every display path
    // downstream depends on it.
    state.data = [dbRow("u1", "2026-07-16T09:12:00.000Z", { connections_count: null })];

    const uploads = await listUploads("c1");

    expect(uploads![0]!.connectionsCount).toBeNull();
    expect(uploads![0]!.connectionsCount).not.toBe(0);
  });

  it("keeps a GENUINE zero connections count as 0 — it is a measurement, not a gap", async () => {
    state.data = [dbRow("u1", "2026-07-16T09:12:00.000Z", { connections_count: 0 })];

    const uploads = await listUploads("c1");

    expect(uploads![0]!.connectionsCount).toBe(0);
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

  // ───────────────────────────────────────────────────────────────────────────
  // THE REGRESSION GUARD.
  //
  // `listUploads` read the whole of one client's history with no `.range()`, so
  // above PostgREST's cap it returned 1000 rows and a 200. `follower-trend.ts`
  // now sits on this read, and a capped result would SHORTEN a follower series
  // while the chart presented it as the client's whole history — the oldest
  // readings dropping off the left of a timeline nobody could tell was cropped.
  // ───────────────────────────────────────────────────────────────────────────
  it("reads EVERY upload past the 1000-row response cap, not just the first page", async () => {
    state.data = Array.from({ length: PAGE_SIZE + 200 }, (_, i) =>
      dbRow(`u${i}`, `2026-07-16T09:12:00.000Z`),
    );

    const uploads = await listUploads("c1");

    expect(uploads).toHaveLength(PAGE_SIZE + 200);
    // 1000 is precisely the number the defect produced.
    expect(uploads).not.toHaveLength(PAGE_SIZE);
  });

  // ⚠️ A NON-UNIQUE SORT KEY IS WORSE THAN A SHORT READ. Pages are issued
  // CONCURRENTLY, so ties are free to reorder between requests and a row can
  // land in two ranges or in neither — a silently WRONG set, not a short one.
  it("orders by a UNIQUE key so concurrent pages cannot overlap or skip", async () => {
    state.data = Array.from({ length: PAGE_SIZE + 5 }, (_, i) =>
      dbRow(`u${i}`, "2026-07-16T09:12:00.000Z"),
    );

    await listUploads("c1");

    expect(state.orderCalls).toContainEqual(["created_at", { ascending: false }]);
    // `created_at` alone is not a total order — two uploads can share a
    // timestamp, which this fixture deliberately makes true of every row.
    expect(state.orderCalls).toContainEqual(["id", { ascending: true }]);
  });

  it("still filters to the one client when paged", async () => {
    state.data = Array.from({ length: PAGE_SIZE + 5 }, (_, i) =>
      dbRow(`u${i}`, "2026-07-16T09:12:00.000Z"),
    );

    await listUploads("c1");

    expect(state.eqCalls).toContainEqual(["client_id", "c1"]);
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

  // ───────────────────────────────────────────────────────────────────────────
  // THE REGRESSION GUARD.
  //
  // This read is NEWEST-FIRST and was unpaged, so PostgREST's 1000-row cap
  // silently dropped the OLDEST rows — and with them, entire dormant clients.
  // A client whose only upload sat past the cap came back absent from the map,
  // which the Client List renders as "Never" ingested.
  //
  // That is the exact "we don't know" / "confirmed zero" collapse the ⚠️ comment
  // on this function warns against, reintroduced by the paging it lacked.
  // ───────────────────────────────────────────────────────────────────────────
  it("finds a dormant client whose only upload sits BEYOND the first page", async () => {
    state.data = [
      // 1200 recent uploads from a busy client fill page 0 and spill into page 1.
      ...Array.from({ length: PAGE_SIZE + 200 }, (_, i) =>
        dbRow(`busy${i}`, "2026-07-16T09:00:00.000Z", { client_id: "busy" }),
      ),
      // The dormant client's single, oldest upload — last in newest-first order.
      dbRow("old1", "2025-01-05T09:00:00.000Z", { client_id: "dormant" }),
    ];

    const latest = await latestUploadByClient();

    // Against the unpaged read this was `undefined`, and the Client List said
    // "Never" — asserting a fact it did not have.
    expect(latest?.get("dormant")).toBe("2025-01-05T09:00:00.000Z");
    expect(latest?.get("busy")).toBe("2026-07-16T09:00:00.000Z");
    expect(latest?.size).toBe(2);
  });

  // ⚠️ Same rule as postsCount: a truncated read is NO answer, not a smaller
  // one. A partial map would tell the table that every client beyond the cap has
  // never been ingested.
  it("returns NULL when the read is TRUNCATED, never a partial map", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.data = Array.from({ length: MAX_PAGES * PAGE_SIZE + 1 }, (_, i) =>
      dbRow(`u${i}`, "2026-07-16T09:00:00.000Z", { client_id: `c${i}` }),
    );

    expect(await latestUploadByClient()).toBeNull();
    warn.mockRestore();
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

describe("listAllUploads — a FAILED read and an OVERSIZED one are different facts", () => {
  // ⚠️ TWO FACTS THAT USED TO SHARE ONE CHANNEL. Both a read that FAILED and one
  // too large to read in full return `null` — safe, because neither ever prints a
  // wrong number — but they license different sentences on screen ("could not be
  // read" vs "too many uploads to read at once"). The optional outcome lets a
  // caller tell them apart without disturbing the `Upload[] | null` contract that
  // the Data Quality audit and the cross-client comparison already read.
  it("returns the full audit and reports NOT truncated on a complete read", async () => {
    state.data = [
      dbRow("u1", "2026-07-16T09:12:00.000Z"),
      dbRow("u2", "2026-07-10T08:00:00.000Z", { client_id: "c2" }),
    ];
    const outcome = { truncated: false };

    const uploads = await listAllUploads(outcome);

    expect(uploads).toHaveLength(2);
    expect(outcome.truncated).toBe(false);
  });

  it("returns null AND flags truncated=true when the audit is OVERSIZED", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.data = Array.from({ length: MAX_PAGES * PAGE_SIZE + 1 }, (_, i) =>
      dbRow(`u${i}`, "2026-07-16T09:00:00.000Z", { client_id: `c${i}` }),
    );
    const outcome = { truncated: false };

    const uploads = await listAllUploads(outcome);

    // Null, EXACTLY as a failure — a partial audit must never render as complete.
    expect(uploads).toBeNull();
    // ...but the caller can now SAY it was oversized, not unreadable.
    expect(outcome.truncated).toBe(true);
    warn.mockRestore();
  });

  it("returns null AND leaves truncated=false when the read FAILED", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.error = { message: "permission denied" };
    const outcome = { truncated: false };

    const uploads = await listAllUploads(outcome);

    expect(uploads).toBeNull();
    // A FAILED read is not an oversized one — this is the distinction the
    // invariant requires, and the two null returns above are what made it
    // invisible before.
    expect(outcome.truncated).toBe(false);
    warn.mockRestore();
  });

  it("keeps the existing Upload[] | null contract when called with NO outcome", async () => {
    // The Data Quality audit and the cross-client comparison call it with no
    // argument and must keep getting exactly `Upload[] | null` — a partial audit
    // stays `null` (unavailable) for them, never a complete-looking result.
    state.data = [dbRow("u1", "2026-07-16T09:12:00.000Z")];
    expect(await listAllUploads()).toHaveLength(1);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.error = { message: "permission denied" };
    expect(await listAllUploads()).toBeNull();
    warn.mockRestore();
  });
});
