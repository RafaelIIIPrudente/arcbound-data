# Handoff — Outreach System S1: data model + ingest

- **Type:** Executer handoff (feature slice, S1 of the Outreach System workstream)
- **Date:** 2026-07-27
- **Branch:** `feat-outreach-system-dashboard`
- **Status:** Ready to run. First slice — no UI.
- **Brief:** [spec §S1](../specs/2026-07-27-outreach-system-dashboard.md) +
  [ADR 0012](../adr/0012-outreach-system-per-client-snapshots.md).

## Decision & rationale

Outreach lands in its OWN tables (`outreach_uploads`, `outreach_prospects`),
leaving the LinkedIn `uploads` pipeline untouched. Each upload is an immutable
full snapshot attributed by a staff-chosen `client_id` FK. All 24 source columns
are stored as raw text; nothing is deduplicated, normalised, or rewritten.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class TypeScript + Postgres/Supabase engineer who stores
third-party data exactly as it arrives — no normalising, no deduplicating, no
"helpful" cleanup — because the cleanup you cannot see is the bug you cannot
find. You treat an absent value and a zero as different facts. You read before
you write; ⚠️ comments in this repo are binding; you write failing tests first and
prove they fail for the right reason; you never widen scope silently; you report
with real command output.

GOAL
Build the data layer for ArcBase's new Outreach System: two tables, one ingest
RPC, a pure CSV parser/validator for the 24-column "Arcbound LinkedIn Master
Database" export, and a service seam. NO UI in this slice.

CONTEXT — read FIRST (do not restate; follow):
- `docs/specs/2026-07-27-outreach-system-dashboard.md` — §"Global Constraints",
  §"Source data", §"Interfaces", §"Slice S1". The source-data table there is
  REAL OBSERVED DATA from the actual file; trust its fill rates and value sets.
- `docs/adr/0012-outreach-system-per-client-snapshots.md` — why snapshots, why
  no name-matching, why aggregate-only client exposure.
- `AGENTS.md` (stack + architecture), `CONTEXT.md` (new terms: Outreach System,
  Prospect, Outreach Snapshot, Stage).
- ADR 0009 — raw values are never rewritten. This binds every column you store.
- PRECEDENT TO MIRROR: the LinkedIn ingest path is your template for structure,
  NOT for semantics. Read `src/lib/parse-metrics.ts` (papaparse + Zod, pure, no
  I/O), `src/services/ingest.ts` (seam → `supabase.rpc(...)`, Zod-validated
  response), and `supabase/post-attributes.sql` (SECURITY DEFINER, all-or-nothing
  transaction, `revoke`/`grant`, `comment on function`).
- SQL PAIR CONVENTION: read `supabase/sql-sync.test.ts` first. Every schema change
  is TWO files (paste-script + fresh-timestamp migration) kept byte-identical on
  executable SQL and registered in `PAIRS`.

STEPS — TDD throughout (RED first; prove each test fails for the right reason):
1. SQL. Create the pair `supabase/outreach-system.sql` +
   `supabase/migrations/<fresh-ts>_outreach_system.sql`, and register it in
   `supabase/sql-sync.test.ts` `PAIRS`. Contents:
   • `public.outreach_uploads` — id uuid pk, client_id uuid NOT NULL references
     public.clients(id), row_count int not null, uploaded_by uuid references
     auth.users(id), created_at timestamptz not null default now().
   • `public.outreach_prospects` — id bigint generated always as identity pk,
     outreach_upload_id uuid not null references public.outreach_uploads(id)
     on delete cascade, client_id uuid not null references public.clients(id),
     row_index int not null, then the 24 source columns ALL AS `text` (exact
     names in the spec's Interfaces block).
     ⚠️ NO unique constraint or unique index on linkedin_url, full_name, or any
     combination. The source contains ~27 genuine duplicate prospects and every
     snapshot re-stores every row. A unique key here would reject real data.
   • RLS on both tables: enable, and add SELECT-only policies for `authenticated`
     (mirror how `public.uploads` / `public.post_attributes` are protected — rows
     are written ONLY by the definer function; deliberately NO insert/update/
     delete policies).
   • Index `outreach_prospects (client_id, outreach_upload_id)` for the read path.
   • `public.ingest_outreach(p_client_id uuid, p_rows jsonb)` — SECURITY DEFINER,
     `set search_path = public`. Validates p_client_id exists (raise on unknown,
     errcode 23503) and that p_rows is a non-empty JSON array (errcode 22023).
     Inserts ONE outreach_uploads row, then every prospect row in the SAME
     transaction with row_index preserving source order, then returns
     `jsonb_build_object('upload_id', …, 'row_count', …)`. All-or-nothing.
     `revoke all` from public; `grant execute` to `authenticated`. Add a
     `comment on function` explaining the snapshot semantics.
   • Do NOT run `db push` or touch the hosted DB — applying is an out-of-band
     STAFF action via the Supabase SQL editor. Say so in REPORT BACK.
2. Parser — `src/lib/parse-outreach.ts` (+ test). PURE, no I/O. papaparse with
   `header: true, skipEmptyLines: true`, then a Zod schema over the EXACT 24
   headers (copy them verbatim from the spec — they contain spaces, parentheses
   and slashes, e.g. `Why They Fit (signal)`, `What Arcbound Offers (tier + hook)`,
   `Source / Citation`, `Rationale (1-line)`, `Meeting Booked (date)`,
   `Qualified (ICP)`).
   ⚠️ ONLY `Full Name` and `LinkedIn URL` are required. EVERYTHING else is
   optional and a blank cell maps to NULL — never to "", never to 0. The observed
   fill rates make this load-bearing: `Next Touch Date` is filled on 2 rows of
   1,435 and `Meeting Booked (date)` on 8.
   ⚠️ Store `Follow-up Count` AS TEXT like every other column. Do not coerce it to
   a number at the boundary (ADR 0009) — read-time is where interpretation lives.
   Map headers → snake_case keys matching the SQL columns. Return the same
   `{rows}` / `{error}` shape `parse-metrics.ts` uses.
   Tests: a valid 2-row file parses; a missing required header errors; blank
   optional cells become null (assert null, NOT ""); a row missing Full Name or
   LinkedIn URL errors; DUPLICATE LinkedIn URLs both survive (no dedup); source
   order is preserved; quoted fields containing commas/newlines survive
   (the real Notes and LinkedIn Message columns contain both).
3. Seam — `src/services/outreach.ts` (+ test):
   • `ingestOutreach(clientId: string, rows: OutreachRow[]): Promise<{uploadId: string; rowCount: number}>`
     — calls `supabase.rpc("ingest_outreach", {p_client_id, p_rows})`, validates
     the response with a Zod schema at the boundary (mirror `summarySchema` in
     `src/services/ingest.ts`).
   • `listOutreachUploads(clientId: string)` and `latestSnapshot(clientId: string)`
     — reads.
     ⚠️ A snapshot is ~1,435 rows and PostgREST silently caps a response at 1000.
     `latestSnapshot` MUST go through `src/lib/supabase/paged.ts` with a UNIQUE
     `.order()` (use `id`), and MUST surface `truncated` + `total` like the
     existing paged reads. Read `paged.ts` and an existing caller before writing
     this. A test must prove a >1000-row snapshot is fully read (or honestly
     reported as truncated) — a silent 1000-row cap here would understate every
     figure on the dashboard.
   • Add `OutreachUpload` / `OutreachProspect` types to `src/services/types.ts`
     (camelCase mirror of the SQL columns).

ACCEPTANCE
- The SQL pair exists, is registered in PAIRS, and `sql-sync.test.ts` passes.
- No unique constraint exists on any prospect source column; a fixture with two
  identical LinkedIn URLs round-trips as TWO rows.
- Blank optional cells are null end-to-end (parser → seam), never "" and never 0.
- `latestSnapshot` reads past 1000 rows (paged) or honestly reports truncation.
- `ingest_outreach` is all-or-nothing and attributes every row by the passed
  client_id; nothing infers a client from file content.
- Test count strictly up; no existing assertion weakened; every new test RED-first
  and mutation-verified. The LinkedIn ingest path is completely untouched.

VERIFICATION (the whole gate — nothing else)
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output pasted.
- Mutation table (real runs): (a) coerce a blank optional cell to "" → the
  "blank ⇒ null" test fails; (b) deduplicate rows by linkedin_url in the parser →
  the duplicate-survival test fails; (c) drop the paging from `latestSnapshot` →
  the >1000-row test fails; (d) remove a column from the paste-script only →
  sql-sync.test.ts fails.
- NO Claude-in-Chrome / dev-server walk. NO db push.

GUARDRAILS
- READ THE ACTUAL GIT STATE AT START and report it. Stay on
  `feat-outreach-system-dashboard`; never commit to `main`; SURFACE (never
  self-heal) any unexpected commit. LEAVE ALL WORK UNCOMMITTED.
- ⚠️ There is uncommitted LinkedIn Connection Count work in the tree. Build
  ADDITIVELY: do NOT revert, stash, reset, or reimplement it.
- Do NOT touch `public.linkedin_posts_staging`, `public.clients`, `public.uploads`,
  `public.post_attributes`, the `bi.*` views, or the existing ingest path.
- Do NOT build any UI, route, chart, or nav change — that is S2/S3.
- Do NOT canonicalise, bucket, or clean any value; that is read-time work in a
  later slice.
- If a change needs a file outside SCOPE, STOP and FLAG.

SCOPE — create/modify ONLY: `supabase/outreach-system.sql`,
`supabase/migrations/<fresh-ts>_outreach_system.sql`, `supabase/sql-sync.test.ts`,
`src/lib/parse-outreach.ts` (+ test), `src/services/outreach.ts` (+ test),
`src/services/types.ts`.

REPORT BACK
- Git state at start; files changed; final `git status --porcelain`.
- The exact 24 header strings your Zod schema expects, so they can be diffed
  against the real export.
- How blank-optional ⇒ null is enforced, and the test proving duplicates survive.
- How `latestSnapshot` pages past 1000 rows, and the test that proves it.
- The out-of-band DB apply that remains for staff.
- Full gate output + the mutation table (real runs); test count before/after.
- FLAGS: any header whose exact spelling you had to guess; anything you stopped
  short of; whether `Follow-up Count`-as-text causes friction you'd want revisited
  at read time.
```

## Feedback & revisions

- **2026-07-27 — v1 (authored).** From the `/grill-with-docs` session on the real
  1,435-row export. Carries the observed-data facts that drive the design: no
  unique key (27 duplicate prospects), blank-heavy optional columns
  (`Next Touch Date` 2 rows, `Meeting Booked` 8), quoted multi-line text in Notes
  / LinkedIn Message, and the >1000-row paging trap.
  _(Append dated entries as the executer reports back.)_

- **2026-07-27 — executer run: S1 BUILT, gate green, uncommitted.**
  - **Gate:** lint ✔, type:check ✔, test ✔ (908 → **959**, +51; 72 → **74** files),
    build ✔ (20/20). Planner **independently re-ran `pnpm test`: 74 files / 959
    passing — confirmed.**
  - **✅ HEADER CONTRACT VERIFIED AGAINST THE REAL FILE.** The executer's top flag
    was that the 24 headers were transcribed from the spec, not read from the
    export. The planner diffed `parse-outreach.ts`'s schema keys directly against
    `Arcbound_LinkedIn_Master_Database - Master DB.csv`: **all 24 match exactly —
    spelling AND order.** The contract is sound; no column will silently read
    blank.
  - **⚠️ BRANCH PREMISE STALE (surfaced, not healed).** The handoff said the
    Connection Count work was uncommitted; it had been committed between sessions
    as `b74fcb5` (by RafaelIIIPrudente). The executer built additively and touched
    nothing. Planner verified.
  - **Built:** SQL pair (`supabase/outreach-system.sql` ⇄
    `migrations/20260727130000_outreach_system.sql`) with `outreach_uploads`,
    `outreach_prospects` (24 raw text columns, **no unique key on any source
    column**), RLS select-only, and the all-or-nothing `ingest_outreach` RPC;
    `src/lib/parse-outreach.ts`; `src/services/outreach.ts`; types.
  - **Honesty proven:** one `optionalCell` preprocessor for all 22 optional
    columns, trimming only to DECIDE while storing the raw value (so
    `"  Replied 2026-07-13  "` keeps its whitespace, per ADR 0009). Guarded by a
    whitelist test asserting all 22 are null by name — not a spot-check — plus a
    dedicated test that `"0"` stays the string `"0"`.
  - **Paging:** `latestSnapshot` routes through `readAllPages` ordered by `id`
    (not `row_index`, which repeats across snapshots), filtered by
    `outreach_upload_id`. Proven with a real-size 1,435-row test asserting
    `not.toHaveLength(1000)` — the exact shape of the defect.
  - **Three states, deliberately:** unavailable / empty / ok — a snapshot that
    can't be read is never `ok` with `[]`. Divergence from `listUploads`:
    truncation returns rows + `truncated` + `total` rather than nulling, because a
    partial snapshot is worth showing beside `upload.rowCount`. **S3 must honour
    the flag** (now written into the spec).
  - **Mutations (a)–(d) all CAUGHT**, each RED-first and reverted.
  - **Spec error CORRECTED by the planner (flag #1 was valid).** The spec's
    File-Structure Map and Self-Review placed `src/lib/outreach-vocab.ts` in S1,
    while S1's slice text and this handoff's SCOPE excluded it. The executer
    correctly stayed in scope. The vocab module is now explicitly **S3**, and
    `parseCount(raw): number | null` (the executer's recommendation for
    `Follow-up Count`-as-text) has been added to it.
  - **⚠️ CARRY INTO S2 — the 25th-column risk.** A column added to the source
    sheet is currently dropped SILENTLY (the table has a fixed shape). The
    executer stopped rather than widening the interface and left a ⚠️ comment.
    S2 owns surfacing this as an upload warning: Bryan adding a column and
    getting nothing, with no error, is a real failure mode.
  - **Accepted without change:** `bigint` ids stringified at the seam (int8 past
    2^53 would lose precision as a JSON number); `ingest_outreach` not
    re-validating `full_name`/`linkedin_url` (the parser is the gate; a second
    gate could disagree about "blank"); `latestSnapshot` reading all uploads and
    taking the newest rather than `.limit(1)` (one row per upload, reuses the
    paging-tested reader).
