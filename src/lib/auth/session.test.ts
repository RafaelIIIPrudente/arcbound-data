import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hermetic: no real Supabase client, no network. ───────────────────────────
const { state } = vi.hoisted(() => ({
  state: {
    configured: true,
    user: null as unknown,
    /** Set to make `auth.getUser()` throw rather than resolve. */
    throwWith: null as string | null,
    calls: 0,
  },
}));

vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/config", () => ({
  get isSupabaseConfigured() {
    return state.configured;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        state.calls += 1;
        if (state.throwWith !== null) throw new Error(state.throwWith);
        return { data: { user: state.user } };
      },
    },
  }),
}));

import { getSession } from "./session";

const MODULE = "src/lib/auth/session.ts";

beforeEach(() => {
  state.configured = true;
  state.user = null;
  state.throwWith = null;
  state.calls = 0;
});

describe("getSession", () => {
  it("returns the authenticated user", async () => {
    state.user = { id: "u1", email: "bryan@arcbound.com" };

    await expect(getSession()).resolves.toMatchObject({ email: "bryan@arcbound.com" });
  });

  it("returns null when Supabase is not configured, without calling out", async () => {
    state.configured = false;

    await expect(getSession()).resolves.toBeNull();
    expect(state.calls).toBe(0);
  });

  it("returns null rather than throwing when the auth call fails", async () => {
    state.throwWith = "network unreachable";

    // A layout renders this; a throw here would blank the whole shell.
    await expect(getSession()).resolves.toBeNull();
  });
});

describe("the memoisation is REQUEST-scoped", () => {
  // ⚠️ WHY THIS IS A SOURCE GUARD AND NOT A BEHAVIOURAL TEST.
  //
  // React's `cache()` only memoises inside a server render; in vitest there is
  // no render context, so calling `getSession()` twice here genuinely invokes
  // it twice. That is verified below — which means a "calls === 1" assertion
  // could never pass, and the memoisation itself is NOT unit-testable.
  //
  // What IS testable, and what actually matters, is that the memo cannot become
  // cross-request. `getSession` takes no arguments, so any store keyed by input
  // and shared BETWEEN requests would hold exactly one entry for every visitor
  // — serving the first user's identity to everyone. React `cache()` is
  // per-render and cannot do this; `unstable_cache` can.
  const source = readFileSync(join(process.cwd(), MODULE), "utf8");

  /**
   * The module with comments stripped. The guard below must match CODE — the
   * doc comment in session.ts names `unstable_cache` in order to warn against
   * it, and matching raw text flagged that warning as the violation.
   */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("uses React cache(), not a cross-request store", () => {
    expect(code).toMatch(/import\s*\{\s*cache\s*\}\s*from\s*["']react["']/);
    expect(code).not.toMatch(/unstable_cache/);
    expect(code).not.toMatch(/revalidate/);
  });

  it("strips comments without stripping the code it is checking", () => {
    // Guard the guard, second half: proves the stripping above left real code
    // behind rather than emptying the file and passing vacuously.
    expect(code).toContain("supabase.auth.getUser()");
    expect(code).not.toContain("must NOT be swapped");
  });

  it("reads the module it is guarding", () => {
    // Guard the guard: a wrong path would make the assertions above vacuous.
    expect(source).toContain("export const getSession");
  });

  it("confirms cache() does not memoise outside a render, as documented above", async () => {
    state.user = { id: "u1" };

    await getSession();
    await getSession();

    // If this ever reads 1, vitest has gained a render context and the comment
    // above is stale — at which point a real memoisation test becomes possible.
    expect(state.calls).toBe(2);
  });
});
