import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks: hermetic — a proxy stands in for the Supabase query builder so no
// call touches the live DB. Each builder method returns the same chainable, and
// awaiting it resolves to the per-test result. ────────────────────────────────
const { supabase, probe } = vi.hoisted(() => ({
  supabase: { current: null as unknown },
  /** Concurrency probe: queries outstanding now, and the most at once. */
  probe: { inFlight: 0, peak: 0 },
}));
vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => supabase.current }));

import { MAX_PAGES, PAGE_SIZE } from "@/lib/supabase/paged";

import { createClient, getClient, listClients, setClientIndustryWriter } from "./clients";

/**
 * A chainable that MODELS POSTGREST'S 1000-ROW RESPONSE CAP.
 *
 * ⚠️ THE CAP IS THE WHOLE POINT. A request with no `.range()` gets the first
 * PAGE_SIZE rows and a 200 — no error, no signal. That is exactly what the real
 * database does, and modelling it is what lets the regression guards below fail
 * against an unpaged read instead of passing against every implementation.
 *
 * Array `data` is served as pages; anything else (a `maybeSingle` row, a
 * head-count result, an error shape) passes straight through.
 */
/**
 * Every `.order(...)` applied, TAGGED WITH ITS TABLE.
 *
 * ⚠️ THE TAG IS LOAD-BEARING. `latestUploadByClient` already orders
 * `public.uploads` by `id`, so an untagged list let an assertion about the
 * CLIENTS read pass on the uploads read's call — a test green for the wrong
 * reason, which is worse than a red one.
 */
let orderCalls: { table: string; args: unknown[] }[] = [];

/** Every `.insert(...)` issued, tagged with its table. */
let insertCalls: { table: string; payload: unknown }[] = [];

/** Every `supabase.rpc(name, args)` issued, WITH its arguments. */
let rpcArgs: { name: string; args: unknown }[] = [];

/** The `.order(...)` calls issued against one table. */
function ordersOn(table: string): unknown[][] {
  return orderCalls.filter((c) => c.table === table).map((c) => c.args);
}

/**
 * Every `supabase.rpc(name)` issued, in order.
 *
 * ⚠️ COUNTED, NOT JUST RECORDED. The staff directory is ONE read for a whole
 * page of clients; resolving a writer per row would be an N+1 that produces the
 * identical output, so only the call COUNT can tell the two implementations
 * apart. Asserting on the resolved emails would pass under both.
 */
let rpcCalls: string[] = [];

function chainable(result: unknown, table = "?"): unknown {
  const q: Record<string, unknown> = {};
  let from = 0;
  // The implicit window PostgREST applies when the caller asks for no range.
  let to = PAGE_SIZE - 1;
  let wantsCount = false;

  q.select = (_columns?: unknown, opts?: { count?: string }) => {
    if (opts?.count === "exact") wantsCount = true;
    return q;
  };
  q.range = (f: number, t: number) => {
    from = f;
    to = t;
    return q;
  };
  // Recorded, not just swallowed: a paged read's order key must be UNIQUE, and
  // the only way to assert that is to see what was asked for.
  q.order = (...a: unknown[]) => {
    orderCalls.push({ table, args: a });
    return q;
  };
  // ⚠️ `insert` RECORDS ITS PAYLOAD. `createClient` now writes four columns in
  // ONE statement (D7); asserting "insert was called" would pass for a version
  // that dropped two of them, which is the whole thing worth checking.
  q.insert = (payload: unknown) => {
    insertCalls.push({ table, payload });
    return q;
  };
  for (const method of ["eq", "or", "in", "maybeSingle", "single", "limit"]) {
    q[method] = () => q;
  }
  q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
    probe.inFlight += 1;
    probe.peak = Math.max(probe.peak, probe.inFlight);
    // Settled on a LATER macrotask so overlap is observable. Resolving
    // immediately would drain each query before the next was issued, and
    // peak in-flight would read 1 even for a fully concurrent caller.
    return new Promise((r) => setTimeout(r, 0))
      .then(() => {
        probe.inFlight -= 1;
        const payload = result as { data?: unknown; error?: unknown };
        if (!Array.isArray(payload.data)) return result;
        return {
          data: payload.data.slice(from, to + 1),
          error: payload.error ?? null,
          count: wantsCount ? payload.data.length : null,
        };
      })
      .then(resolve, reject);
  };
  return q;
}

/**
 * `from` is TABLE-AWARE: `listClients` now reads `public.clients` AND
 * `public.uploads`, so one shared result would let an uploads assertion pass on
 * the clients payload. `uploadsResult` defaults to an empty, successful read.
 */
function mockSupabase(
  clientsResult: unknown,
  biResult: unknown,
  uploadsResult: unknown = { data: [], error: null },
  directoryResult: unknown = { data: [], error: null },
) {
  supabase.current = {
    from: (table: string) => chainable(table === "uploads" ? uploadsResult : clientsResult, table),
    schema: () => ({ from: (t: string) => chainable(biResult, t) }),
    // Routed through the same `chainable`, so the directory joins the
    // concurrency probe below rather than being invisible to it.
    rpc: (name: string, args?: unknown) => {
      rpcCalls.push(name);
      rpcArgs.push({ name, args });
      return chainable(directoryResult, `rpc:${name}`);
    },
  };
}

const UPLOAD = (clientId: string, createdAt: string) => ({
  id: `u-${clientId}`,
  client_id: clientId,
  source_type: "csv",
  rows_inserted: 1,
  rows_updated: 0,
  rows_unchanged: 0,
  follower_count: null,
  created_at: createdAt,
});

/**
 * A `public.clients` row AS POSTGREST RETURNS IT — including the embedded
 * industry, which arrives as a nested object (or `null`) rather than an id.
 * Both new fields default to unset, which is what every existing Client is.
 */
const ROW = (
  id: string,
  name: string,
  over: { industry?: { id: string; name: string } | null; writer_id?: string | null } = {},
) => ({
  id,
  name,
  linkedin_profile_url: `https://linkedin.com/in/${name.toLowerCase().replace(/\s/g, "")}`,
  created_at: "2026-07-16T00:00:00.000Z",
  industry: null,
  writer_id: null,
  ...over,
});

const WRITER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WRITER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const WRITER_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SAAS = { id: "ind-1", name: "SaaS" };

/** A successful `list_staff_directory()` read. */
const DIRECTORY = (...entries: [string, string][]) => ({
  data: entries.map(([user_id, email]) => ({ user_id, email })),
  error: null,
});

beforeEach(() => {
  supabase.current = null;
  probe.inFlight = 0;
  probe.peak = 0;
  orderCalls = [];
  rpcCalls = [];
  insertCalls = [];
  rpcArgs = [];
});

describe("clients service (real seam)", () => {
  it("lists clients, mapping linkedin_profile_url and joining bi post counts", async () => {
    mockSupabase(
      { data: [ROW("c1", "Bryan Wish"), ROW("c2", "Priya Nadella")], error: null },
      { data: [{ client_id: "c1" }, { client_id: "c1" }, { client_id: "c2" }], error: null },
    );

    const { items, total } = await listClients();
    expect(total).toBe(2);
    const bryan = items.find((c) => c.id === "c1")!;
    expect(bryan.name).toBe("Bryan Wish");
    expect(bryan.linkedin_url).toBe("https://linkedin.com/in/bryanwish");
    expect(bryan.postsCount).toBe(2); // two bi rows for c1
    expect(items.find((c) => c.id === "c2")!.postsCount).toBe(1);
  });

  it("filters by query (name or url)", async () => {
    mockSupabase(
      { data: [ROW("c1", "Bryan Wish"), ROW("c2", "Priya Nadella")], error: null },
      { data: [], error: null },
    );
    const { items } = await listClients({ q: "priya" });
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe("Priya Nadella");
  });

  // ⚠️ THIS TEST USED TO ASSERT `0` AND ENCODED THE DEFECT.
  //
  // A failed `bi` read and a client with no posts both produced `0`, so the
  // table rendered a broken pipeline and an empty client with the same glyph.
  // `null` now means "could not read"; `0` means a real, successfully-read zero.
  it("reports postsCount as NULL — not 0 — when the bi view is unreachable", async () => {
    mockSupabase(
      { data: [ROW("c1", "Bryan Wish")], error: null },
      { data: null, error: { message: "schema bi is not exposed" } },
    );

    const { items } = await listClients();

    expect(items[0]!.postsCount).toBeNull();
    // Nailed down explicitly: a reader skimming `toBeNull()` could otherwise
    // assume the old zero still satisfies it.
    expect(items[0]!.postsCount).not.toBe(0);
  });

  it("reports a REAL zero as 0, distinguishable from an unreadable count", async () => {
    // The bi read SUCCEEDS and simply attributes no rows to this client.
    mockSupabase({ data: [ROW("c1", "Bryan Wish")], error: null }, { data: [], error: null });

    const { items } = await listClients();

    expect(items[0]!.postsCount).toBe(0);
    expect(items[0]!.postsCount).not.toBeNull();
  });

  it("attaches each client's newest upload, and NULL for one never ingested", async () => {
    mockSupabase(
      { data: [ROW("c1", "Bryan Wish"), ROW("c2", "Priya Nadella")], error: null },
      { data: [], error: null },
      {
        data: [UPLOAD("c1", "2026-07-15T09:00:00.000Z"), UPLOAD("c1", "2026-06-01T09:00:00.000Z")],
        error: null,
      },
    );

    const { items } = await listClients();

    expect(items.find((c) => c.id === "c1")!.lastUpload).toBe("2026-07-15T09:00:00.000Z");
    // Read succeeded, this client simply has no uploads → a known "never".
    expect(items.find((c) => c.id === "c2")!.lastUpload).toBeNull();
  });

  it("marks lastUpload UNAVAILABLE — not 'never' — when the uploads read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSupabase(
      { data: [ROW("c1", "Bryan Wish")], error: null },
      { data: [], error: null },
      { data: null, error: { message: "permission denied" } },
    );

    const { items } = await listClients();

    // Same principle as postsCount: a failed read must not masquerade as a fact.
    expect(items[0]!.lastUpload).toBe("unavailable");
    warn.mockRestore();
  });

  it("gets a client by id (null when absent)", async () => {
    mockSupabase({ data: ROW("c1", "Bryan Wish"), error: null }, { count: 5, error: null });
    const found = await getClient("c1");
    expect(found).toMatchObject({ id: "c1", name: "Bryan Wish", postsCount: 5 });

    mockSupabase({ data: null, error: null }, { count: 0, error: null });
    expect(await getClient("missing")).toBeNull();
  });

  it("fetches the rows, the counts, the latest uploads and the directory CONCURRENTLY", async () => {
    mockSupabase(
      { data: [ROW("c1", "Bryan Wish")], error: null },
      { data: [{ client_id: "c1" }], error: null },
      { data: [UPLOAD("c1", "2026-07-15T09:00:00.000Z")], error: null },
    );

    await listClients();

    // None of `fetchPostCounts`, `latestUploadByClient` or `staffEmailsById`
    // reads anything out of the client select, so none needed to wait. Peak
    // in-flight is 1 if they are serialised and 4 when all four go out together.
    //
    // Counting PEAK rather than total is what makes this discriminate: a serial
    // implementation issues the same four queries and would pass a total.
    //
    // ⚠️ WAS 3 BEFORE THE STAFF DIRECTORY JOINED THEM. The number rising is the
    // proof that the new read was added to the existing `Promise.all` rather
    // than awaited after it — a fourth serial round-trip on every page.
    expect(probe.peak).toBe(4);
  });

  it("fetches the client row, its post count and the directory CONCURRENTLY", async () => {
    mockSupabase({ data: ROW("c1", "Bryan Wish"), error: null }, { count: 5, error: null });

    await getClient("c1");

    // The count filters on the id ARGUMENT and the directory is the whole staff
    // roster, so neither needed the select's result. Peak in-flight is the
    // discriminator: 1 when they await the row, 3 once all three go out
    // together. Asserting the query count would pass under both and prove
    // nothing.
    //
    // ⚠️ WAS 2 BEFORE THE STAFF DIRECTORY JOINED THEM — and `getClient` runs on
    // the upload path, so a read appended serially here would add a round-trip
    // to every upload as well as every page view.
    expect(probe.peak).toBe(3);
  });

  it("still returns null for a missing client, though the count now runs anyway", async () => {
    mockSupabase({ data: null, error: null }, { count: 0, error: null });

    // Issuing a count for a client that turns out not to exist is wasted work,
    // not a behaviour change — the caller still sees null.
    expect(await getClient("missing")).toBeNull();
  });

  it("throws the CLIENT query's error, not the count's silence", async () => {
    // Error precedence is the thing parallelising could quietly change:
    // `countForClient` swallows its own failures and returns 0, so the select's
    // error must still be the one that surfaces, with the same message.
    mockSupabase(
      { data: null, error: { message: "denied" } },
      { count: null, error: { message: "schema bi is not exposed" } },
    );

    await expect(getClient("c1")).rejects.toThrow(/Failed to load client: denied/);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE REGRESSION GUARD.
  //
  // `fetchPostCounts` read `bi.linkedin_post_latest` with no `.range()`. Above
  // PostgREST's 1000-row cap the response was silently short, so every Client
  // List post count understated — while the client DETAIL page stayed right,
  // because it uses `count: "exact", head: true`. Two screens disagreeing, and
  // neither saying so.
  //
  // This fixture crosses the cap on purpose. Against the unpaged read it
  // reported 1000; it must report all 1500.
  // ───────────────────────────────────────────────────────────────────────────
  it("counts EVERY post past the 1000-row response cap, not just the first page", async () => {
    const biRows = [
      ...Array.from({ length: PAGE_SIZE + 200 }, () => ({ client_id: "c1" })),
      ...Array.from({ length: 300 }, () => ({ client_id: "c2" })),
    ];
    mockSupabase(
      { data: [ROW("c1", "Bryan Wish"), ROW("c2", "Priya Nadella")], error: null },
      { data: biRows, error: null },
    );

    const { items } = await listClients();

    expect(items.find((c) => c.id === "c1")!.postsCount).toBe(PAGE_SIZE + 200);
    expect(items.find((c) => c.id === "c2")!.postsCount).toBe(300);
    // Nailed down explicitly: 1000 is precisely the number the defect produced,
    // and a reader skimming the assertion above could miss why it matters.
    expect(items.find((c) => c.id === "c1")!.postsCount).not.toBe(PAGE_SIZE);
  });

  // ⚠️ A TRUNCATED READ IS NOT A SMALLER ANSWER — IT IS NO ANSWER.
  //
  // Past MAX_PAGES the rows are a prefix, so every count built from them is
  // wrong while looking entirely plausible. `null` already means "we don't
  // know" throughout this seam, and that is the honest value here.
  it("reports postsCount as NULL when the bi read is TRUNCATED, never a partial count", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSupabase(
      { data: [ROW("c1", "Bryan Wish")], error: null },
      {
        data: Array.from({ length: MAX_PAGES * PAGE_SIZE + 1 }, () => ({ client_id: "c1" })),
        error: null,
      },
    );

    const { items } = await listClients();

    expect(items[0]!.postsCount).toBeNull();
    // Not a plausible-looking 50000 either — a capped total is still a claim.
    expect(items[0]!.postsCount).not.toBe(MAX_PAGES * PAGE_SIZE);
    warn.mockRestore();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ⚠️ THIS ONE WAS WORSE THAN A SHORT READ: IT PAGINATED IN MEMORY.
  //
  // `listClients` read the whole `clients` table with no `.range()`, then sliced
  // the result for the requested page. Above the cap, page 2 of the Clients
  // screen was built from a set that never contained page 2's rows — so the
  // screen showed a total it could not show the rows for.
  // ───────────────────────────────────────────────────────────────────────────
  it("reads EVERY client past the 1000-row response cap, not just the first page", async () => {
    const rows = Array.from({ length: PAGE_SIZE + 200 }, (_, i) => ROW(`c${i}`, `Client ${i}`));
    mockSupabase({ data: rows, error: null }, { data: [], error: null });

    const { total } = await listClients({ pageSize: 10 });

    expect(total).toBe(PAGE_SIZE + 200);
    expect(total).not.toBe(PAGE_SIZE);
  });

  it("can reach a page that lies beyond the response cap", async () => {
    // The in-memory `.slice()` is the sharp edge: this page's rows only exist
    // if the read went past 1000 in the first place.
    const rows = Array.from({ length: PAGE_SIZE + 200 }, (_, i) => ROW(`c${i}`, `Client ${i}`));
    mockSupabase({ data: rows, error: null }, { data: [], error: null });

    const { items } = await listClients({ page: 111, pageSize: 10 });

    expect(items).toHaveLength(10);
    expect(items[0]!.id).toBe("c1100");
  });

  // ⚠️ PRESENCE OF AN ORDER IS NOT ENOUGH — IT MUST BE UNIQUE. `created_at`
  // alone ties across clients created in the same transaction, and concurrent
  // ranges are free to reorder ties between requests.
  it("orders by a UNIQUE key so concurrent pages cannot overlap or skip", async () => {
    const rows = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => ROW(`c${i}`, `Client ${i}`));
    mockSupabase({ data: rows, error: null }, { data: [], error: null });

    await listClients();

    // Scoped to the CLIENTS read: `latestUploadByClient` orders `uploads` by
    // `id` already, and an unscoped assertion would pass on that instead.
    expect(ordersOn("clients")).toContainEqual(["created_at", { ascending: false }]);
    expect(ordersOn("clients")).toContainEqual(["id", { ascending: true }]);
  });

  it("still THROWS on a failed clients read — the contract callers rely on", async () => {
    mockSupabase({ data: null, error: { message: "denied" } }, { data: [], error: null });

    await expect(listClients()).rejects.toThrow(/Failed to load clients: denied/);
  });

  it("creates a client (name + linkedin_profile_url) with no dedup", async () => {
    mockSupabase({ data: ROW("new", "Nadia Vega"), error: null }, { data: [], error: null });
    const created = await createClient({
      name: "Nadia Vega",
      linkedin_url: "https://linkedin.com/in/nadiavega",
    });
    expect(created).toMatchObject({ id: "new", name: "Nadia Vega", postsCount: 0 });
    expect(created.linkedin_url).toBe("https://linkedin.com/in/nadiavega");
  });

  it("throws when the clients query errors", async () => {
    mockSupabase({ data: null, error: { message: "denied" } }, { data: [], error: null });
    await expect(listClients()).rejects.toThrow(/Failed to load clients: denied/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INDUSTRY AND WRITER (S2).
//
// ⚠️ THE HAZARD THIS BLOCK GUARDS IS NOT IN THIS MODULE — IT IS IN WHAT CALLS
// IT. `getClient` stopped being a display read when the name-match gate started
// calling it before every upload write: `checkAuthorNames` catches its throw and
// degrades to `{ status: "unchecked" }`, so the upload proceeds WITHOUT the
// check that exists because fourteen posts were lost. A new read inside
// `getClient` that can throw therefore does not surface as an error anyone sees
// — it silently switches the gate off.
//
// So the directory read is swallowed, and the tests below are how that stays
// true: one asserts `getClient` RESOLVES when the directory throws, and one
// asserts the failure is still visible in the writer's state rather than being
// laundered into "nobody assigned".
// ─────────────────────────────────────────────────────────────────────────────
describe("industry and writer resolve through the client reads", () => {
  it("reads NOT-ASSIGNED as a fact, not as an error, when neither is set", async () => {
    mockSupabase({ data: ROW("c1", "Bryan Wish"), error: null }, { count: 0, error: null });

    const client = await getClient("c1");

    // Every Client that existed before this slice is exactly this row: both
    // columns NULL, meaning "not recorded yet" — which is true, and is not a
    // failure of any kind.
    expect(client!.industry).toBeNull();
    expect(client!.writer).toBeNull();
  });

  it("resolves both when both are set", async () => {
    mockSupabase(
      { data: ROW("c1", "Bryan Wish", { industry: SAAS, writer_id: WRITER_A }), error: null },
      { count: 3, error: null },
      { data: [], error: null },
      DIRECTORY([WRITER_A, "ada@arcbound.com"]),
    );

    const client = await getClient("c1");

    expect(client!.industry).toEqual({ id: "ind-1", name: "SaaS" });
    expect(client!.writer).toEqual({
      status: "resolved",
      userId: WRITER_A,
      email: "ada@arcbound.com",
    });
  });

  it("resolves both on the LIST too", async () => {
    mockSupabase(
      {
        data: [
          ROW("c1", "Bryan Wish", { industry: SAAS, writer_id: WRITER_A }),
          ROW("c2", "Priya Nadella"),
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
      DIRECTORY([WRITER_A, "ada@arcbound.com"]),
    );

    const { items } = await listClients();

    const bryan = items.find((c) => c.id === "c1")!;
    expect(bryan.industry).toEqual(SAAS);
    expect(bryan.writer).toMatchObject({ status: "resolved", email: "ada@arcbound.com" });
    expect(items.find((c) => c.id === "c2")!.writer).toBeNull();
  });

  it("⚠️ filters by INDUSTRY NAME, so “how many clients in SaaS” has an answer", async () => {
    // ⚠️ D6, WHICH DISPLAYING THE COLUMN DOES NOT SATISFY ON ITS OWN. The page's
    // caption counts what this returns, so filtering to an industry IS the count
    // — "how many clients in SaaS" is one of the two questions these fields
    // exist to answer, and the decision record says it must be answerable from
    // the list rather than a detail page.
    mockSupabase(
      {
        data: [
          ROW("c1", "Bryan Wish", { industry: SAAS }),
          ROW("c2", "Priya Nadella", { industry: { id: "ind-9", name: "Fintech" } }),
          ROW("c3", "Nobody Recorded"),
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
      DIRECTORY(),
    );

    const { items, total } = await listClients({ q: "saas" });

    expect(items.map((c) => c.name)).toEqual(["Bryan Wish"]);
    // The total is what the caption prints — it must be the FILTERED count.
    expect(total).toBe(1);
  });

  it("keeps the name and URL matches it already had", async () => {
    mockSupabase(
      {
        data: [ROW("c1", "Bryan Wish", { industry: SAAS }), ROW("c2", "Priya Nadella")],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
      DIRECTORY(),
    );

    const { items } = await listClients({ q: "priya" });
    expect(items.map((c) => c.name)).toEqual(["Priya Nadella"]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ⚠️ THE ONE THAT PROTECTS THE UPLOAD GATE.
  // ───────────────────────────────────────────────────────────────────────────
  it("⚠️ STILL RESOLVES when the staff directory read FAILS — getClient must not throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSupabase(
      { data: ROW("c1", "Bryan Wish", { writer_id: WRITER_A }), error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: null, error: { message: "permission denied for function list_staff_directory" } },
    );

    // Asserted as `resolves`, not by reading the value: a rejection here would
    // reach `checkAuthorNames`, be caught, and turn the name-match gate off for
    // that upload. The absence of a throw IS the behaviour under test.
    await expect(getClient("c1")).resolves.not.toBeNull();

    const client = await getClient("c1");
    expect(client!.name).toBe("Bryan Wish");
    warn.mockRestore();
  });

  it("marks a writer UNAVAILABLE — not absent — when the directory read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSupabase(
      { data: ROW("c1", "Bryan Wish", { writer_id: WRITER_A }), error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: null, error: { message: "permission denied" } },
    );

    const client = await getClient("c1");

    // Same principle as postsCount and lastUpload: a failed read must not
    // masquerade as a fact. "Nobody writes for this client" is a claim, and it
    // is not the one the database made.
    expect(client!.writer).toEqual({ status: "unavailable", userId: WRITER_A });
    expect(client!.writer).not.toBeNull();
    warn.mockRestore();
  });

  it("keeps ASSIGNED-BUT-UNRESOLVABLE apart from a FAILED directory read", async () => {
    // ⚠️ THESE TWO CALL FOR OPPOSITE ACTIONS, WHICH IS WHY THEY ARE NOT MERGED.
    // `unavailable` is about ArcBase — the read broke, the assignment is
    // probably fine, try again. `unknown` is about the data — this id is in no
    // staff account, so somebody must reassign the client. Collapsing them tells
    // an admin to retry when a reassignment is needed, or to reassign when
    // nothing is wrong.
    mockSupabase(
      { data: ROW("c1", "Bryan Wish", { writer_id: WRITER_A }), error: null },
      { count: 0, error: null },
      { data: [], error: null },
      DIRECTORY([WRITER_B, "someone.else@arcbound.com"]),
    );

    const client = await getClient("c1");

    expect(client!.writer).toEqual({ status: "unknown", userId: WRITER_A });
  });

  it("reads NOBODY-ASSIGNED as null even when the directory read failed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSupabase(
      { data: ROW("c1", "Bryan Wish"), error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: null, error: { message: "permission denied" } },
    );

    const client = await getClient("c1");

    // "No writer is assigned" is known from the client row ALONE — `writer_id`
    // is null — so a broken directory cannot make that fact uncertain. Reporting
    // "unavailable" here would invent a doubt the data does not have.
    expect(client!.writer).toBeNull();
    warn.mockRestore();
  });

  it("still resolves an ARCHIVED industry — retiring one must not break its clients", async () => {
    // `set_industry_status` archives an industry so it stops being OFFERED; the
    // clients already recorded in it are still in it. The read follows the
    // foreign key, not the status, so nothing about a Client changes when their
    // industry is retired.
    mockSupabase(
      {
        data: ROW("c1", "Bryan Wish", { industry: { id: "ind-9", name: "Fax Machines" } }),
        error: null,
      },
      { count: 0, error: null },
    );

    const client = await getClient("c1");

    expect(client!.industry).toEqual({ id: "ind-9", name: "Fax Machines" });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ⚠️ ONE READ PER PAGE, NOT ONE PER ROW.
  // ───────────────────────────────────────────────────────────────────────────
  it("⚠️ issues ONE staff-directory read for a whole page of clients", async () => {
    mockSupabase(
      {
        data: [
          ROW("c1", "Bryan Wish", { writer_id: WRITER_A }),
          ROW("c2", "Priya Nadella", { writer_id: WRITER_B }),
          ROW("c3", "Nadia Vega", { writer_id: WRITER_C }),
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
      DIRECTORY(
        [WRITER_A, "ada@arcbound.com"],
        [WRITER_B, "priya@arcbound.com"],
        [WRITER_C, "nadia@arcbound.com"],
      ),
    );

    const { items } = await listClients();

    // THE assertion: three clients, three DISTINCT writers, ONE read. Resolving
    // per row returns the identical emails below, so only this count separates
    // the two implementations — the same reason `latestUploadByClient` is one
    // query rather than one per row.
    expect(rpcCalls.filter((n) => n === "list_staff_directory")).toHaveLength(1);
    expect(items.map((c) => (c.writer as { email?: string } | null)?.email)).toEqual([
      "ada@arcbound.com",
      "priya@arcbound.com",
      "nadia@arcbound.com",
    ]);
  });

  it("does not change WHICH error surfaces from listClients", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The clients select fails AND the directory fails. Error precedence is
    // unchanged: the directory swallows its own failure, so the select's message
    // is still the only one that can reach the caller.
    mockSupabase(
      { data: null, error: { message: "denied" } },
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: { message: "permission denied for function" } },
    );

    await expect(listClients()).rejects.toThrow(/Failed to load clients: denied/);
    warn.mockRestore();
  });

  it("does not change WHICH error surfaces from getClient", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSupabase(
      { data: null, error: { message: "denied" } },
      { count: null, error: { message: "schema bi is not exposed" } },
      { data: [], error: null },
      { data: null, error: { message: "permission denied for function" } },
    );

    await expect(getClient("c1")).rejects.toThrow(/Failed to load client: denied/);
    warn.mockRestore();
  });
});

describe("getClient's memoisation is REQUEST-scoped", () => {
  // A SOURCE GUARD, for the reason spelled out in src/lib/auth/session.test.ts:
  // React's `cache()` only memoises inside a server render, and vitest has no
  // render context, so the memo itself is not behaviourally testable here. What
  // matters and IS testable is that it never becomes cross-request — which for a
  // read this cookie-bound would move an RLS boundary into application code.
  const source = readFileSync(join(process.cwd(), "src/services/clients.ts"), "utf8");

  // Comments stripped: the doc comment NAMES `unstable_cache` to warn against
  // it, and matching raw text would flag that warning as the violation.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("uses React cache(), not a cross-request store", () => {
    expect(code).toMatch(/import\s*\{\s*cache\s*\}\s*from\s*["']react["']/);
    expect(code).toMatch(/export const getClient = cache\(/);
    expect(code).not.toMatch(/unstable_cache/);
  });

  it("strips comments without stripping the code it is checking", () => {
    // Guard the guard: proves the stripping left real code behind rather than
    // emptying the file and passing vacuously.
    expect(code).toContain("countForClient(supabase, id)");
    expect(code).not.toContain("move an RLS-enforced boundary");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CAPTURE (S4) — writing the two fields S2 taught this seam to read.
//
// ⚠️ THE FUNCTION THESE GUARD APPLIES BOTH ARGUMENTS, INCLUDING NULL. There is
// no partial update: whatever a caller omits is CLEARED, with no error and no
// trace. Everything below exists to make an omission loud.
// ─────────────────────────────────────────────────────────────────────────────

describe("createClient — industry and writer at registration (D7)", () => {
  it("⚠️ carries BOTH ids in ONE insert, not a second write", async () => {
    // ⚠️ ONE STATEMENT IS THE DECISION, NOT A DETAIL. Registering a Client is
    // already two writes with a four-outcome result including
    // `created_services_failed` — "the Client EXISTS but is broken on arrival, and
    // retrying would duplicate it". A separate industry/writer write would add
    // another such outcome; folding both into the insert adds none.
    mockSupabase(
      { data: ROW("new", "Nadia Vega", { industry: SAAS, writer_id: WRITER_A }), error: null },
      { data: [], error: null },
      { data: [], error: null },
      DIRECTORY([WRITER_A, "ana@arcbound.com"]),
    );

    await createClient({
      name: "Nadia Vega",
      linkedin_url: "https://linkedin.com/in/nadiavega",
      industry_id: "ind-1",
      writer_id: WRITER_A,
    });

    const inserts = insertCalls.filter((call) => call.table === "clients");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.payload).toMatchObject({
      name: "Nadia Vega",
      industry_id: "ind-1",
      writer_id: WRITER_A,
    });
  });

  it("registers a Client with neither recorded — both are optional", async () => {
    // "Not recorded" is legitimate and must not be a validation failure: an
    // engagement can be registered before either is known.
    mockSupabase({ data: ROW("new", "Nadia Vega"), error: null }, { data: [], error: null });

    const created = await createClient({
      name: "Nadia Vega",
      linkedin_url: "https://linkedin.com/in/nadiavega",
    });

    expect(created.industry).toBeNull();
    expect(created.writer).toBeNull();
    const inserts = insertCalls.filter((call) => call.table === "clients");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.payload).toMatchObject({ industry_id: null, writer_id: null });
  });

  it("⚠️ does NOT report a just-assigned writer as `unknown`", async () => {
    // ⚠️ TRAP 3. This function used to end `toClient(row, 0, new Map())`, and the
    // empty map was honest ONLY because the insert set neither column. Now that it
    // can set `writer_id`, an empty map resolves that writer to `unknown` — which
    // in this codebase means "assigned to an id no staff account matches, a human
    // must reassign". That would be a false alarm about a writer the admin just
    // successfully assigned, manufactured by the create path itself.
    mockSupabase(
      { data: ROW("new", "Nadia Vega", { writer_id: WRITER_A }), error: null },
      { data: [], error: null },
      { data: [], error: null },
      DIRECTORY([WRITER_A, "ana@arcbound.com"]),
    );

    const created = await createClient({
      name: "Nadia Vega",
      linkedin_url: "https://linkedin.com/in/nadiavega",
      writer_id: WRITER_A,
    });

    expect(created.writer).toEqual({
      status: "resolved",
      userId: WRITER_A,
      email: "ana@arcbound.com",
    });
  });

  it("⚠️ says `unavailable`, never `unknown`, when the directory read fails", async () => {
    // The two are different facts. "We could not look it up" is true; "that id
    // matches no staff account" would be an accusation we cannot support.
    mockSupabase(
      { data: ROW("new", "Nadia Vega", { writer_id: WRITER_A }), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: { message: "denied" } },
    );

    const created = await createClient({
      name: "Nadia Vega",
      linkedin_url: "https://linkedin.com/in/nadiavega",
      writer_id: WRITER_A,
    });

    expect(created.writer).toEqual({ status: "unavailable", userId: WRITER_A });
  });

  it("does not read the directory when no writer was assigned", async () => {
    // Nothing to look up, and `toWriter` answers `null` from the row alone — so
    // the empty map stays honest for exactly the case it was written for.
    mockSupabase({ data: ROW("new", "Nadia Vega"), error: null }, { data: [], error: null });

    await createClient({ name: "Nadia Vega", linkedin_url: "https://linkedin.com/in/nadiavega" });

    expect(rpcCalls).not.toContain("list_staff_directory");
  });
});

describe("setClientIndustryWriter", () => {
  it("⚠️ sends BOTH values on every call, including nulls", async () => {
    mockSupabase({ data: null, error: null }, { data: [], error: null });

    await setClientIndustryWriter("client-1", "ind-1", null);

    expect(rpcArgs).toEqual([
      {
        name: "set_client_industry_writer",
        args: { p_client_id: "client-1", p_industry_id: "ind-1", p_writer_id: null },
      },
    ]);
  });

  it("surfaces the function's own refusal verbatim", async () => {
    // ⚠️ `set_client_industry_writer` writes its refusals itself ('admin role
    // required', 'unknown client %'). Replacing them with a generic message would
    // throw away the only explanation the admin gets.
    mockSupabase({ data: null, error: null }, { data: [], error: null });
    supabase.current = {
      ...(supabase.current as object),
      rpc: () => Promise.resolve({ data: null, error: { message: "admin role required" } }),
    } as typeof supabase.current;

    await expect(setClientIndustryWriter("client-1", null, null)).rejects.toThrow(
      "admin role required",
    );
  });
});
