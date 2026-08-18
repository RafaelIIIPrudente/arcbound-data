import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THESE ARE SOURCE ASSERTIONS, NOT EXECUTED SQL.
//
// No Postgres runs in this repo's test suite. NOTHING HERE HAS EVER RUN. These
// tests cannot tell you the schema is correct — only that the shipped script
// still SAYS what it was meant to say. The guards, the foreign-key swap and the
// delete refusal are unverified until a human applies the script and reads the
// verification queries in supabase/WRITERS-REGISTRY-APPLY.md.
//
// It earns its place anyway, because the two mistakes this script exists to
// avoid are both invisible in the code that makes them. `on delete set null` on
// the new foreign key would compile, apply, and silently unassign every Client's
// writer the first time a writer row was deleted. And swapping the foreign key
// without refusing over existing rows would leave `writer_id` values that name
// nothing — the same shape as the name-match failure that lost fourteen posts,
// where the repair was believed applied and had never run.
//
// ⚠️ THE FUNCTION-BODY ASSERTIONS DELIBERATELY INCLUDE THE BODY'S COMMENTS.
// `fnBody` slices raw source, so a forbidden identifier cannot slip in disguised
// as an explanation of itself. Negative assertions that would trip over the
// script's own prose run against `executable` instead, which strips comments.
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT = join(process.cwd(), "supabase", "writers-registry.sql");
const source = readFileSync(SCRIPT, "utf8");

/** The executable SQL: every line that is not blank and not a `--` comment. */
const executable = source
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("--"))
  .join("\n");

/** One function's definition, from its `create or replace` line to `$$;`. */
function fnBody(name: string): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} not found in the script`).toBeGreaterThan(-1);
  const end = source.indexOf("\n$$;", start);
  expect(end, `${name} has no terminator`).toBeGreaterThan(start);
  return source.slice(start, end);
}

const ADMIN_FUNCTIONS = ["create_writer", "update_writer", "set_writer_status", "delete_writer"];

describe("the script is readable (guard the guard)", () => {
  it("defines the registry, the seed, the swap and all four functions", () => {
    expect(executable).toContain("create table if not exists public.writers");
    expect(executable).toContain("insert into public.writers (name)");
    for (const fn of ADMIN_FUNCTIONS) {
      expect(fnBody(fn).length, fn).toBeGreaterThan(0);
    }
  });

  it("⚠️ states plainly that none of it has executed", () => {
    expect(source).toMatch(/NOTHING BELOW HAS EVER EXECUTED IN CI/);
  });

  it("tells the operator to run verification queries one at a time", () => {
    expect(source).toMatch(/ONE AT A TIME/);
  });
});

describe("writers — the registry of people, not accounts", () => {
  it("⚠️ never references auth.users — a writer row is not a login", () => {
    // ⚠️ THE ENTIRE POINT OF THE SLICE. Binding a writer to `auth.users` meant
    // recording who writes for a Client required issuing that person a login,
    // and under ADR 0013 every logged-in analyst reads EVERY Client. The only
    // mention of auth.users in this file is the constraint being DROPPED.
    const table = source.slice(
      source.indexOf("create table if not exists public.writers"),
      source.indexOf("create unique index if not exists writers_name_ci"),
    );
    expect(table).not.toMatch(/auth\.users/);
    expect(table).not.toMatch(/email/i);
  });

  it("constrains status to active/archived", () => {
    expect(executable).toContain("check (status in ('active', 'archived'))");
  });

  it("⚠️ makes the name unique CASE-INSENSITIVELY, not merely unique", () => {
    expect(executable).toContain("create unique index if not exists writers_name_ci");
    expect(executable).toContain("on public.writers (lower(name))");
  });

  it("⚠️ says out loud that person names collide where industry names do not", () => {
    // The index is right and the refusal it produces is correct, but a second
    // genuine "Ryan Prior" is a real possibility rather than a typo — and the
    // answer is a human making the name distinguishable, never a silent second
    // row that looks identical and means someone else.
    const index = source.slice(
      source.indexOf("-- ⚠️ THE PLAIN `unique` ABOVE IS NOT ENOUGH"),
      source.indexOf("create unique index if not exists writers_name_ci"),
    );
    expect(index).toMatch(/PERSON NAMES COLLIDE WHERE INDUSTRY NAMES DO NOT/);
    expect(index).toMatch(/never a\s*\n?--\s*silent second row/);
  });

  it("has RLS on with a select-only policy and no write policy", () => {
    expect(executable).toContain("alter table public.writers enable row level security;");
    expect(executable).toContain("for select to authenticated using (true)");
    expect(executable).not.toMatch(/create policy[\s\S]*for (insert|update|delete)/);
  });

  it("seeds the four writers Arcbound named, idempotently", () => {
    for (const name of ["Ryan Prior", "Courtney Taylor", "Izzy Bailey", "Siddharth Kumar"]) {
      expect(executable, name).toContain(`('${name}')`);
    }
    expect(executable).toContain("on conflict do nothing");
  });

  it("⚠️ ends on the confirming SELECT, because the editor shows only the last result", () => {
    // A seed is not applied until its row count has been SEEN. This repo lost
    // fourteen posts to a repair believed applied whose count nobody read.
    const statements = executable.split(";").filter((s) => s.trim() !== "");
    expect(statements.at(-1)).toMatch(/select name, status, created_at\s+from public\.writers/);
  });
});

describe("⚠️ the foreign-key swap — the only risky statement in the file", () => {
  /** The guard block, from its `do $$` to its terminator. */
  const guard = (() => {
    const start = source.indexOf("do $$");
    expect(start, "the swap guard is missing").toBeGreaterThan(-1);
    return source.slice(start, source.indexOf("\n$$;", start));
  })();

  it("⚠️ REFUSES when any client still references the old auth.users id", () => {
    // ⚠️ THE STATEMENT THAT CAN LOSE DATA IF IT IS WRONG. The ids in auth.users
    // and public.writers are unrelated, so an existing non-null writer_id names
    // no writer. Refusing is the only honest answer: somebody typed those in,
    // and a script is not entitled to decide they did not mean it.
    expect(guard).toContain("select count(*) into v_assigned from public.clients");
    expect(guard).toContain("where writer_id is not null");
    expect(guard).toMatch(/if v_assigned > 0 then/);
    expect(guard).toMatch(/raise exception/);
    // The message must carry the COUNT, so the operator knows the size of what
    // they are about to decide about.
    expect(guard).toMatch(/%\s*client\(s\) still reference auth\.users/);
  });

  it("⚠️ does NOT null the column to make itself succeed", () => {
    // Nulling them "to be safe" is data loss wearing a default.
    expect(guard).not.toMatch(/update\s+public\.clients/i);
    expect(guard).not.toMatch(/set\s+writer_id\s*=\s*null/i);
  });

  it("drops the old constraint and adds one onto public.writers", () => {
    expect(executable).toContain("drop constraint if exists clients_writer_id_fkey");
    expect(executable).toContain("foreign key (writer_id) references public.writers(id)");
  });

  it("⚠️ adds the new key with NO ACTION, never ON DELETE SET NULL", () => {
    // ⚠️ WHAT S1 HAD, AND WHY IT IS NOW WRONG. Under a registry, `set null`
    // means deleting one writer row silently unassigns every Client recorded
    // against them — with no error and nothing on screen to explain it. NO
    // ACTION is what makes `delete_writer`'s guard real rather than advisory.
    const add = source.slice(
      source.indexOf("add constraint clients_writer_id_fkey"),
      source.indexOf(";", source.indexOf("add constraint clients_writer_id_fkey")),
    );
    expect(add).not.toMatch(/on delete/i);
    expect(add).not.toMatch(/cascade/i);
  });

  it("⚠️ reloads PostgREST's schema cache, or the new embed 404s", () => {
    // The client SELECT carries `writer:writers(id, name)`. Until the cache is
    // reloaded that embed fails, and the select THROWS — which is not only a
    // broken list: `getClient` feeds the upload name-match gate, and a throw
    // there degrades it to "could not check".
    expect(executable).toContain("notify pgrst, 'reload schema';");
  });
});

describe("delete_writer — refused while any Client is recorded against them", () => {
  const body = fnBody("delete_writer");

  it("counts the references and names the count in the refusal", () => {
    expect(body).toContain("select count(*) into v_refs");
    expect(body).toContain("where writer_id = p_id");
    expect(body).toMatch(/cannot delete: % client\(s\) are still recorded against this writer/);
    expect(body).toContain("errcode = '23503'");
  });

  it("raises rather than succeeding silently on an unknown id", () => {
    expect(body).toMatch(/unknown writer %/);
  });
});

describe("every admin guard fails CLOSED", () => {
  it("⚠️ coalesces the COMPARISON in every admin function", () => {
    // ⚠️ In plpgsql `if NULL then` DOES NOT FIRE — control falls straight
    // through the guard into the write. `is_admin()` cannot return null today;
    // the coalesce is what makes a future redefinition that can fail closed
    // instead of opening every write path in this file at once.
    for (const fn of ADMIN_FUNCTIONS) {
      expect(fnBody(fn), fn).toContain("if not coalesce(public.is_admin(), false) then");
      expect(fnBody(fn), fn).toContain("errcode = '42501'");
    }
  });

  it("⚠️ leaves no BARE is_admin() guard anywhere in the script", () => {
    expect(executable).not.toMatch(/if not public\.is_admin\(\)/);
  });

  it("⚠️ never coalesces a COLUMN to answer an authorisation question", () => {
    expect(executable).not.toMatch(/coalesce\(\s*role\s*,/i);
    expect(executable).not.toMatch(/coalesce\(\s*status\s*,\s*'admin'/i);
  });

  it("is a definer function with a pinned search_path, granted only to authenticated", () => {
    for (const fn of ADMIN_FUNCTIONS) {
      const body = fnBody(fn);
      expect(body, fn).toContain("security definer");
      expect(body, fn).toContain("set search_path = public");
      expect(executable, fn).toContain(`grant  execute on function public.${fn}(`);
    }
    expect(executable).not.toMatch(/to anon/);
  });
});

describe("⚠️ list_staff_directory is NOT dropped here", () => {
  it("leaves the orphaned function alone, because shipped code still calls it", () => {
    // It is orphaned by this script and dies in W2, AFTER its last caller. A
    // drop here would break `src/services/clients.ts` between two deploys.
    expect(executable).not.toMatch(/drop function[\s\S]*list_staff_directory/i);
  });
});
