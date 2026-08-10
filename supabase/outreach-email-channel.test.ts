import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THESE ARE SOURCE ASSERTIONS, NOT EXECUTED SQL.
//
// No Postgres runs in this repo's test suite, so nothing here proves
// `ingest_outreach` BEHAVES correctly — only that the shipped SQL still says
// what it is supposed to say. That is weaker than a behavioural test and is not
// pretended otherwise.
//
// It is worth having anyway. The invariant this file exists to guard — that
// `p_has_email_channel` defaults to `false`, AND that the `drop function` above
// it still runs first — is exactly the kind of pair that gets "simplified away"
// by someone who does not know why both halves are there: the default alone
// looks sufficient, and the drop above it looks redundant once a default
// exists. Neither edit would make the SQL invalid or break anything visible in
// dev; it would only reopen the exact deploy-order window this amendment closed
// (docs/handoffs/2026-08-03-outreach-email-s1-data-layer.md, A1). Every
// assertion here has been mutation-checked to confirm it can actually fail.
//
// The real verification is applying this script to a live database and
// confirming a two-argument call still succeeds against the new function. That
// has NOT been done — the SQL is not yet applied.
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT = join(process.cwd(), "supabase", "outreach-email-channel.sql");
const source = readFileSync(SCRIPT, "utf8");

describe("the script is readable and non-empty (guard the guard)", () => {
  it("contains ingest_outreach", () => {
    // A wrong path or an empty read would make every assertion below vacuous.
    expect(source).toContain("create or replace function public.ingest_outreach(");
  });
});

describe("ingest_outreach — the deploy-order fix (A1)", () => {
  it("⚠️ p_has_email_channel DEFAULTS TO false — the value a two-argument (old-build) caller gets", () => {
    // Without this default, neither deploy order survives: the SQL applied
    // first drops the function a still-running old build is calling with two
    // arguments; the code deployed first sends a third argument to a database
    // that only has the two-argument function. Either way, every outreach
    // upload fails until the other side of the deploy catches up.
    expect(source).toMatch(/p_has_email_channel\s+boolean\s+default\s+false/);
  });

  it("⚠️ the drop still PRECEDES the create — the default does not make it optional", () => {
    // Position, not mere presence — that is the invariant, and only a position
    // comparison can catch it moving. Postgres resolves a call to an EXACT
    // signature match before it ever considers a default: if the two-argument
    // function survived (drop missing, or moved after the create), a
    // two-argument call would keep binding to THAT old function, silently
    // never reaching the new one's body — has_email_channel would look right
    // (the column's own default is also false) while the call ran code this
    // repo no longer maintains.
    const drop = source.indexOf("drop function if exists public.ingest_outreach(uuid, jsonb);");
    const create = source.indexOf("create or replace function public.ingest_outreach(");

    expect(drop, "drop function not found").toBeGreaterThan(-1);
    expect(create, "create or replace function not found").toBeGreaterThan(-1);
    expect(drop).toBeLessThan(create);
  });

  it("re-grants on the THREE-argument signature, not the dropped two-argument one", () => {
    // The drop takes the old grant with it. Re-granting on the wrong signature
    // — the dropped (uuid, jsonb) one, or a mistyped one — would leave the live
    // three-argument function uncallable by `authenticated`.
    expect(source).toMatch(
      /revoke all\s+on function public\.ingest_outreach\(uuid, jsonb, boolean\) from public;/,
    );
    expect(source).toMatch(
      /grant\s+execute on function public\.ingest_outreach\(uuid, jsonb, boolean\) to authenticated;/,
    );
  });
});

describe("outreach_prospects — all 15 Email columns, all text", () => {
  it("adds every Email — * column as text", () => {
    // ⚠️ A WHITELIST, NOT A SPOT-CHECK. One column silently typed wrong, or
    // dropped from the alter, is exactly the "column is missing from every row
    // of every upload" failure this repo has already been burned by once.
    for (const column of [
      "email_best_email",
      "email_mobile",
      "email_subject_line",
      "email_message",
      "email_status",
      "email_date_emailed",
      "email_reply_status",
      "email_follow_up_count",
      "email_last_follow_up_date",
      "email_next_touch_date",
      "email_webinar_registered",
      "email_meeting_booked_date",
      "email_stage",
      "email_owner",
      "email_notes",
    ]) {
      const re = new RegExp(`add column if not exists ${column}\\s+text`);
      expect(source, `${column} must be added as text`).toMatch(re);
    }
  });
});

describe("outreach_uploads — has_email_channel", () => {
  it("⚠️ is boolean, not null, default false — the correct backfill for every existing row", () => {
    // Every snapshot already stored genuinely did not carry the email block —
    // the export was 24 columns wide when those rows were written — so `false`
    // is the true historical value, not a placeholder for "unknown".
    expect(source).toMatch(
      /add column if not exists has_email_channel boolean not null default false/,
    );
  });
});
