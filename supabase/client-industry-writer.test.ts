import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THESE ARE SOURCE ASSERTIONS, NOT EXECUTED SQL.
//
// No Postgres runs in this repo's test suite. NOTHING HERE HAS EVER RUN. These
// tests cannot tell you the schema is correct — only that the shipped script
// still SAYS what it was meant to say. The constraints, the guards, the delete
// refusal and the two foreign keys are all unverified until a human applies the
// script and reads the verification queries at the bottom of it.
//
// It earns its place anyway, because the invariant this slice exists to protect
// is invisible in the code that violates it. Adding one line to
// `set_client_industry_writer`'s UPDATE — `name = p_name` — would look like an
// obvious convenience, would compile, would pass every other test in this repo,
// and would hand staff a control that silently re-attributes or strands every
// post a Client has. `clients.name` is the key `bi.linkedin_post_latest` joins
// scraped posts on. That is the line this file exists to make fail.
//
// ⚠️ THE FUNCTION-BODY ASSERTIONS DELIBERATELY INCLUDE THE BODY'S COMMENTS.
// `fnBody` slices raw source, so a forbidden identifier cannot slip in disguised
// as an explanation of itself. Negative assertions that would trip over the
// script's own prose run against `executable` instead, which strips comments.
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT = join(process.cwd(), "supabase", "client-industry-writer.sql");
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

/** The one `alter table public.clients` statement, up to its terminating `;`. */
const alterClients = (() => {
  const start = source.indexOf("alter table public.clients");
  expect(start, "the clients ALTER is missing").toBeGreaterThan(-1);
  return source.slice(start, source.indexOf(";", start) + 1);
})();

/** Every admin-guarded function. `list_staff_directory` is deliberately not one. */
const ADMIN_FUNCTIONS = [
  "create_industry",
  "update_industry",
  "set_industry_status",
  "delete_industry",
  "set_client_industry_writer",
];

const ALL_FUNCTIONS = [...ADMIN_FUNCTIONS, "list_staff_directory"];

/** Argument type lists, as they appear in each revoke/grant pair. */
const SIGNATURES: Record<string, string> = {
  create_industry: "text",
  update_industry: "uuid, text",
  set_industry_status: "uuid, text",
  delete_industry: "uuid",
  set_client_industry_writer: "uuid, uuid, uuid",
  list_staff_directory: "",
};

describe("the script is readable (guard the guard)", () => {
  it("defines the registry, both columns and all six functions", () => {
    // A wrong path or an empty read would make every assertion below vacuous.
    expect(source).toContain("create table if not exists public.industries");
    expect(alterClients).toContain("add column if not exists industry_id");
    for (const fn of ALL_FUNCTIONS) {
      expect(source, fn).toContain(`create or replace function public.${fn}(`);
    }
  });

  it("tells the operator to run verification queries one at a time", () => {
    // The Supabase SQL editor renders only the LAST statement's result set, so a
    // check that returned nothing looks exactly like a check nobody ran.
    expect(source).toMatch(/ONE AT A TIME/);
  });

  it("⚠️ states plainly that none of it has executed", () => {
    // The script is the only place an operator reads before applying it. If it
    // does not say the tests never ran the SQL, nothing does.
    expect(source).toMatch(/NOTHING BELOW HAS EVER EXECUTED IN CI/);
  });
});

describe("industries — the controlled list", () => {
  it("constrains status to active/archived", () => {
    expect(source).toMatch(/status in \('active', 'archived'\)/);
  });

  it("⚠️ makes the name unique CASE-INSENSITIVELY, not merely unique", () => {
    // ⚠️ THE PLAIN `unique` IS NOT ENOUGH. It rejects only an exact repeat, so
    // "SaaS" and "saas" would both be accepted and the registry would split the
    // very counts it exists to make possible — the uncountability free text was
    // rejected for, arriving through the controlled list instead. Unlike
    // public.services there is no `slug` here to carry machine identity.
    expect(source).toMatch(/name\s+text not null unique/);
    expect(source).toMatch(
      /create unique index if not exists industries_name_ci\s*\n\s*on public\.industries \(lower\(name\)\);/,
    );
  });

  it("has RLS on with a select-only policy and no write policy", () => {
    expect(source).toMatch(/alter table public\.industries enable row level security;/);
    expect(source).toMatch(/create policy industries_select_authenticated on public\.industries/);
    // Writes go exclusively through the SECURITY DEFINER functions.
    expect(executable).not.toMatch(/on public\.industries\s*\n\s*for (insert|update|delete)/);
  });

  it("⚠️ seeds nothing — the only INSERT is the admin function's", () => {
    // ⚠️ WHICH INDUSTRIES ARCBOUND RECOGNISES IS STILL OPEN. A guessed seed would
    // be indistinguishable from a decision once it was in the table, and this
    // registry has no evidence in the database to derive itself from (unlike the
    // Services backfill, which read real upload history).
    expect(executable.match(/insert into public\.industries/g)).toHaveLength(1);
    expect(fnBody("create_industry")).toMatch(/insert into public\.industries/);
  });
});

describe("the two new columns on public.clients", () => {
  it("adds industry_id and writer_id, and NOTHING else", () => {
    expect(alterClients.match(/add column/g)).toHaveLength(2);
    expect(alterClients).not.toMatch(/drop column|alter column|rename/);
  });

  it("points industry_id at the registry with NO delete action", () => {
    // ⚠️ THE ABSENCE IS THE FEATURE. The default (NO ACTION) is what makes
    // delete_industry's guard REAL: an industry a Client is recorded in cannot be
    // destroyed even if the function is bypassed entirely. A cascade would wipe
    // the reference; a set-null would silently blank a real recorded value.
    expect(alterClients).toMatch(
      /add column if not exists industry_id uuid references public\.industries\(id\),/,
    );
    expect(alterClients).not.toMatch(/references public\.industries\(id\) on delete/);
  });

  it("points writer_id at auth.users ON DELETE SET NULL", () => {
    // D1: the link is CURRENT STATE ("who writes for them now"), not history —
    // the audit trail lives in uploads.uploaded_by. If an account is removed in
    // the Supabase dashboard the honest answer becomes "nobody", and nulling says
    // that. RESTRICT would block a legitimate removal; a dangling id would name
    // an account that no longer exists.
    expect(alterClients).toMatch(
      /add column if not exists writer_id\s+uuid references auth\.users\(id\) on delete set null;/,
    );
  });

  it("⚠️ adds NO policy to public.clients — every policy here is the registry's", () => {
    // ⚠️ RLS GATES ROWS, NOT COLUMNS. An UPDATE policy on clients would let a
    // caller write the table directly, and no policy predicate can stop them
    // choosing `name`. The definer function below is what makes the column
    // unreachable; a policy would be the wrong tool and would reopen the hole.
    const policyStatements = executable
      .split("\n")
      .filter((line) => /^(create|drop) policy/.test(line));

    expect(policyStatements.length).toBeGreaterThan(0);
    for (const line of policyStatements) {
      expect(line, line).toContain("public.industries");
    }
  });
});

describe("set_client_industry_writer — the only write path onto a Client", () => {
  const body = fnBody("set_client_industry_writer");

  it("⚠️ CANNOT REACH clients.name OR clients.linkedin_url", () => {
    // ⚠️ THIS IS THE ASSERTION THE SLICE EXISTS FOR. `clients.name` is the key
    // bi.linkedin_post_latest joins scraped posts on:
    //   c.name = trim(regexp_replace(s.post_name, '\s*•\s*You\s*$', '', 'i'))
    // Editing it silently re-attributes or strands every post the Client has —
    // the failure that lost fourteen of Eitan Hoenig's posts, but self-inflicted,
    // with no upload to point at and nothing on screen to explain it.
    //
    // Written as a negative assertion rather than a comment, because a comment
    // cannot fail. The whole body is searched, comments included, so the
    // identifier cannot arrive disguised as an explanation of itself.
    expect(body).not.toMatch(/linkedin_url/i);
    expect(body).not.toMatch(/\bname\b/i);
  });

  it("⚠️ names EXACTLY two columns, in one UPDATE, on one table", () => {
    const stmt = body.slice(
      body.indexOf("update public.clients"),
      body.indexOf("where id = p_client_id"),
    );
    const assigned = [...stmt.matchAll(/^\s*(?:set\s+)?(\w+)\s*=/gm)].map((m) => m[1]);

    expect(assigned).toEqual(["industry_id", "writer_id"]);
    // One statement, so a second UPDATE cannot quietly reach further.
    expect(body.match(/update public\./g)).toHaveLength(1);
    expect(body).not.toMatch(/insert into|delete from/);
  });

  it("raises 23503 rather than succeeding silently on an unknown client", () => {
    expect(body).toMatch(/if not found then[\s\S]*?errcode\s*=\s*'23503'/);
  });

  it("takes both values and applies them, so NULL clears a field", () => {
    // A partial update is impossible through this signature, on purpose: the
    // caller always sends both current values. That is what keeps it one atomic
    // statement over exactly two columns.
    expect(body).toMatch(/p_industry_id uuid/);
    expect(body).toMatch(/p_writer_id\s+uuid/);
  });
});

describe("list_staff_directory — readable by every staff member (D4)", () => {
  const body = fnBody("list_staff_directory");

  it("returns user_id and email, read from auth.users", () => {
    expect(body).toMatch(/returns table \(\s*\n\s*user_id uuid,\s*\n\s*email\s+text\s*\n\s*\)/);
    expect(body).toMatch(/select u\.id,\s*\n\s*u\.email::text/);
    expect(body).toMatch(/from auth\.users u/);
  });

  it("⚠️ mentions NEITHER role, NOR assigned, NOR pending", () => {
    // ⚠️ THOSE THREE ARE GOVERNANCE FACTS AND list_staff() IS ADMIN-ONLY FOR
    // THEM. Returning any of them here would make that guard pointless — an
    // analyst would read the same state through the unguarded door. The whole
    // body is searched, comments included.
    expect(body).not.toMatch(/\brole\b/i);
    expect(body).not.toMatch(/\bassigned\b/i);
    expect(body).not.toMatch(/\bpending\b/i);
  });

  it("⚠️ is deliberately NOT admin-gated — that is the point", () => {
    // ADR 0013 removes the ability to CHANGE things, never the ability to SEE
    // them. Without this, a Data Analyst sees a raw uuid where a Client's writer
    // should be, because auth.users is not readable by `authenticated`.
    expect(body).not.toMatch(/is_admin/);
    expect(source).toMatch(
      /grant\s+execute on function public\.list_staff_directory\(\) to authenticated;/,
    );
  });

  it("⚠️ leaves public.list_staff() completely untouched", () => {
    // One definition per function. A second `create or replace` in another script
    // leaves a stale definition that silently wins whenever it is applied last.
    expect(executable).not.toMatch(/create or replace function public\.list_staff\(/);
    expect(executable).not.toMatch(/drop function if exists public\.list_staff\(\)/);
  });

  it("drops before creating, because a returns-table shape IS the return type", () => {
    // `create or replace` cannot change a return type — Postgres raises 42P13 —
    // and the drop discards the grants, which is why revoke/grant re-run with it.
    expect(source).toMatch(/drop function if exists public\.list_staff_directory\(\);/);
  });
});

describe("every function is a definer function with a pinned search_path", () => {
  it.each(ALL_FUNCTIONS)("%s is security definer, search_path pinned", (fn) => {
    const body = fnBody(fn);
    // ⚠️ WITHOUT THE PIN, a caller-controlled search_path can shadow `industries`
    // or `staff_roles` with a table of their own and the definer runs against it.
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path = public/);
  });

  it.each(ALL_FUNCTIONS)("%s revokes from public and grants only to authenticated", (fn) => {
    const sig = SIGNATURES[fn];
    expect(source).toMatch(
      new RegExp(`revoke all\\s+on function public\\.${fn}\\(${sig}\\) from public;`),
    );
    expect(source).toMatch(
      new RegExp(`grant\\s+execute on function public\\.${fn}\\(${sig}\\) to authenticated;`),
    );
  });

  it("⚠️ grants nothing to anon", () => {
    expect(executable).not.toMatch(/\banon\b/);
  });
});

describe("every admin guard fails CLOSED", () => {
  it.each(ADMIN_FUNCTIONS)("%s guards with coalesce(public.is_admin(), false)", (fn) => {
    const body = fnBody(fn);
    expect(body).toMatch(/if not coalesce\(public\.is_admin\(\), false\) then/);
    expect(body).toMatch(/errcode\s*=\s*'42501'/);
  });

  it.each(ADMIN_FUNCTIONS)("%s guards BEFORE it touches any table", (fn) => {
    const body = fnBody(fn);
    const guard = body.indexOf("is_admin()");
    const firstTouch = body.search(/\b(insert into|update|delete from|from) public\./);
    expect(guard).toBeGreaterThan(-1);
    if (firstTouch > -1) expect(guard).toBeLessThan(firstTouch);
  });

  it("⚠️ leaves no BARE is_admin() guard anywhere in the script", () => {
    // ⚠️ THE SHAPE THIS PREVENTS HAS ALREADY SHIPPED HERE ONCE. In plpgsql
    // `null = x` is NULL, `not NULL` is NULL, and `if NULL then` DOES NOT FIRE —
    // control falls straight through the guard into the write (see the
    // uploaded_by note in supabase/outreach-void.sql). is_admin() returns
    // `exists(...)` and is never null today, so today this changes nothing; it is
    // here so a future redefinition that CAN return null fails closed instead of
    // opening every write path in this file at once.
    expect(executable).not.toMatch(/if not public\.is_admin\(\)/);
    expect(executable.match(/coalesce\(public\.is_admin\(\), false\)/g)).toHaveLength(
      ADMIN_FUNCTIONS.length,
    );
  });

  it("⚠️ never coalesces a COLUMN to answer an authorisation question", () => {
    // ⚠️ `coalesce(uploaded_by, auth.uid()) = auth.uid()` makes a null column
    // match EVERY caller — the same hole as the missing coalesce, written more
    // confidently. The coalesce goes around the COMPARISON, always.
    expect(executable).not.toMatch(/coalesce\([^)]*,\s*auth\.uid\(\)\s*\)/);
  });
});

describe("delete_industry refuses while any Client is recorded in it", () => {
  const body = fnBody("delete_industry");

  it("⚠️ counts referencing clients and raises 23503 naming the count", () => {
    // ⚠️ HARD DELETE IS A TYPO ERASER, NOT A RETIREMENT TOOL. This message is for
    // humans; the foreign key is what actually enforces it (see the column test).
    expect(body).toMatch(/count\(\*\) into v_refs[\s\S]*?from public\.clients/);
    expect(body).toMatch(/where industry_id = p_id/);
    expect(body).toMatch(/if v_refs > 0 then[\s\S]*?errcode\s*=\s*'23503'/);
  });

  it("checks the references BEFORE deleting", () => {
    expect(body.indexOf("v_refs > 0")).toBeLessThan(body.indexOf("delete from public.industries"));
  });

  it("offers archiving as the reversible alternative", () => {
    expect(fnBody("set_industry_status")).toMatch(
      /p_status not in \('active', 'archived'\)[\s\S]*?errcode\s*=\s*'22023'/,
    );
  });
});

describe("the registry's mutating functions stamp updated_at", () => {
  it.each(["update_industry", "set_industry_status"])("%s stamps updated_at", (fn) => {
    // ⚠️ NO TRIGGER MAINTAINS IT (the same trap services.updated_at carries).
    // Omitting it leaves the column lying about a row that genuinely changed.
    expect(fnBody(fn)).toMatch(/updated_at\s*=\s*now\(\)/);
  });

  it("⚠️ and set_client_industry_writer stamps none, because clients has no such column", () => {
    // public.clients was created outside this repo's migrations and this script
    // does not add a column to it beyond the two it is here for. Recorded so the
    // absence reads as a decision rather than an oversight.
    expect(fnBody("set_client_industry_writer")).not.toMatch(/updated_at/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ FILE-WIDE, NOT FUNCTION-WIDE.
//
// The guard above is scoped to `set_client_industry_writer`, and that scope was
// the gap: appending a SECOND definer function to this script that runs
// `update public.clients set name = …` was caught by nothing that named the
// problem. The claim this repo makes is not "one function cannot reach the
// attribution key" — it is that NOTHING in this script can.
//
// ⚠️ AND IT CANNOT POLICE OTHER FILES. This reads one script. A migration, a
// psql session, or another file under supabase/ can still write `clients.name`
// and this test will stay green, so it must not be read as proof that no write
// path exists anywhere — only that none was added HERE. A guard that overstates
// its reach is the same kind of quiet false assurance it was written to catch.
// ─────────────────────────────────────────────────────────────────────────────
describe("⚠️ NO statement in this script may write clients.name", () => {
  /** Every `update public.clients …;` statement, comments already stripped. */
  const updates = (() => {
    const found: string[] = [];
    for (let at = executable.indexOf("update public.clients"); at !== -1;) {
      const end = executable.indexOf(";", at);
      found.push(executable.slice(at, end === -1 ? undefined : end + 1));
      at = executable.indexOf("update public.clients", at + 1);
    }
    return found;
  })();

  it("finds the UPDATE statements it is meant to be checking", () => {
    // Guard the guard: an extraction that found nothing would make every
    // assertion below vacuously true, which is precisely how a file-wide claim
    // rots into a green test that checks nothing.
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.some((stmt) => stmt.includes("industry_id ="))).toBe(true);
  });

  it("names NEITHER name NOR linkedin_url — in ANY of them", () => {
    for (const stmt of updates) {
      expect(stmt).not.toMatch(/\blinkedin_url\b/i);
      expect(stmt).not.toMatch(/\bname\b/i);
    }
  });

  it("assigns ONLY columns from the allow-list", () => {
    // Stronger than the two negatives above, and the reason is that a future
    // author does not have to think of `name` to do damage: any column of
    // public.clients reachable from this script is a column an admin screen can
    // be wired to. Two are intended. Anything else must be a deliberate edit
    // here, not a quiet addition somewhere in the SQL.
    const ALLOWED = ["industry_id", "writer_id"];
    for (const stmt of updates) {
      const assigned = [...stmt.matchAll(/(?:^|,|set)\s*(\w+)\s*=/g)].map((m) => m[1]);
      expect(assigned.length).toBeGreaterThan(0);
      for (const column of assigned) expect(ALLOWED).toContain(column);
    }
  });
});
