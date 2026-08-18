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
  over: {
    industry?: { id: string; name: string } | null;
    writer?: { id: string; name: string } | null;
  } = {},
) => ({
  id,
  name,
  linkedin_profile_url: `https://linkedin.com/in/${name.toLowerCase().replace(/\s/g, "")}`,
  created_at: "2026-07-16T00:00:00.000Z",
  // ⚠️ BOTH ARRIVE AS NESTED OBJECTS NOW. `writer_id` used to be a bare uuid
  // resolved by a second read; it is a PostgREST embed over the foreign key,
  // exactly like `industry` (D15).
  industry: null,
  writer: null,
  ...over,
});

const WRITER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WRITER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const WRITER_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SAAS = { id: "ind-1", name: "SaaS" };

const ADA = { id: WRITER_A, name: "Ada Lovelace" };
const GRACE = { id: WRITER_B, name: "Grace Hopper" };

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

  it("fetches the rows, the counts and the latest uploads CONCURRENTLY", async () => {
    mockSupabase(
      { data: [ROW("c1", "Bryan Wish")], error: null },
      { data: [{ client_id: "c1" }], error: null },
      { data: [UPLOAD("c1", "2026-07-15T09:00:00.000Z")], error: null },
    );

    await listClients();

    // Neither `fetchPostCounts` nor `latestUploadByClient` reads anything out of
    // the client select, so neither needed to wait. Peak in-flight is 1 if they
    // are serialised and 3 when all three go out together.
    //
    // Counting PEAK rather than total is what makes this discriminate: a serial
    // implementation issues the same three queries and would pass a total.
    //
    // ⚠️ WAS 4 AND IS NOW 3, AND THE FALL IS THE POINT. The staff directory read
    // is gone: the writer rides the client select as an embed, so the page makes
    // one fewer round-trip (D15). A 4 here would mean a directory read survived.
    expect(probe.peak).toBe(3);
  });

  it("fetches the client row and its post count CONCURRENTLY", async () => {
    mockSupabase({ data: ROW("c1", "Bryan Wish"), error: null }, { count: 5, error: null });

    await getClient("c1");

    // The count filters on the id ARGUMENT, so it never needed the select's
    // result. Peak in-flight is the discriminator: 1 when the count awaits the
    // row, 2 when both go out together. Asserting the query count would pass
    // under both and prove nothing.
    //
    // ⚠️ WAS 3 AND IS NOW 2. `getClient` runs on the upload path, so the removed
    // directory read is a round-trip saved on every upload as well as every page
    // view (D15).
    expect(probe.peak).toBe(2);
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
      { data: ROW("c1", "Bryan Wish", { industry: SAAS, writer: ADA }), error: null },
      { count: 3, error: null },
      { data: [], error: null },
      { data: [], error: null },
    );

    const client = await getClient("c1");

    expect(client!.industry).toEqual({ id: "ind-1", name: "SaaS" });
    // ⚠️ THE SAME SHAPE AS THE INDUSTRY BESIDE IT, which is the whole of D15:
    // both are registry rows carried by an embed over a foreign key.
    expect(client!.writer).toEqual(ADA);
  });

  it("resolves both on the LIST too", async () => {
    mockSupabase(
      {
        data: [
          ROW("c1", "Bryan Wish", { industry: SAAS, writer: ADA }),
          ROW("c2", "Priya Nadella"),
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );

    const { items } = await listClients();

    const bryan = items.find((c) => c.id === "c1")!;
    expect(bryan.industry).toEqual(SAAS);
    expect(bryan.writer).toEqual(ADA);
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
      { data: [], error: null },
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
      { data: [], error: null },
    );

    const { items } = await listClients({ q: "priya" });
    expect(items.map((c) => c.name)).toEqual(["Priya Nadella"]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ⚠️ FOUR TESTS ABOUT THE STAFF DIRECTORY WERE DELETED HERE, AND THIS IS THE
  // CONSTRUCT THAT MAKES EACH OF THEIR CASES IMPOSSIBLE.
  //
  //   • "STILL RESOLVES when the staff directory read FAILS"
  //   • "marks a writer UNAVAILABLE — not absent — when the directory read fails"
  //   • "keeps ASSIGNED-BUT-UNRESOLVABLE apart from a FAILED directory read"
  //   • "reads NOBODY-ASSIGNED as null even when the directory read failed"
  //
  // All four constructed a FAILED OR INCOMPLETE SECOND READ and asserted which
  // of four writer states came out. There is no second read: `staffEmailsById`
  // and `listStaffDirectory` are gone, and `getClient` issues exactly two
  // queries (asserted above, `probe.peak` is 2 — a third would fail it). The
  // writer arrives inside the client SELECT as an embed over the foreign key, so
  // it cannot fail on its own, and `ClientWriter` is `{ id, name }` — it has no
  // `status`, so `{ status: "unavailable", userId }` is a COMPILE error rather
  // than a fixture. Nothing about a writer can be half-read any more.
  //
  // ⚠️ WHAT THOSE TESTS ALSO PROTECTED IS NOT LOST, AND IS NOT PROVED HERE. The
  // reason they were written is that `getClient` feeds the upload name-match
  // gate: `checkAuthorNames` catches any throw and degrades to "could not
  // check", so a reader that could reject would silently switch that gate off.
  // Moving the writer INTO the select changes the shape of that risk rather than
  // removing it — an embed PostgREST cannot resolve fails the whole select. That
  // is a live concern, not a unit-testable one; see the reload-and-load-/clients
  // step in supabase/WRITERS-REGISTRY-APPLY.md.
  // ───────────────────────────────────────────────────────────────────────────

  it("reads NOBODY-ASSIGNED as null, which is a fact about the row itself", async () => {
    mockSupabase({ data: ROW("c1", "Bryan Wish"), error: null }, { count: 0, error: null });

    const client = await getClient("c1");

    // ⚠️ `null` SURVIVED THE COLLAPSE INTACT. Nobody has been recorded — known
    // from the client row alone, exactly as an unrecorded industry is.
    expect(client!.writer).toBeNull();
  });

  it("⚠️ still resolves an ARCHIVED writer — retiring one must not break their clients", async () => {
    // The twin of the industry assertion below. `set_writer_status` archives a
    // writer so they stop being OFFERED; the Clients already recorded against
    // them are still recorded. The read follows the foreign key, not the status,
    // so nothing about a Client changes when their writer is retired — which is
    // what makes archiving the right tool when somebody leaves.
    mockSupabase(
      { data: ROW("c1", "Bryan Wish", { writer: GRACE }), error: null },
      { count: 0, error: null },
    );

    const client = await getClient("c1");

    expect(client!.writer).toEqual(GRACE);
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
  it("⚠️ resolves a whole page of writers with NO extra read at all", async () => {
    // ⚠️ DELETED AND REPLACED: "issues ONE staff-directory read for a whole page
    // of clients". That test counted `list_staff_directory` calls to catch an
    // N+1 — three clients, three distinct writers, one read. There is no read to
    // count now: the writer rides each row in the client SELECT itself, so the
    // N+1 it guarded against cannot be written. Its successor is the peak-in-
    // flight assertion above, which is 3 and would be 4 if any directory read
    // came back.
    //
    // ⚠️ THE CONSTRUCT: `staffEmailsById` and `listStaffDirectory` are deleted,
    // and `CLIENT_COLUMNS` carries `writer:writers(id, name)`. Nothing in the
    // client seam can issue a per-row writer read, because nothing in it reads
    // writers at all — asserted as ZERO rpc calls, which is strictly stronger
    // than the "exactly one" the old test could manage.
    mockSupabase(
      {
        data: [
          ROW("c1", "Bryan Wish", { writer: ADA }),
          ROW("c2", "Priya Nadella", { writer: GRACE }),
          ROW("c3", "Nadia Vega"),
        ],
        error: null,
      },
      { data: [], error: null },
    );

    const { items } = await listClients();

    expect(rpcCalls).toEqual([]);
    expect(items.map((c) => c.writer)).toEqual([ADA, GRACE, null]);
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
      { data: ROW("new", "Nadia Vega", { industry: SAAS, writer: ADA }), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
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

  it("⚠️ returns the writer it just recorded, read back from the inserted row", async () => {
    // ⚠️ TWO TESTS WERE DELETED HERE AND THIS ONE REPLACES BOTH:
    //   • "does NOT report a just-assigned writer as `unknown`"
    //   • "says `unavailable`, never `unknown`, when the directory read fails"
    //
    // Both existed because `createClient` had to resolve a writer through a
    // SECOND read after the insert. Against an empty directory map an
    // assigned writer came back `unknown` — "a human must reassign" — a false
    // alarm about a writer the admin had just successfully set; and a failed
    // directory read had to come back `unavailable` rather than `unknown`.
    //
    // ⚠️ THE CONSTRUCT: the insert's own `.select(CLIENT_COLUMNS)` returns the
    // writer embedded, so the value is read from the row that was written. There
    // is no map to be empty and no directory read to fail, and `ClientWriter`
    // has neither `status` nor `userId`, so both deleted assertions are compile
    // errors rather than judgement calls.
    mockSupabase(
      { data: ROW("new", "Nadia Vega", { writer: ADA }), error: null },
      {
        data: [],
        error: null,
      },
    );

    const created = await createClient({
      name: "Nadia Vega",
      linkedin_url: "https://linkedin.com/in/nadiavega",
      writer_id: WRITER_A,
    });

    expect(created.writer).toEqual(ADA);
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
