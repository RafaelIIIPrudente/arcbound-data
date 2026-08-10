import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { paths } from "@/paths";

// ── Hermetic: no real Supabase client, no network, no Next runtime. ──────────
const { state } = vi.hoisted(() => ({
  state: {
    authDisabled: false,
    user: null as unknown,
    /** The `staff_roles` row `maybeSingle()` resolves with — `null` means NO ROW. */
    row: null as unknown,
    /** Set to make the query resolve with a PostgrestError instead of data. */
    errorWith: null as string | null,
    /** Set to make the query THROW rather than resolve. */
    throwWith: null as string | null,
    /** Set to make `createClient` itself THROW, before any query is built. */
    throwOnCreate: null as string | null,
    /** How many times a Supabase client was constructed. */
    clients: 0,
    /** Every `redirect()` target, in order. */
    redirects: [] as string[],
  },
}));

vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/config", () => ({
  get authDisabled() {
    return state.authDisabled;
  },
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => state.user,
}));
vi.mock("next/navigation", () => ({
  // Next's real `redirect()` NEVER returns — it throws a control-flow signal.
  // Modelling that is the point: it proves `requireAdmin` cannot fall through
  // and keep executing after it decides to deny.
  redirect: (to: string) => {
    state.redirects.push(to);
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => {
    if (state.throwOnCreate !== null) throw new Error(state.throwOnCreate);
    state.clients += 1;
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (state.throwWith !== null) throw new Error(state.throwWith);
              if (state.errorWith !== null) {
                return { data: null, error: { message: state.errorWith } };
              }
              return { data: state.row, error: null };
            },
          }),
        }),
      }),
    };
  },
}));

import { getRole, isAdmin, requireAdmin } from "./roles";

const MODULE = "src/lib/auth/roles.ts";

beforeEach(() => {
  state.authDisabled = false;
  state.user = { id: "u1", email: "bryan@arcbound.com" };
  state.row = null;
  state.errorWith = null;
  state.throwWith = null;
  state.throwOnCreate = null;
  state.clients = 0;
  state.redirects = [];
});

describe("getRole", () => {
  it("reads admin from the user's own staff_roles row", async () => {
    state.row = { role: "admin" };

    await expect(getRole()).resolves.toBe("admin");
  });

  it("reads analyst from the user's own staff_roles row", async () => {
    state.row = { role: "analyst" };

    await expect(getRole()).resolves.toBe("analyst");
  });

  it("treats NO ROW as analyst, not as an error", async () => {
    // The default state: a staff account nobody has assigned. Least privilege
    // means the absence of a grant is the absence of privilege — never a crash,
    // and never a promotion.
    state.row = null;

    await expect(getRole()).resolves.toBe("analyst");
  });

  it("treats an unrecognised role value as analyst", async () => {
    // The CHECK constraint should make this unreachable, but a column read is
    // not a type guarantee. Anything that is not exactly 'admin' is not admin.
    state.row = { role: "superadmin" };

    await expect(getRole()).resolves.toBe("analyst");
  });

  it("returns null when there is no authenticated user", async () => {
    state.user = null;

    await expect(getRole()).resolves.toBeNull();
  });

  it("returns admin without touching Supabase when auth is disabled", async () => {
    state.authDisabled = true;

    await expect(getRole()).resolves.toBe("admin");
    // Not merely "the answer was right" — the backend was never reached. In
    // auth-disabled dev there IS no Supabase project to reach.
    expect(state.clients).toBe(0);
  });
});

describe("getRole FAILS CLOSED", () => {
  // ⚠️ THE MOST IMPORTANT ASSERTIONS IN THIS FILE.
  //
  // Every way of not knowing the answer must resolve to the LEAST privilege.
  // "The query errored so we returned the permissive default" is a breach, not
  // a bug. A layout calls this, so it must also never throw: a throw blanks the
  // whole shell instead of degrading one affordance.

  it("resolves analyst when the query returns an error", async () => {
    state.errorWith = "permission denied for table staff_roles";

    await expect(getRole()).resolves.toBe("analyst");
  });

  it("resolves analyst when the query throws", async () => {
    state.throwWith = "network unreachable";

    await expect(getRole()).resolves.toBe("analyst");
  });

  it("resolves analyst when constructing the client throws", async () => {
    // A throw from createClient must degrade too, not escape — so the try must
    // enclose the client construction, not just the awaited query. Distinct from
    // the test above: that one throws from the QUERY, this one never gets that far.
    state.throwOnCreate = "boom";

    await expect(getRole()).resolves.toBe("analyst");
    expect(state.clients).toBe(0);
  });
});

describe("isAdmin", () => {
  it("is true only for admin", () => {
    expect(isAdmin("admin")).toBe(true);
  });

  it("is false for analyst and for no user at all", () => {
    expect(isAdmin("analyst")).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

describe("requireAdmin", () => {
  it("returns without redirecting for an admin", async () => {
    state.row = { role: "admin" };

    await expect(requireAdmin()).resolves.toBeUndefined();
    expect(state.redirects).toEqual([]);
  });

  it("redirects an analyst home", async () => {
    state.row = { role: "analyst" };

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:");
    expect(state.redirects).toEqual([paths.home]);
  });

  it("redirects when there is no authenticated user", async () => {
    state.user = null;

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:");
    expect(state.redirects).toEqual([paths.home]);
  });

  it("redirects when the role could not be determined", async () => {
    // Fail-closed carried all the way to the guard: an unreadable role denies.
    state.throwWith = "network unreachable";

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:");
    expect(state.redirects).toEqual([paths.home]);
  });
});

describe("the memoisation is REQUEST-scoped", () => {
  // ⚠️ WHY THIS IS A SOURCE GUARD AND NOT A BEHAVIOURAL TEST.
  //
  // Same reasoning as session.test.ts, but the stakes are higher. `getRole`
  // takes no arguments, so any store keyed by input and shared BETWEEN requests
  // would hold exactly one entry for every visitor — and the value it holds is a
  // PRIVILEGE. The first admin to load a page would hand admin to every
  // subsequent visitor. That is privilege escalation, not a stale cache.
  //
  // React's `cache()` is per-render and cannot do this; `unstable_cache` can.
  // Nothing else in the suite would catch the substitution, because both
  // versions behave identically inside a single request.
  const source = readFileSync(join(process.cwd(), MODULE), "utf8");

  /**
   * The module with comments stripped. The guard must match CODE — the ⚠️ block
   * in roles.ts names `unstable_cache` in order to forbid it, and matching raw
   * text would flag that warning as the violation.
   */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("uses React cache(), not a cross-request store", () => {
    expect(code).toMatch(/import\s*\{\s*cache\s*\}\s*from\s*["']react["']/);
    expect(code).not.toMatch(/unstable_cache/);
    expect(code).not.toMatch(/revalidate/);
  });

  it("strips comments without stripping the code it is checking", () => {
    // Guard the guard: proves the stripping left real code behind rather than
    // emptying the file and passing vacuously.
    expect(code).toContain("maybeSingle()");
    expect(code).not.toContain("privilege escalation");
  });

  it("reads the module it is guarding", () => {
    // Guard the guard: a wrong path would make the assertions above vacuous.
    expect(source).toContain("export const getRole");
  });

  it("confirms cache() does not memoise outside a render, as documented above", async () => {
    state.row = { role: "admin" };

    await getRole();
    await getRole();

    // If this ever reads 1, vitest has gained a render context and the comment
    // above is stale — at which point a real memoisation test becomes possible.
    expect(state.clients).toBe(2);
  });
});
