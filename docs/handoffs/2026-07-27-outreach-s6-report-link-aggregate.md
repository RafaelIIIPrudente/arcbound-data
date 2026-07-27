# Handoff — Outreach System S6: Report Link aggregate exposure

- **Type:** Executer handoff (feature slice, S6 — the last of the Outreach System workstream)
- **Date:** 2026-07-27
- **Branch:** `feat-outreach-system-dashboard`
- **Status:** Ready to run. Depends on **S1** (tables) and **S3** (the funnel
  definitions it must mirror). Independent of S4/S4a/S5 — no file overlap.
- **Brief:** [spec §S6](../specs/2026-07-27-outreach-system-dashboard.md) +
  [ADR 0012](../adr/0012-outreach-system-per-client-snapshots.md).

## Decision & rationale

The client-facing half. Bryan called the S3 aggregate view "a good view for the
client"; this is what actually delivers it — outreach counts inside the public
Report Link, **aggregated in the SECURITY DEFINER function so no prospect row
ever leaves the database on that path**.

**The load-bearing hazard is duplication, and it cannot be designed away.** The
staff funnel is computed in TypeScript from rows the page already holds; the
client figure must be computed in SQL, because sending the rows out to compute it
is the exact thing ADR 0012 forbids. So the same four rules now live in two
languages and can drift silently — a client reading 41 replies while staff read
39 would be a credibility failure nobody notices for months. **That duplication
is the price of the privacy boundary. Accept it and guard it; do not try to
remove it by relaxing the boundary.**

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class Postgres + TypeScript engineer who treats a SECURITY
DEFINER function as a privacy boundary rather than a convenience, and who knows
that the dangerous edit to a live `create or replace` is the line you FORGOT to
carry over. You keep two implementations of one rule honest by writing down where
the other one lives. You read before you write; ⚠️ comments in this repo are
binding; you write failing tests first and prove they fail for the right reason;
you never widen scope silently; you report with real command output.

GOAL
Expose this Client's outreach as AGGREGATE COUNTS ONLY inside the public Report
Link — aggregated in the definer function, rendered as a summary block at
`/r/<token>` — so a Client sees their outreach without a single prospect row
leaving the database.

CONTEXT — read FIRST (do not restate; follow):
- `docs/specs/2026-07-27-outreach-system-dashboard.md` — §"Global Constraints",
  §"Source data", §"Slice S6".
- `docs/adr/0012-outreach-system-per-client-snapshots.md` — aggregate-only client
  exposure is decided there; you are implementing it, not revisiting it.
- `AGENTS.md`; `CONTEXT.md` (Outreach System, Prospect, Outreach Snapshot, Stage).
- READ THESE FILES BEFORE WRITING ANY SQL:
    supabase/report-links.sql              — `report_link_read(text, text)` is
      the function you extend. Signature (text, text) is UNCHANGED, so NO
      `drop function` is needed. It currently returns
      {client_id, client_name, posts[], uploads[], attributes[]}.
    supabase/outreach-system.sql           — outreach_uploads / outreach_prospects
    src/services/report-links.ts           — `ReportLinkSource`,
      `readReportLinkSource` (fails closed, maps each field DELIBERATELY)
    src/components/report-link/public-report.tsx — the client-facing view
    src/services/outreach-analytics.ts     — THE FUNNEL DEFINITIONS YOU MUST
      MIRROR. Read `buildOutreachAnalytics` before writing the SQL predicates.
    src/lib/outreach-vocab.ts              — `canonicalReply`, so you can see
      exactly what "replied" means.

STEPS — TDD throughout (RED first; prove each test fails for the right reason):

1. SQL — a new pair, following the repo's convention exactly:
     supabase/outreach-report-link.sql
     supabase/migrations/<FRESH-TIMESTAMP>_outreach_report_link.sql   (identical)
   and register the pair in `supabase/sql-sync.test.ts` `PAIRS`.
   ⚠️ DO NOT EDIT AN ALREADY-APPLIED MIGRATION — a new file with a fresh
   timestamp, always. ⚠️ DO NOT RUN `db push` OR TOUCH THE HOSTED DB. Staff paste
   the script into the Supabase SQL editor; that is the only application path.

   The script does ONE thing: `create or replace function
   public.report_link_read(p_token text, p_grant text)`.

   ⚠️ THE FAILURE MODE OF THIS ENTIRE SLICE IS AN OMITTED LINE. `create or
   replace` REPLACES THE WHOLE BODY. Every existing key — `client_id`,
   `client_name`, `posts`, `uploads`, `attributes` — and every existing guard —
   the revoked-token check, the grant-hash + expiry check, `return null` on ANY
   failure, `security definer`, `set search_path = public, extensions` — must be
   carried over VERBATIM from the current definition. Drop one and you silently
   break every live client report, and nothing in the test suite will notice
   because the tests mock the RPC. Copy the current body; add to it; change
   nothing else. Re-state the `comment on function` so it describes the new
   shape, and leave the existing grant/revoke lines correct for the unchanged
   signature.

2. The aggregate itself — a new `'outreach'` key on the returned jsonb, scoped to
   `v_client`, built from that Client's MOST RECENT snapshot.
   • Pick the snapshot with `order by created_at desc, id desc limit 1`.
     ⚠️ THE `id` TIE-BREAK IS NOT DECORATION — two uploads inside the same second
     would otherwise resolve arbitrarily, so the client's figures could change
     between page loads with no upload in between.
   • Return `{snapshot_at, total_prospects, sent, connected, replied,
     meetings_booked}` — SIX NUMBERS AND ONE TIMESTAMP. Nothing else.
   • ⚠️ NO PROSPECT STRING MAY APPEAR IN THE RETURNED JSONB. No name, title,
     company, URL, location, message, note, rationale, stage, or status value —
     not even one, not even in an array of distinct values. This function is the
     privacy boundary; everything that crosses it must be a count.
   • When the Client has no snapshot, the key is `null` — NOT an object of zeros.
     "This Client has no outreach uploaded" and "this Client's outreach shows
     zero" are different sentences and only one of them is ever true.

   ⚠️ THE PREDICATES MUST MIRROR `buildOutreachAnalytics` EXACTLY. Read that file
   first; these are its rules written in SQL, and they are what makes the client's
   number equal the staff's:
     sent            = date_sent is not null and btrim(date_sent) <> ''
     connected       = lower(btrim(connection_status)) = 'connected'
     replied         = reply_status is not null
                       and btrim(reply_status) <> ''
                       and lower(regexp_replace(btrim(reply_status),'\s+',' ','g'))
                           <> 'no reply'
     meetings_booked = meeting_booked_date is not null
                       and btrim(meeting_booked_date) <> ''
   The `replied` rule is the subtle one: a BLANK status is not a reply (nobody
   wrote anything down) and an UNRECOGNISED status IS one (somebody answered and
   we do not know what they meant). Both facts come straight from
   `canonicalReply`. Do NOT simplify it to `<> 'No Reply'` — that would count
   blanks as replies at the narrowest, most-scrutinised end of the funnel.

3. ⚠️ WRITE DOWN THE COUPLING, IN BOTH DIRECTIONS. The funnel rule now exists in
   TypeScript and in SQL and CANNOT be deduplicated — sending rows out to compute
   it in one place is precisely what ADR 0012 forbids, so the duplication is the
   price of the privacy boundary. Guard it instead of pretending it is not there:
   • A ⚠️ comment in `outreach-analytics.ts` naming `supabase/outreach-report-link.sql`
     and saying a change here MUST be made there, or the client's report will
     disagree with the staff page.
   • A ⚠️ comment in the SQL naming `buildOutreachAnalytics` and saying the same
     in reverse.
   • A test in `outreach-analytics.test.ts` whose NAME states the obligation, so
     anyone editing the funnel reads it in the failure output.
   Say in REPORT BACK whether you found a stronger guard than comments-plus-a-test
   that does not require running Postgres in the suite. If you did not, say that
   plainly — this is a real residual risk, not a solved problem.

4. Service — extend `src/services/report-links.ts` (+ test).
   • Add `ReportLinkOutreach { snapshotAt: string; totalProspects: number; sent:
     number; connected: number; replied: number; meetingsBooked: number }` and
     `outreach: ReportLinkOutreach | null` on `ReportLinkSource`.
   • Map it in `readReportLinkSource` DELIBERATELY, field by field, the way
     `uploads` already is — the file's own ⚠️ records that whole rows arrive but
     each field must still be added on purpose.
   • ⚠️ A MISSING OR MALFORMED `outreach` KEY MAPS TO `null`, NEVER TO ZEROS.
     Until staff apply the migration the key will not exist at all, and a report
     that renders "0 requests sent" for a Client with 1,230 of them is worse than
     one that renders nothing.
   • Do NOT weaken the fail-closed behaviour: any RPC error or throw still
     returns `null` for the whole source, with no distinguishable message.

5. Component — an outreach summary block in the public report (+ test).
   • Render the five figures, each labelled plainly, plus "as at <snapshot date>".
   • `outreach === null` → render NOTHING. No heading, no empty card.
   • ⚠️ ZERO MEETINGS BOOKED IS STATED, NEVER OMITTED. Most Clients will show 0
     here (8 of 1,435 prospects in the reference export). Dropping the row when
     it is zero would make the report flatter by selection — the reader could not
     tell "no meetings" from "we do not report meetings", and every client who
     DID have one would be silently marked out. State it.
   • ⚠️ NO RATES, PERCENTAGES, SCORES, RANKINGS, OR BENCHMARKS, and no
     encouraging or apologetic framing. 8 meetings from 1,230 requests is a fact;
     "a 0.6% conversion rate" and "still building momentum" are both verdicts
     this page has no standing to issue. The same discipline binds the whole
     report.
   • PLANNER'S CALL (vetoable, say if you disagree): v1 shows the five figures
     ONLY — no stage breakdown, no reply-sentiment split. The sentiment split
     would be 17 positive / 4 neutral / 1 negative on the reference data: a
     sentiment claim resting on 22 rows, on a client-facing page.

ACCEPTANCE
- `report_link_read` returns the five counts plus a snapshot timestamp, and every
  pre-existing key and guard is intact and unchanged.
- No prospect string of any kind appears in the returned jsonb.
- A Client with no snapshot gets `outreach: null` and no block on screen.
- Zero meetings renders as a stated zero.
- Absent/malformed `outreach` maps to null, never zeros.
- The SQL predicates match `buildOutreachAnalytics`, and both files name each
  other in ⚠️ comments.
- The SQL pair is byte-identical and registered in `sql-sync.test.ts` PAIRS.
- No rate, percentage, score, rank, or benchmark appears anywhere.
- Test count strictly up; no existing assertion weakened; every new test RED-first
  and mutation-verified.

VERIFICATION (the whole gate — nothing else)
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output pasted.
- Mutation table (real runs): (a) map a missing `outreach` key to zeros → the
  absent-key test fails; (b) render the null case as an empty card → the
  no-snapshot test fails; (c) omit the zero-meetings row → its test fails;
  (d) simplify the replied predicate so blanks count → the mirroring test fails.
- ⚠️ DIFF THE SQL, AND REPORT THE DIFF. Show that your new
  `report_link_read` differs from the current one ONLY by the additions — e.g.
  extract both function bodies and diff them. This is the one check that catches
  the omitted-line failure, and the test suite cannot do it for you.
- NO Claude-in-Chrome / dev-server walk. The SQL is NOT applied by you.

GUARDRAILS
- READ THE ACTUAL GIT STATE AT START and report it. Stay on
  `feat-outreach-system-dashboard`; never commit to `main`; SURFACE (never
  self-heal) any unexpected commit. LEAVE ALL WORK UNCOMMITTED.
- ⚠️ Build ADDITIVELY on any uncommitted S4/S4a/S5 work: do NOT revert, stash,
  reset, or reimplement it. You should not need to touch those files at all.
- Do NOT run `db push`, `supabase migration`, or any command that reaches the
  hosted database. Applying SQL is a staff action via the Supabase SQL editor.
- Do NOT change the Access Code gate, the grant minting, the signing secret
  handling, `resolve_report_link`, or the no-oracle behaviour. Adding data to an
  ALREADY-AUTHORISED read is the whole change; the authorisation path is not in
  scope and is security-critical.
- Do NOT modify the staff Outreach tab, the prospect table, the vocab module, or
  `outreach-system.sql`. The only permitted edit to `outreach-analytics.ts` is
  the ⚠️ coupling comment and its test.
- If a change needs a file outside SCOPE, STOP and FLAG.

SCOPE — create/modify ONLY:
`supabase/outreach-report-link.sql` (new);
`supabase/migrations/<fresh-ts>_outreach_report_link.sql` (new, identical);
`supabase/sql-sync.test.ts` (register the pair);
`src/services/report-links.ts` (+ test);
`src/components/report-link/public-report.tsx`;
a new outreach summary component under `src/components/report-link/` (+ test);
`src/services/outreach-analytics.ts` (+ test) — the ⚠️ coupling comment only.

REPORT BACK
- Git state at start; files changed; final `git status --porcelain`.
- THE SQL DIFF proving only additions to `report_link_read`.
- The four predicates as written, beside the TypeScript rules they mirror.
- What guard you put on the duplication, and whether you found anything stronger
  than comments-plus-a-test.
- The exact copy of the outreach block, including the zero-meetings case.
- Full gate output + the mutation table (real runs); test count before/after.
- ⚠️ END WITH THE STAFF ACTION: state plainly that
  `supabase/outreach-report-link.sql` must be pasted into the Supabase SQL editor
  before the block appears for any client, and that until then the key is absent
  and the report correctly shows nothing.
- FLAGS: anything you stopped short of; whether five figures is the right amount
  for a client-facing block; whether any print/export path also needs it.
```

## Feedback & revisions

- **2026-07-27 — v1 (authored).** The last slice: aggregate-only outreach inside
  the public Report Link. Two hazards front-loaded. **(1) The omitted line** —
  `create or replace` replaces the whole body, so the executer must carry over
  every existing key and guard of `report_link_read` verbatim; the tests mock the
  RPC and would not notice, which is why a SQL diff is a required verification
  step rather than a nicety. **(2) The duplication** — the funnel rule must exist
  in both TypeScript and SQL because sending rows out to compute it once is
  exactly what ADR 0012 forbids; the handoff names that as the price of the
  boundary, specifies the four predicates precisely, and requires both files to
  point at each other. Planner's vetoable call: five figures only, no sentiment
  split (17/4/1 on 1,435 rows is a sentiment claim resting on 22).

- **2026-07-27 — v2 (executer reported; planner verified; SQL APPLIED by Bryan).**
  Built, green, uncommitted on `feat-outreach-system-dashboard` at HEAD `64900b5`.
  Bryan applied `supabase/outreach-report-link.sql` in the Supabase SQL editor the
  same day, so the `outreach` key is live.

  **Planner verification (read-only, independent of the executer's own gate):**
  - `report_link_read` guards intact — `security definer`,
    `set search_path = public, extensions`, the revoked-token check
    (`revoked_at is null` → `return null`), and the hashed grant + expiry check
    (`grant_hash = encode(digest(p_grant,'sha256'),'hex') and expires_at > now()`
    → `return null`) all present and unchanged. All five pre-existing keys
    (`client_id`, `client_name`, `posts`, `uploads`, `attributes`) survive
    verbatim; the only deletion in the executer's diff is `)` → `),` where the new
    key follows. **The omitted-line hazard did not land.**
  - No prospect string crosses the boundary: the `outreach` object is
    `count(*)` aggregates plus `v_snapshot_at`, and every predicate appears only
    inside a `filter (where …)` clause. Confirmed by reading the built SQL.
  - Combined-tree gate re-run by the planner AFTER both concurrent sessions
    settled: lint clean · type-check clean · **90 files / 1,289 tests passed** ·
    build green. The S6 executer's report of an unstable full suite was the other
    session's transient RED phase, not a defect — it has resolved.

  **The one real finding: a KNOWN DIVERGENCE that is my error, not the
  executer's.** The `replied` predicate I specified does not mirror
  `canonicalReply` exactly. `outreach-vocab.ts:190` strips a hand-typed trailing
  ISO date (`TRAILING_ISO_DATE`) BEFORE matching, so TypeScript reads
  `"No Reply 2026-07-13"` as `no-reply` (excluded), while the SQL compares the
  undated string and counts it as a reply. Verified by reading both
  implementations. It cannot bite on today's data — all eight dated statuses read
  `"Replied …"`, which both sides count — so client and staff figures agree right
  now. The executer implemented the predicate exactly as specified, flagged the
  gap rather than deviating from a definer function unilaterally, and recorded it
  with the one-line fix in a ⚠️ comment at `outreach-report-link.sql:105-109`.
  **That was the correct call.** The fix, when taken, is to apply the same
  trailing-date strip in SQL and extend the mirroring test — deferred, because
  changing a live definer function to close a gap that cannot currently fire is
  worse than the gap.

  **Accepted judgement calls:** (1) the mirroring guard is comments-both-ways plus
  eight tests in `outreach-analytics.test.ts` that read the SQL as TEXT and pin
  each predicate against its TS twin — stronger than a comment, but the executer
  is right that it pins text and not behaviour; a semantically-equivalent SQL
  reformat is a false alarm, and only running both against identical rows (pgTAP /
  Testcontainers / seeded CI) would truly close it. Recorded as a **residual
  risk**, not a solved problem. (2) `PublicReportView`'s new `outreach` prop is
  optional with a `null` default so the existing test's call site did not need an
  out-of-scope edit; the real caller does pass `source.outreach`
  (`public-report.tsx:116`), so this is latent, not live.

  **Open, non-blocking:** the trailing-ISO-date strip in SQL; the staff print view
  `/clients/[id]/report/print` does NOT go through `report_link_read` and so has no
  outreach block — if clients are ever given a print/PDF of their Report Link,
  that path needs the same block wired deliberately, it does not inherit it.
  _(Append dated entries as further feedback arrives.)_
