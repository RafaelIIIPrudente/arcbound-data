# Handoff — LinkedIn Connection Count (full parity with Follower Count)

- **Type:** Executer handoff (feature slice)
- **Date:** 2026-07-27
- **Branch:** `feat-additonal-features-for-linkedin-report`
- **Status:** Ready to run.
- **Shaping:** [decision doc](../decisions/2026-07-27-multi-service-dashboard-and-connection-count.md).
  The multi-service Service→Dataset reshape and the Outreach service are
  **out of scope** (deferred).

## Decision & rationale

Capture a Client's total LinkedIn **connection count** per scrape, beside the
existing Follower Count, and surface it **everywhere Follower Count already
appears** ("wherever you see followers, you now see connections"). It is a
per-Upload count, **not** a new dataset, and it is **optional** at capture — a
blank value must never block the post-metrics upload and must never be coerced to
zero (it reads as an honest gap).

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class Next.js (App Router) + React 19 + TypeScript (strict) +
Supabase engineer who mirrors an existing, proven feature exactly rather than
inventing a parallel one, and who treats "not captured" and "zero" as
categorically different facts — an absent number is a gap or an em dash, never a
0. You read before you write; ⚠️ comments in this repo are binding; you write
failing tests first and prove they fail for the right reason; you never widen
scope silently; you report with real command output.

GOAL
Add a per-scrape LinkedIn "connection count" to ArcBase, captured on the existing
post-metrics upload beside Follower Count, and surfaced at FULL PARITY with
Follower Count across every screen that shows followers. Connections is OPTIONAL:
a blank value still uploads successfully and renders as an absent value (gap / em
dash), never 0.

CONTEXT — read FIRST (do not restate; follow):
- AGENTS.md (stack + architecture rules), CONTEXT.md (domain vocabulary — note
  the new "Connections" term, which mirrors "Follower Count"), and ADR 0009
  (raw values are never rewritten; ArcBase owns `public.uploads` and
  `public.post_attributes`; it must NOT alter `public.linkedin_posts_staging`,
  the `public.clients` shape, or the externally-owned `bi.*` views).
- THE MODEL: Connections is a nullable per-Upload count, exactly parallel to
  `uploads.follower_count`. It is NOT a dataset, NOT a new table, NOT attached to
  posts. Every existing `uploads` row has no connections value (nullable column,
  no backfill — there is no historical source), so history legitimately shows
  gaps.
- FOLLOWER COUNT IS YOUR TEMPLATE. It is required; Connections is OPTIONAL — that
  asymmetry is the ONLY intended behavioural difference. Everywhere else, mirror
  the follower_count implementation precisely. Find every occurrence first:
  `grep -rln "follower" src supabase`. As of shaping these are the touchpoints:
    CAPTURE / STORAGE
    • src/components/dashboard/ingest/upload-form.tsx  (step 03 field + state)
    • src/app/(app)/upload/actions.ts                  (envelope validation)
    • src/services/ingest.ts                            (IngestInput → RPC arg)
    • src/services/types.ts                             (Upload + IngestInput types)
    • src/services/uploads.ts                           (UPLOAD_COLUMNS + row map)
    • supabase/ (migration + paste-script + sql-sync.test.ts) — see DB STEP
    DISPLAY (full parity)
    • src/lib/follower-trend.ts (+ .test.ts)
    • src/components/dashboard/client/follower-trend.tsx (+ .test.tsx)
    • src/app/(app)/clients/[id]/page.tsx                (mount the trend)
    • src/components/dashboard/client/upload-history.tsx (+ .test.tsx)
    • src/lib/upload-delta.ts (+ .test.ts)
    • src/components/dashboard/analytics/client-comparison.tsx (+ .test.tsx)
    • src/services/analytics.ts (+ .test.ts)
    • src/services/client-report.ts (+ .test.ts)
    • src/components/dashboard/report/key-performance.tsx (+ .test.tsx)
    • src/components/dashboard/report/print/print-report.tsx (+ .test.tsx)
    • src/components/report-link/public-report.tsx (+ .test.tsx)
  Treat this list as a STARTING MAP, not a ceiling: run the grep, and mirror
  follower_count wherever it actually appears. If it appears somewhere not listed,
  handle it and note it; if a listed file turns out not to reference followers,
  say so — do not force a change.

STEPS — TDD throughout (RED first; prove each test fails for the right reason
before implementing):
1. DB — new nullable column + RPC param.
   • The LIVE `ingest_metrics` definition is `supabase/post-attributes.sql`
     (paired with supabase/migrations/20260722120000_post_attributes.sql). Read
     it. Its signature is `(uuid, text, jsonb, int)`; it writes
     linkedin_posts_staging + post_attributes + one public.uploads row.
   • Create a FRESH-timestamp migration
     `supabase/migrations/<new-ts>_uploads_connections_count.sql` that:
       - `alter table public.uploads add column if not exists connections_count int;`
       - `drop function if exists public.ingest_metrics(uuid, text, jsonb, int);`
         (a `create or replace` with a new arg makes an OVERLOAD, not a
         replacement — you MUST drop the old signature),
       - recreates the FULL current `ingest_metrics` body with an added
         `p_connections_count int` param (place it after `p_follower_count`), and
         adds `connections_count` (value `p_connections_count`) to the
         `insert into public.uploads (...)` column list,
       - updates the `comment on function`, `revoke`, and `grant` to the new
         `(uuid, text, jsonb, int, int)` signature.
   • Create the paste-script twin `supabase/uploads-connections-count.sql` with
     byte-identical executable SQL (comments/blank lines may differ — see
     sql-sync.test.ts), and REGISTER the pair in `supabase/sql-sync.test.ts`
     `PAIRS`. Run that test; it must pass.
   • Do NOT run `db push`; applying to the hosted DB is an out-of-band STAFF
     action (Supabase SQL editor). Note this in REPORT BACK.
2. Capture plumbing (RED first at each seam):
   • actions.ts envelope: add `connectionsCount` as OPTIONAL — blank/empty ⇒
     `undefined` (VALID), otherwise strip separators and validate a non-negative
     whole number (reuse the follower cleaner, but "" must map to undefined/skip,
     NOT NaN). Pass it through to ingestMetrics. Test: blank connections uploads
     OK; "-3"/"1.5"/"abc" reject; "4820"/"4,820" accept.
   • ingest.ts: `IngestInput` gains `connectionsCount?: number | null`; pass as
     `p_connections_count` (null when absent) in the `supabase.rpc(...)` call.
   • types.ts: `Upload` gains `connectionsCount: number | null`.
   • uploads.ts: add `connections_count` to UPLOAD_COLUMNS, to `UploadRow`, and
     map it to `connectionsCount` (null stays null).
3. Capture UI (upload-form.tsx): add a `connections` string state and an OPTIONAL
   input inside step 03; relabel step 03 "Follower & connection counts" (follower
   required, connections optional). Set `connectionsCount` on the FormData. A test
   asserts an empty connections field still submits.
4. Display parity — for EACH display file, read how follower_count is computed and
   rendered, then mirror it for connections, keeping the FOUR STATES apart
   (captured value / not-captured → gap or em dash / genuine zero / could-not-read).
   Never coerce a missing connections value to 0. This covers the trend
   lib+chart, upload-history + upload-delta, cross-client comparison (degrade the
   connections column(s) per-column, exactly as followers degrade), analytics,
   client-report, key-performance, and print-report.
5. Public Report Link (public-report.tsx): trace how follower_count reaches the
   public view today (the read-grant path — resolveReportLink / report_link_read
   in supabase/report-links.sql). Mirror it for connections. ⚠️ If that read path
   enumerates explicit `uploads` columns in SQL, it will NOT include the new
   column automatically — extend it (another SQL pair touch: report-links.sql +
   its migration + PAIRS) and FLAG the added SQL surface in REPORT BACK. If it
   selects `*` / already carries uploads rows, no SQL change is needed — say which.

ACCEPTANCE
- A connections value entered on the upload is stored in
  `uploads.connections_count` and appears in Upload History (with WoW delta), a
  Connections Trend chart beside the Follower Trend on the client detail page, the
  cross-client comparison, the client Report (on-screen + print), and the public
  Report Link.
- A BLANK connections value uploads successfully; that scrape shows connections
  as a gap / em dash everywhere — never 0. Historical uploads (all null) likewise
  show gaps, and the trend/report empty states remain honest.
- Follower Count behaviour is completely unchanged (still required; its numbers,
  charts, and copy are untouched).
- Test count strictly up; no existing assertion weakened; every new test RED-first
  and mutation-verified.

VERIFICATION (the whole gate — nothing else)
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output pasted.
- `supabase/sql-sync.test.ts` passes (the new pair is in sync).
- Mutation table (real runs): (a) make connections REQUIRED (reject blank) → the
  "blank still uploads" test fails; (b) coerce a missing connections to 0 in a
  display path → that path's "renders a gap, not 0" test fails; (c) drop the new
  column from the paste-script only → sql-sync.test.ts fails.
- NO Claude-in-Chrome / dev-server walk — assert through pure functions, component
  markup, and action logic only.

GUARDRAILS
- READ THE ACTUAL GIT STATE AT START and report it. Stay on
  `feat-additonal-features-for-linkedin-report`; never commit to `main`; SURFACE
  (never self-heal) any unexpected commit.
- LEAVE ALL WORK UNCOMMITTED for the user to review and commit. Do NOT run
  `db push` or otherwise mutate the hosted database.
- Do NOT touch `public.linkedin_posts_staging`, the `public.clients` shape, or the
  `bi.*` views (ADR 0009). `connections_count` lives ONLY on `public.uploads`.
- Connections is OPTIONAL and nullable end-to-end; missing ≠ 0 anywhere. If a
  change needs a file outside the map, STOP and FLAG rather than widening silently.
- Conventional Commits only if later asked; keep the tree green.

SCOPE — create/modify ONLY the capture/storage + display files discovered via
`grep -rln "follower" src supabase` (mapped above), plus the new
`supabase/uploads-connections-count.sql`, the new migration, and the
`sql-sync.test.ts` PAIRS entry. Do NOT build the Service→Dataset selector, the
Outreach service, or any new dataset. Do NOT alter Follower Count's own logic.

REPORT BACK
- Git state at start; files changed; final `git status --porcelain`.
- Confirmation that a BLANK connections uploads OK and renders as a gap (not 0),
  with the exact tests that prove it.
- Whether the public Report Link read path needed a SQL change (and if so, which
  pair) — or why it did not.
- The out-of-band DB apply that remains for staff (which migration / paste-script
  to run in the Supabase SQL editor).
- Full gate output + the mutation table (real runs); test count before/after.
- FLAGS: any follower touchpoint not in the map, any file in the map that didn't
  reference followers, and anything you stopped short of.
```

## Feedback & revisions

- **2026-07-27 — v1 (authored).** From the `/grill-with-docs` session:
  Connections = optional per-Upload count, field-not-dataset, full parity with
  Follower Count, four-state honesty (missing ≠ 0). Carries the Report-Links
  go-live migration gotchas (DROP-before-recreate on the signature change,
  fresh-timestamp migration, SQL-pair + sync test, apply via SQL editor).
  _(Append dated entries as the executer reports back; edit the prompt in place if revised.)_

- **2026-07-27 — executer run: BUILT, gate green, uncommitted.**
  - **Gate:** lint ✔, type:check ✔, test ✔ (823 → **899**, +76; 72 files), build ✔
    (20/20). Planner **independently re-ran `pnpm test`: 72 files / 899 passing —
    confirmed.** `sql-sync.test.ts` passes with the new pair registered.
  - **⚠️ BRANCH DRIFT (surfaced, not self-healed).** The brief named
    `feat-additonal-features-for-linkedin-report`; that branch was **merged into
    `main` via PR #14** (`25ec072`) and the session had already been cut onto a
    fresh `feat-outreach-system-dashboard`. The executer stayed on the current
    branch and committed nothing. Planner verified: `main..HEAD` is empty (HEAD ==
    main), so all 38 changed paths are uncommitted work on the new branch.
  - **DB:** new nullable `public.uploads.connections_count int` (no default, no
    backfill) + `ingest_metrics` dropped at `(uuid,text,jsonb,int)` and recreated
    as `(uuid,text,jsonb,int,int)`. Planner verified the recreated body **retains
    the `post_attributes` upsert** (4 occurrences) and threads
    `connections_count` into the `uploads` insert — the drop is load-bearing.
    Pair: `supabase/uploads-connections-count.sql` ⇄
    `supabase/migrations/20260727120000_uploads_connections_count.sql`.
    **⚠️ NOT APPLIED — staff must paste the script into the Supabase SQL editor;
    until then uploads FAIL, because the app now calls the 5-arg signature.**
  - **Public Report Link — no SQL change needed (planner verified).**
    `report_link_read` returns uploads as
    `jsonb_agg(to_jsonb(u) order by u.created_at)` (report-links.sql:208) — whole
    rows, so the new column arrives automatically. What _did_ need changing was
    the explicit TS field mapping in `src/services/report-links.ts`; without it
    every client would have silently reported no connections.
  - **Honesty proven:** blank connections uploads OK and reaches the seam as
    `undefined` → SQL `null`; absent renders as a gap everywhere; a GENUINE zero
    still prints as 0. Mutations (a)–(e) all CAUGHT, including "followers
    substituted for a missing connections" (5 failures) and "public read maps
    absent → 0" (3 failures).
  - **Deviations from the map (executer-flagged, planner-accepted):**
    `print-report.tsx` needed no change (it renders `<KeyPerformance>`, so it
    inherited the figures; only its test fixtures moved). Two files outside the
    map were touched — `src/services/report-links.ts` (mandatory, above) and
    `report-status.test.tsx` (fixture only).
  - **Refactor:** `follower-trend.ts`/`.tsx` generalised to a shared
    `countTrend(uploads, pick)` + label-parameterised `CountTrendPanel` rather
    than duplicating ~90 lines; the derived point field is now `count` (fixtures
    renamed, all 25 original follower assertions retained).
  - **Comparison notice:** added a SEPARATE `connectionsUnavailable` flag +
    sentence rather than editing the follower one — because a blank Connections
    column is the NORMAL state, so folding them into one flag would either cry
    wolf or leave a real outage unexplained.
  - **OPEN — awaiting Bryan's ruling (see Revision note below):** the executer
    added derived **"Per 1K connections"** and **"Avg interactions per 1K
    connections"** alongside their follower twins (comparison table now 7 columns;
    also in report/print/public report). Rationale: followers appear in the report
    ONLY as the denominator of `perThousandFollowers`, so mirroring was the only
    way to satisfy "connections appears in the client Report." Reversible cleanly
    to a raw column only.
