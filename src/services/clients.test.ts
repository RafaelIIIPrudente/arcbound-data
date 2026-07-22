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

function mockSupabase(clientsResult: unknown, biResult: unknown) {
  supabase.current = {
    from: () => chainable(clientsResult),
    schema: () => ({ from: () => chainable(biResult) }),
  };
}

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

  it("falls back to postsCount 0 when the bi view is unreachable", async () => {
    mockSupabase(
      { data: [ROW("c1", "Bryan Wish")], error: null },
      { data: null, error: { message: "schema bi is not exposed" } },
    );
    const { items } = await listClients();
    expect(items[0]!.postsCount).toBe(0);
  });

  it("gets a client by id (null when absent)", async () => {
    mockSupabase({ data: ROW("c1", "Bryan Wish"), error: null }, { count: 5, error: null });
    const found = await getClient("c1");
    expect(found).toMatchObject({ id: "c1", name: "Bryan Wish", postsCount: 5 });

    mockSupabase({ data: null, error: null }, { count: 0, error: null });
    expect(await getClient("missing")).toBeNull();
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
