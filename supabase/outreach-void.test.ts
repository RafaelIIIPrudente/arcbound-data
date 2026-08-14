import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THESE ARE SOURCE ASSERTIONS, NOT EXECUTED SQL.
//
// No Postgres runs in this repo's test suite. NOTHING in this file proves that
// `void_outreach_upload` denies a non-owner, that the update is idempotent, or
// that a voided snapshot disappears from a Client's report. Every test here
// proves only that the SHIPPED FILE STILL SAYS what it is supposed to say.
// Each test name is written to state that distinction rather than blur it — a
// test called "denies a non-owner" would be a lie about what ran.
//
// It is worth having anyway, because the invariants below are exactly the kind
// that get "simplified away" by someone who does not know why they are there:
//   • the owner-or-admin predicate looks redundant beside RLS — but RLS DOES
//     NOT APPLY inside a SECURITY DEFINER function, so removing it is a
//     privilege escalation with no visible symptom in dev;
//   • `where voided_at is null` on the update looks like a pointless guard —
//     but it is the whole of the idempotency, and without it a second void
//     silently rewrites who voided the snapshot and when;
//   • the shared exception text for "missing" and "not yours" looks like lazy
//     error handling — but distinguishing them turns the function into an
//     existence oracle for other Clients' uploads.
//
// THE REAL VERIFICATION IS APPLYING THE SCRIPT AND RUNNING THE POST-APPLY
// QUERIES IN THE HANDOFF REPORT. That has NOT been done — this SQL is not yet
// applied to any database.
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT = join(process.cwd(), "supabase", "outreach-void.sql");
const source = readFileSync(SCRIPT, "utf8");

const LIVE_REPORT_LINK = join(process.cwd(), "supabase", "outreach-email-report-link.sql");

/**
 * The executable SQL only — every line that is not blank and not a `--` comment.
 *
 * ⚠️ THE ABSENCE ASSERTIONS BELOW MUST RUN AGAINST THIS, NOT THE RAW FILE. This
 * script's comments discuss the very things those tests forbid — they explain
 * why there is no `drop function` and no `is_voided` boolean — so scanning the
 * raw text would fail on the prose that documents the invariant. Weakening the
 * assertion to accommodate that would have been the wrong repair; the invariant
 * was always about the SQL.
 */
const executable = readFileSync(SCRIPT, "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "" && !line.trim().startsWith("--"))
  .join("\n");

describe("the script is readable and non-empty (guard the guard)", () => {
  it("contains all three objects it is supposed to ship", () => {
    // A wrong path or an empty read would make every assertion below vacuous.
    expect(source).toContain("create or replace function public.void_outreach_upload(");
    expect(source).toContain("create or replace function public.unvoid_outreach_upload(");
    expect(source).toContain("create or replace function public.report_link_read(");
  });
});

describe("the void columns — source says nullable, with no boolean twin", () => {
  it("adds voided_at and voided_by with `if not exists`, so a re-paste is safe", () => {
    expect(source).toMatch(/add column if not exists voided_at\s+timestamptz/);
    expect(source).toMatch(
      /add column if not exists voided_by\s+uuid references auth\.users\(id\)/,
    );
  });

  it("declares NEITHER column `not null` NOR with a default — absence is the live state", () => {
    // ⚠️ A default would rewrite the meaning of every existing row on apply.
    // Asserting on the two `add column` lines specifically, so an unrelated
    // `not null` elsewhere in the file cannot make this pass or fail.
    const addColumnLines = source
      .split("\n")
      .filter((line) => line.includes("add column if not exists void"));

    expect(addColumnLines).toHaveLength(2);
    for (const line of addColumnLines) {
      expect(line, line).not.toMatch(/not null/i);
      expect(line, line).not.toMatch(/default/i);
    }
  });

  it("ships no boolean void flag — one fact, one encoding", () => {
    // Two sources of truth for "is this voided" is how they drift apart.
    expect(executable).not.toMatch(/is_voided/i);
    expect(executable).not.toMatch(/voided\s+boolean/i);
  });
});

describe("both RPCs — source carries the authorisation boundary", () => {
  const RPCS = ["void_outreach_upload", "unvoid_outreach_upload"] as const;

  /** Drop `--` comment lines, so prose about a forbidden form cannot trip a check. */
  function stripComments(sql: string): string {
    return sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
  }

  /** The text of one function, from its `create` to the `$$;` that closes it. */
  function body(name: string): string {
    const start = source.indexOf(`create or replace function public.${name}(`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const end = source.indexOf("$$;", start);
    expect(end, `${name} has no closing $$;`).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it.each(RPCS)("%s's source declares SECURITY DEFINER with a pinned search_path", (name) => {
    const fn = body(name);
    expect(fn).toMatch(/security definer/);
    // Without this, a caller-controlled search_path could shadow `public` and
    // resolve `is_admin` to a function of their own that returns true.
    expect(fn).toMatch(/set search_path = public/);
  });

  it.each(RPCS)("%s's source carries the owner-or-admin predicate (Q4)", (name) => {
    // ⚠️ THIS PREDICATE IS THE ENTIRE SECURITY BOUNDARY OF THE FUNCTION, because
    // RLS does not apply inside a definer body. This test asserts the predicate
    // is PRESENT IN THE FILE. It does NOT execute it, and therefore does not
    // show that a non-owner is actually refused by a database.
    expect(body(name)).toMatch(
      /coalesce\(v_upload\.uploaded_by\s*=\s*auth\.uid\(\),\s*false\)\s+or\s+public\.is_admin\(\)/,
    );
  });

  it("BOTH sources carry the NULL-SAFE form of the owner comparison", () => {
    // ⚠️ WHAT THIS CHECKS: that the SOURCE wraps the owner comparison in
    // `coalesce(..., false)`. It does NOT execute anything, so it does NOT show
    // that a null uploader is actually denied by a database — only that the
    // shape which would fail OPEN is no longer in the file.
    //
    // The bug it pins: `uploaded_by` is nullable, so a bare
    // `uploaded_by = auth.uid()` yields NULL rather than false for a row with no
    // recorded uploader. `NULL or false` is NULL, `not NULL` is NULL, and
    // `if NULL then` does not fire — so the raise is skipped and control reaches
    // the UPDATE. The check that this file calls "the entire security boundary"
    // failed in the OPEN direction, and no source assertion caught it because
    // the string it matched was still there.
    //
    // ⚠️ Scanned on EXECUTABLE SQL, so the surrounding comments — which quote the
    // bare form precisely to explain why it is wrong — cannot trip it.
    for (const name of RPCS) {
      const fn = stripComments(body(name));

      // The safe form is present…
      expect(fn, name).toContain("coalesce(v_upload.uploaded_by = auth.uid(), false)");

      // …and no BARE comparison survives anywhere in the body. Stripping every
      // coalesce-wrapped occurrence must leave no `uploaded_by = auth.uid()`
      // behind; a second, unguarded comparison would reopen the hole while the
      // assertion above still passed.
      const withoutGuarded = fn.replaceAll(
        "coalesce(v_upload.uploaded_by = auth.uid(), false)",
        "",
      );
      expect(withoutGuarded, name).not.toMatch(/uploaded_by\s*=\s*auth\.uid\(\)/);
    }
  });

  it.each(RPCS)("%s's source reuses public.is_admin() rather than re-implementing it", (name) => {
    // A second copy of the role check is a second place for it to be wrong.
    const fn = body(name);
    expect(fn).toContain("public.is_admin()");
    expect(fn).not.toMatch(/from\s+public\.staff_roles/);
  });

  it.each(RPCS)("%s's source conflates “missing” with “not yours” in ONE exception", (name) => {
    // Distinguishing them would let a caller who owns neither confirm that
    // another Client's upload exists.
    const fn = body(name);
    expect(fn).toMatch(/if not found or not \(/);
    expect(fn).toMatch(/raise exception 'no such outreach upload, or not yours to/);
    expect(fn).toMatch(/errcode = '42501'/);
  });

  it("void's source makes the update a no-op when already voided", () => {
    // ⚠️ `where ... and voided_at is null` IS THE IDEMPOTENCY. Without it a
    // second void overwrites voided_at/voided_by, and the record of WHEN the
    // snapshot stopped counting and WHO stopped it silently moves.
    expect(body("void_outreach_upload")).toMatch(
      /update public\.outreach_uploads[\s\S]*where id = p_upload_id\s*\n\s*and voided_at is null;/,
    );
  });

  it("un-void's source makes the update a no-op when already live", () => {
    expect(body("unvoid_outreach_upload")).toMatch(
      /update public\.outreach_uploads[\s\S]*where id = p_upload_id\s*\n\s*and voided_at is not null;/,
    );
  });

  it.each(RPCS)("%s is granted to authenticated only — never anon, never public", (name) => {
    expect(source).toContain(`revoke all     on function public.${name}(uuid) from public;`);
    expect(source).toContain(`grant  execute on function public.${name}(uuid) to authenticated;`);
    // The grant line for these two must not mention anon at all.
    const grantLine = source
      .split("\n")
      .find((l) => l.includes(`grant  execute on function public.${name}(uuid)`));
    expect(grantLine).toBeDefined();
    expect(grantLine).not.toMatch(/anon/);
  });
});

describe("no second write path is opened", () => {
  it("adds NO update or delete RLS policy to either outreach table", () => {
    // ⚠️ Both outreach tables are SELECT-only for `authenticated` and every
    // write goes through a definer function. A policy here would let staff set
    // voided_at directly, carrying none of the owner-or-admin rule above.
    expect(executable).not.toMatch(/create policy/i);
    expect(executable).not.toMatch(/for\s+(update|delete)/i);
  });

  it("deletes nothing — voiding ADDS a fact (D1)", () => {
    expect(executable).not.toMatch(/delete\s+from/i);
    expect(executable).not.toMatch(/drop table/i);
  });
});

describe("report_link_read — replaced in place, differing by ONE predicate", () => {
  it("contains no `drop function` at all", () => {
    // ⚠️ The (text, text) signature is UNCHANGED, so `create or replace` is
    // atomic and no drop is needed. A previous slice's drop+create left an
    // orphaned overload behind.
    expect(executable).not.toMatch(/drop function/i);
  });

  it("keeps the (text, text) signature and both existing grants", () => {
    expect(source).toContain(
      "create or replace function public.report_link_read(p_token text, p_grant text)",
    );
    expect(source).toContain(
      "grant  execute on function public.report_link_read(text, text) to anon, authenticated;",
    );
  });

  it("filters voided snapshots out of the latest-snapshot select", () => {
    // The one line that carries the void across the public boundary. Without
    // it the void is honoured in TypeScript and ignored on /r/[token].
    expect(source).toMatch(
      /where ou\.client_id = v_client\s*\n\s*and ou\.voided_at is null\s*\n\s*order by ou\.created_at desc, ou\.id desc/,
    );
  });

  it("⚠️ differs from the CURRENT live definition by exactly the void predicate", () => {
    // ⚠️ THE STRONGEST ASSERTION IN THIS FILE, AND THE REASON THE OTHERS CAN BE
    // NARROW. The body carried over encodes the funnel rules, the
    // combined-meetings union and the privacy boundary; the risk is not that
    // the predicate is missing but that something ELSE changed while it was
    // being added. Comparing executable SQL against the live definition catches
    // any such drift — including a "tidy-up" nobody would think to review.
    const strip = (s: string) =>
      s
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l !== "" && !l.startsWith("--"));

    const fnOf = (text: string) => {
      const start = text.indexOf("create or replace function public.report_link_read(");
      const end = text.indexOf("$$;", start);
      return strip(text.slice(start, end));
    };

    const live = fnOf(readFileSync(LIVE_REPORT_LINK, "utf8"));
    const ours = fnOf(source);

    const added = ours.filter((l) => !live.includes(l));
    const removed = live.filter((l) => !ours.includes(l));

    expect(added).toEqual(["and ou.voided_at is null"]);
    expect(removed).toEqual([]);
  });

  it("keeps the “NO SNAPSHOT ⇒ jsonb null” comment, which IS the all-voided answer", () => {
    // ⚠️ When every snapshot is voided the select matches nothing and the
    // existing branch leaves `outreach` as jsonb null — Q3's answer, for free.
    // If someone deletes this comment as stale, the next reader may "helpfully"
    // add an object of zeros, which says something that is never true.
    expect(source).toContain("NO SNAPSHOT ⇒ THE KEY STAYS jsonb null, NOT AN OBJECT OF ZEROS");
    expect(source).toMatch(/if v_snapshot_id is not null then/);
  });
});

describe("the runbook the operator follows", () => {
  it("tells the reader to paste into the SQL editor and never to db push", () => {
    // The CLI path has burned this project via migration-timestamp ordering.
    expect(source).toContain("PASTING THIS SCRIPT INTO THE SUPABASE SQL EDITOR");
    expect(source).toMatch(/Do not `db push`/);
  });
});
