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

import { createClient, getClient, listClients } from "./clients";

/** A chainable that resolves to `result` no matter which builder methods are called. */
function chainable(result: unknown): unknown {
  const proxy: unknown = new Proxy(() => proxy, {
    get(_t, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        probe.inFlight += 1;
        probe.peak = Math.max(probe.peak, probe.inFlight);
        // Settled on a LATER macrotask so overlap is observable. Resolving
        // immediately would drain each query before the next was issued, and
        // peak in-flight would read 1 even for a fully concurrent caller.
        const p = new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
          probe.inFlight -= 1;
          return result;
        });
        return (p[prop] as (...args: unknown[]) => unknown).bind(p);
      }
      return () => proxy;
    },
    apply: () => proxy,
  });
  return proxy;
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
) {
  supabase.current = {
    from: (table: string) => chainable(table === "uploads" ? uploadsResult : clientsResult),
    schema: () => ({ from: () => chainable(biResult) }),
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

const ROW = (id: string, name: string) => ({
  id,
  name,
  linkedin_profile_url: `https://linkedin.com/in/${name.toLowerCase().replace(/\s/g, "")}`,
  created_at: "2026-07-16T00:00:00.000Z",
});

beforeEach(() => {
  supabase.current = null;
  probe.inFlight = 0;
  probe.peak = 0;
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

  it("fetches the client rows, the post counts and the latest uploads CONCURRENTLY", async () => {
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
    expect(probe.peak).toBe(3);
  });

  it("fetches the client row and its post count CONCURRENTLY", async () => {
    mockSupabase({ data: ROW("c1", "Bryan Wish"), error: null }, { count: 5, error: null });

    await getClient("c1");

    // The count filters on the id ARGUMENT, so it never needed the select's
    // result. Peak in-flight is the discriminator: 1 when the count awaits the
    // row, 2 once they go out together. Asserting the query count would pass
    // under both and prove nothing.
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
