import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THESE ARE SOURCE ASSERTIONS, NOT EXECUTED SQL.
//
// No Postgres runs in this repo's test suite, so nothing here proves the
// functions BEHAVE correctly — only that the shipped SQL still says what it is
// supposed to say. That is weaker than a behavioural test and is not pretended
// otherwise.
//
// It is worth having anyway, because the invariants below are exactly the kind
// that get "simplified" away by someone who does not know why they are there:
// the advisory lock looks redundant, the post-write count looks backwards, and
// the LEFT JOIN direction looks interchangeable. Each of those edits is silent —
// the SQL stays valid, the app keeps working, and the guarantee is gone. Every
// assertion here has been mutation-checked to confirm it can actually fail.
//
// The real verification is applying the script and exercising it against a
// database with two admin accounts. That has NOT been done — production holds a
// single staff account, so the last-admin path cannot be reached there at all.
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT = join(process.cwd(), "supabase", "staff-roles-admin.sql");
const source = readFileSync(SCRIPT, "utf8");

/** One function's definition, from its `create or replace` line to `$$;`. */
function fnBody(name: string): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} not found in the script`).toBeGreaterThan(-1);
  const end = source.indexOf("\n$$;", start);
  expect(end, `${name} has no terminator`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("the script is readable and non-empty (guard the guard)", () => {
  it("contains both functions", () => {
    // A wrong path or an empty read would make every assertion below vacuous.
    expect(source).toContain("create or replace function public.list_staff()");
    expect(source).toContain("create or replace function public.set_staff_role(");
  });

  it("tells the operator to run verification queries one at a time", () => {
    // The Supabase SQL editor shows only the LAST statement's result set; this
    // note is what stops a multi-statement paste from hiding earlier output.
    expect(source).toMatch(/ONE AT A TIME/i);
  });
});

describe("list_staff lists the ROSTER, not just the assigned", () => {
  const body = fnBody("list_staff");

  it("⚠️ drives from auth.users and LEFT JOINs staff_roles", () => {
    // ⚠️ THE DIRECTION IS THE GUARANTEE. Selecting from `staff_roles` instead
    // would omit exactly the accounts the screen exists to fix — a newly
    // provisioned staff member with no row yet would simply not appear, and the
    // screen would look complete while being wrong.
    expect(body).toMatch(/from\s+auth\.users\s+u/);
    expect(body).toMatch(/left\s+join\s+public\.staff_roles\s+sr\s+on\s+sr\.user_id\s*=\s*u\.id/);
  });

  it("reports whether the role was ASSIGNED or merely defaulted", () => {
    // Absence and an explicit 'analyst' behave identically and are not the same
    // fact. Both must reach the UI.
    expect(body).toMatch(/coalesce\(sr\.role,\s*'analyst'\)/);
    expect(body).toMatch(/sr\.user_id\s+is\s+not\s+null/);
  });

  it("⚠️ reports whether an invited account has ACCEPTED yet", () => {
    // ⚠️ WITHOUT THIS, AN INVITED PERSON LOOKS LIKE AN ESTABLISHED ONE. The row
    // appears in `auth.users` the moment the invitation is sent, so the roster
    // would show a normal-looking account and give an admin no way to tell "has
    // not accepted yet" from "set up and working" (ADR 0014).
    expect(body).toMatch(/u\.email_confirmed_at is null/);
    expect(body).toMatch(/pending\s+boolean/);
  });

  it("⚠️ DROPS before replacing, because adding a column changes the return type", () => {
    // ⚠️ NOT TIDINESS — WITHOUT IT THE APPLY FAILS. A `returns table` column list
    // IS the return type, and `create or replace function` cannot change one:
    // Postgres raises 42P13. This asserts the drop exists AND precedes the create,
    // because a drop placed after would remove the function that was just defined.
    const drop = source.indexOf("drop function if exists public.list_staff()");
    const create = source.indexOf("create or replace function public.list_staff()");

    expect(drop).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(create);
  });

  it("re-grants after the drop, since dropping discards grants", () => {
    // The drop takes the EXECUTE grant with it. If the grant were not re-run in
    // this same file, applying it would leave the function uncallable by
    // `authenticated` — a roster that 403s for everyone, including admins.
    const drop = source.indexOf("drop function if exists public.list_staff()");
    const grant = source.indexOf(
      "grant  execute on function public.list_staff() to authenticated;",
    );

    expect(grant).toBeGreaterThan(drop);
  });

  it("casts auth.users.email to text so the row type matches", () => {
    // `auth.users.email` is varchar; without the cast the `returns table`
    // signature does not match and the function fails at runtime, not at create.
    expect(body).toMatch(/u\.email::text/);
  });

  it("refuses a non-admin caller", () => {
    expect(body).toMatch(/if not public\.is_admin\(\) then/);
    expect(body).toMatch(/errcode\s*=\s*'42501'/);
  });

  it("is admin-gated BEFORE it reads anything", () => {
    expect(body.indexOf("is_admin()")).toBeLessThan(body.indexOf("from auth.users"));
  });
});

describe("set_staff_role refuses four distinct things", () => {
  const body = fnBody("set_staff_role");

  it("refuses a non-admin caller (42501)", () => {
    expect(body).toMatch(/if not public\.is_admin\(\) then[\s\S]*?errcode\s*=\s*'42501'/);
  });

  it("refuses an unknown role (22023)", () => {
    expect(body).toMatch(/p_role not in \('admin','analyst'\)[\s\S]*?errcode\s*=\s*'22023'/);
  });

  it("refuses an unknown user (23503)", () => {
    expect(body).toMatch(/not exists \(select 1 from auth\.users[\s\S]*?errcode\s*=\s*'23503'/);
  });

  it("⚠️ refuses any change leaving zero admins (23514)", () => {
    // THE last-admin invariant. It lives here and nowhere else.
    expect(body).toMatch(/count\(\*\)\s+into\s+v_admins[\s\S]*?where role = 'admin'/);
    expect(body).toMatch(/if v_admins = 0 then[\s\S]*?errcode\s*=\s*'23514'/);
  });
});

describe("set_staff_role orders its steps GUARD → LOCK → WRITE → COUNT", () => {
  const body = fnBody("set_staff_role");
  const guard = body.indexOf("is_admin()");
  const lock = body.indexOf("pg_advisory_xact_lock");
  const write = body.indexOf("insert into public.staff_roles");
  const count = body.indexOf("into v_admins");

  it("⚠️ takes the advisory lock, and takes it BEFORE the write", () => {
    // ⚠️ NOT DECORATION. Two admins demoting each other concurrently would each
    // see their own write plus the other's pre-write value, each count one admin
    // remaining, and both commit — zero admins, no in-app way back. The lock
    // serialises the read-modify-write.
    //
    // No test can reproduce that race here (there is no database in this suite),
    // which is precisely why this asserts the line still exists.
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(write);
  });

  it("guards before it locks or writes", () => {
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(lock);
    expect(guard).toBeLessThan(write);
  });

  it("⚠️ counts AFTER the write, so it asks about the real post-state", () => {
    // Checking first would have to predict what the write is about to do — a
    // demotion, of the last admin, or a no-op re-assert. Counting after asks the
    // only question that matters and lets the raise roll the write back.
    expect(count).toBeGreaterThan(write);
  });

  it("stamps updated_at on every re-assignment", () => {
    // The table has no trigger, so an omission here leaves a stale timestamp on
    // a row that genuinely changed.
    expect(body).toMatch(/on conflict \(user_id\) do update[\s\S]*?updated_at = now\(\)/);
  });
});

describe("both functions are locked down the same way", () => {
  it("are SECURITY DEFINER with a pinned search_path", () => {
    for (const fn of ["list_staff", "set_staff_role"]) {
      const body = fnBody(fn);
      expect(body, fn).toMatch(/security definer/);
      expect(body, fn).toMatch(/set search_path = public/);
    }
  });

  it("are revoked from public and granted only to authenticated", () => {
    expect(source).toMatch(/revoke all\s+on function public\.list_staff\(\) from public;/);
    expect(source).toMatch(/grant\s+execute on function public\.list_staff\(\) to authenticated;/);
    expect(source).toMatch(
      /revoke all\s+on function public\.set_staff_role\(uuid, text\) from public;/,
    );
    expect(source).toMatch(
      /grant\s+execute on function public\.set_staff_role\(uuid, text\) to authenticated;/,
    );
  });
});
