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
    // ⚠️ WRITTEN, NOT APPLIED, AND IT MUST STAY THAT WAY FOR NOW. `origin/main`
    // does not contain the ADR 0010 cutover; production still reads `bi.*`
    // through `.schema("bi")`, so applying this takes the live app's data source
    // away mid-request. It is registered here so the two copies cannot drift
    // while it waits — a retirement script that has gone stale against its
    // migration is the worst possible thing to discover on the day you run it.
    //
    // ⚠️ ITS DROP LIST FOR `bi` IS DELIBERATELY NOT ENUMERATED FROM THIS REPO.
    // The repo knows one object; the schema is owned outside it. The script
    // carries a discovery query the operator runs first, and drops the schema as
    // a whole rather than guessing at a list.
    name: "retire-bi-and-staging",
    script: "retire-bi-and-staging.sql",
    migration: "migrations/20260822120000_retire_bi_and_staging.sql",
  },
  {
    // ⚠️ THE POINT OF NO RETURN FOR THIS WORKSTREAM. Every pair below it left the
    // old source live and correct, so a code revert was a complete rollback. This
    // one stops the staging write, after which `bi.*` goes stale and reverting
    // yields a report silently missing every post uploaded since.
    //
    // ⚠️ IT SUPERSEDES TWO APPLIED PAIRS RATHER THAN EDITING THEM: the view from
    // `posts-read-view` (adding `post_format_type`) and `ingest_metrics` from
    // `posts-ownership`. Both of those are applied and are never edited.
    //
    // ⚠️ AND IT IS DEPLOY-ORDER-SAFE IN BOTH DIRECTIONS, deliberately —
    // `report_link_read` keeps emitting `attributes[]` so the OLD app renders
    // correct formats against the NEW SQL, and the new app falls back to that key
    // so it renders correct formats against the OLD SQL.
    name: "posts-sole-source",
    script: "posts-sole-source.sql",
    migration: "migrations/20260821120000_posts_sole_source.sql",
  },
  {
    // ⚠️ DEPLOY-ORDERED AGAINST THE APPLICATION, SQL FIRST — the code shipped with
    // it reads `public.client_posts` and nothing else, so deploying the code first
    // makes every read 404.
    //
    // ⚠️ AND GATED ON A ROW COUNT, not just on the pair below being applied: this
    // view is only as populated as `public.posts`, so that pair's BACKFILL must
    // have run. An empty posts table yields an empty view, which renders as "no
    // posts yet" rather than as an error — a blank report that raises nothing.
    name: "posts-read-view",
    script: "posts-read-view.sql",
    migration: "migrations/20260820120000_posts_read_view.sql",
  },
  {
    // ⚠️ GOES IN AFTER THE TWO PAIRS BELOW IT, WHICH WERE STILL UNAPPLIED WHEN
    // THIS WAS WRITTEN. Nothing here depends on them, but this pair adds the
    // table the whole analytics cutover stands on (ADR 0010, S1) and it should
    // land on a database whose state is known.
    //
    // It REPLACES `ingest_metrics` at the SAME five-argument signature, so unlike
    // `uploads-connections-count` it must NOT drop the function first: a drop
    // followed by a create is a window in which uploads fail, and there is no
    // overload to remove.
    name: "posts-ownership",
    script: "posts-ownership.sql",
    migration: "migrations/20260819120000_posts_ownership.sql",
  },
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
