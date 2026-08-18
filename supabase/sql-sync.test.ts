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
    // ⚠️ APPLIED AFTER THE CODE DEPLOYS, UNLIKE EVERY OTHER PAIR HERE. It drops
    // a function whose last caller is removed in the same release, so applying
    // it with the registry swap below would take the function away while the
    // running app still calls it.
    name: "drop-staff-directory",
    script: "drop-staff-directory.sql",
    migration: "migrations/20260818150000_drop_staff_directory.sql",
  },
  {
    // ⚠️ ALTERS A PAIR THAT IS ALREADY APPLIED. `client-industry-writer` made
    // `clients.writer_id` reference `auth.users`; this replaces that foreign key
    // with one onto `public.writers`. The applied script is not edited — editing
    // an applied script makes the file and the database disagree with no way to
    // tell which is which — so the correction is a later pair that runs after it.
    name: "writers-registry",
    script: "writers-registry.sql",
    migration: "migrations/20260818140000_writers_registry.sql",
  },
  {
    // The only DATA pair in this list. It fills the registry the pair below
    // creates empty, so it must stay in step for the same reason: a value added
    // to one copy and forgotten in the other means the SQL editor and
    // `db push` build different vocabularies.
    name: "industries-seed",
    script: "industries-seed.sql",
    migration: "migrations/20260818130000_industries_seed.sql",
  },
  {
    name: "client-industry-writer",
    script: "client-industry-writer.sql",
    migration: "migrations/20260818120000_client_industry_writer.sql",
  },
  {
    name: "outreach-void",
    script: "outreach-void.sql",
    migration: "migrations/20260814120000_outreach_void.sql",
  },
  {
    name: "outreach-email-report-link",
    script: "outreach-email-report-link.sql",
    migration: "migrations/20260810120000_outreach_email_report_link.sql",
  },
  {
    name: "outreach-email-channel",
    script: "outreach-email-channel.sql",
    migration: "migrations/20260803120000_outreach_email_channel.sql",
  },
  {
    name: "arcbound-services",
    script: "arcbound-services.sql",
    migration: "migrations/20260802150000_arcbound_services.sql",
  },
  {
    name: "staff-roles-admin",
    script: "staff-roles-admin.sql",
    migration: "migrations/20260802140000_staff_roles_admin.sql",
  },
  {
    name: "staff-roles-enforce",
    script: "staff-roles-enforce.sql",
    migration: "migrations/20260802130000_staff_roles_enforce.sql",
  },
  {
    name: "staff-roles",
    script: "staff-roles.sql",
    migration: "migrations/20260802120000_staff_roles.sql",
  },
  {
    name: "outreach-report-link",
    script: "outreach-report-link.sql",
    migration: "migrations/20260727140000_outreach_report_link.sql",
  },
  {
    name: "outreach-system",
    script: "outreach-system.sql",
    migration: "migrations/20260727130000_outreach_system.sql",
  },
  {
    name: "uploads-connections-count",
    script: "uploads-connections-count.sql",
    migration: "migrations/20260727120000_uploads_connections_count.sql",
  },
  {
    name: "report-links",
    script: "report-links.sql",
    migration: "migrations/20260725120000_report_links.sql",
  },
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
