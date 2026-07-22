import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Every schema change lives in TWO files: a paste-into-the-SQL-editor script at
// supabase/<name>.sql (the working path — see the APPLY runbooks) and a CLI
// migration under supabase/migrations/. Nothing else keeps them in step, so a
// fix applied to one and forgotten in the other would silently diverge: the
// hosted database and `supabase db push` would then build different schemas.
// This is that guard.
//
// The comparison is SQL-ONLY. The pairs differ by their leading header comment
// (each explains itself in its own context), so a raw byte comparison would fail
// for a difference that does not matter — which is exactly why comments and
// blank lines are stripped before comparing.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_DIR = join(process.cwd(), "supabase");

/** The executable SQL: every line that is not blank and not a `--` comment. */
function sqlOnly(path: string): string {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("--"))
    .join("\n");
}

const PAIRS = [
  {
    name: "post-attributes",
    script: "post-attributes.sql",
    migration: "migrations/20260722120000_post_attributes.sql",
  },
  {
    name: "ingest-write",
    script: "ingest-write.sql",
    migration: "migrations/20260716120000_arcbase_ingest_write.sql",
  },
];

describe("supabase SQL script ⇄ migration stay in sync", () => {
  it.each(PAIRS)("$name: both copies contain identical SQL", ({ script, migration }) => {
    const fromScript = sqlOnly(join(SUPABASE_DIR, script));
    const fromMigration = sqlOnly(join(SUPABASE_DIR, migration));

    expect(fromScript).toBe(fromMigration);
    // Guard the guard: an empty read would make the comparison vacuously true.
    expect(fromScript.length).toBeGreaterThan(0);
  });

  it("ignores comment-only and blank-line differences, but nothing else", () => {
    // Proves the stripping is doing real work rather than flattening everything:
    // a comment difference is invisible, a statement difference is not.
    const a = "-- header A\n\ncreate table t (id int);\n";
    const b = "-- a totally different header\ncreate table t (id int);";
    const c = "create table t (id bigint);";

    const strip = (s: string) =>
      s
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l !== "" && !l.startsWith("--"))
        .join("\n");

    expect(strip(a)).toBe(strip(b));
    expect(strip(a)).not.toBe(strip(c));
  });
});
