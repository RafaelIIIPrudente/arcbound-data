# ADR 0010 execution — ArcBase owns analytics end-to-end

**Date:** 2026-08-19
**Status:** Approved for execution. Refreshes
[`2026-07-25-full-analytics-ownership.md`](2026-07-25-full-analytics-ownership.md),
which stays valid as ARCHITECTURE and is stale in DETAIL (see "What changed under
the plan" below).
**Decision record:** [ADR 0010](../adr/0010-arcbase-owns-analytics-end-to-end.md)
(Accepted 2026-07-25, superseding ADR 0009) — **accepted on paper since July,
never implemented.** This document is the execution.

---

## The directive

> _"Execute ADR 0010 in full … App-owned `public.posts`, attribution by `client_id`
> FK at ingest, our own date resolver, our own interactions + engagement rate,
> `post_format_type` folded in, `bi.*` retired after a dual-write cutover … and
> let's drop all of Power BI and Shay in this system."_

Four defects die in one workstream: silent attribution loss, an undocumented
`interactions` number, a dropped format column, and hour-age dates.

---

## Measured state, 2026-08-19 (not inherited from the July plan)

**The `bi.*` read surface is FOUR call sites in THREE files** — smaller than
feared, and every one of them is a one-line repoint:

| File                        | Line | Call                                         |
| --------------------------- | ---- | -------------------------------------------- |
| `src/services/analytics.ts` | 643  | `.schema("bi").from("linkedin_post_latest")` |
| `src/services/bi-posts.ts`  | 156  | `.schema("bi").from("linkedin_post_latest")` |
| `src/services/clients.ts`   | 131  | `.schema("bi").from("linkedin_post_latest")` |
| `src/services/clients.ts`   | 186  | `.schema("bi").from("linkedin_post_latest")` |

⚠️ **The July plan's line numbers are all wrong now** (`analytics.ts:514`,
`bi-posts.ts:143`, `clients.ts:63,118`). Use the table above.

### ⚠️ A FIFTH READ SITE, FOUND 2026-08-19 AFTER S2 WAS BUILT — AND IT IS THE CLIENT-FACING ONE

The table above is the complete list of `bi.*` reads **in TypeScript**. It is NOT
the complete list of `bi.*` reads. `report_link_read` — the SECURITY DEFINER
function behind `/r/[token]`, the report a **Client** downloads — reads
`bi.linkedin_post_latest` directly in plpgsql, twice, plus `public.post_attributes`.

⚠️ **My S2 acceptance criterion (`grep '.schema("bi")' src/` returns nothing) was
true and incomplete.** A grep over TypeScript cannot see a read written in SQL. The
criterion passed while a whole client-facing surface stayed on the old source.

**Consequence if S2 deploys alone:** the staff report reads FK-attributed
`public.client_posts` while the Client's own report reads name-matched
`bi.linkedin_post_latest`. The two documents for the same Client can disagree, and
the wrong one is the one the Client is holding. It is latent rather than immediate
— the D1 staging repair means today's roster matches on both — but the first new
Premium client whose scraped author is mangled reopens exactly the ADR-0010 bug on
the client-facing surface only.

⚠️ **`report_link_read` HAS BEEN REDEFINED FOUR TIMES**, the same trap as
`ingest_metrics`. In order: `report-links.sql` → `outreach-report-link.sql` →
`outreach-email-report-link.sql` → **`outreach-void.sql` (`20260814120000`), which
is the LIVE definition.** Supersede that one; the other three are dead files.

**Therefore: Part A of S3 is a prerequisite for S2's deployment, not a follow-up.**
Either ship them together, or accept a knowingly divergent client report until S3
lands.

**`BiPostRow` — the firewall — is SEVENTEEN fields** (`analytics.ts:29`), unchanged
since July. It stays FROZEN. `POST_COLUMNS` (`bi-posts.ts:47`) is the 15-column
read projection; `SELECT_COLUMNS` (`analytics.ts:612`) is a narrower 12.

⚠️ **CORRECTED 2026-08-19: this said "18 fields" and was WRONG.** The error was
inherited from the July plan, which claims 18 and then lists 17, and I repeated it
into both the S1 and S2 handoffs. The S2 executer counted the interface directly
and flagged it rather than inventing an eighteenth column to satisfy the brief —
which is exactly the right failure mode, and the reason the view is correct anyway.
The count, verified: `client_id, client_name, linkedin_post_id, post_url,
post_content, post_age, estimated_post_date, impressions, likes, comments, reposts,
saves, interactions, provided_engagement_rate, calculated_engagement_rate,
scraped_at, uploaded_at` = **17**, of which 16 come from `public.posts` and
`client_name` from the join to `public.clients`.

**The live `ingest_metrics` is NOT the one in `ingest-write.sql`.** It has been
redefined three times; the live definition is the FIVE-argument version in
`supabase/uploads-connections-count.sql` (migration `20260727120000`), which adds
`p_connections_count`, writes `public.post_attributes`, and still writes
all-text `public.linkedin_posts_staging`.

⚠️ **An executer that edits `ingest-write.sql` edits a dead file.** Per the
repo's own rule, an applied script is never edited — the change ships as a LATER
twin pair.

---

## What changed under the July plan (corrections, not preferences)

1. ⚠️ **The "unmatched authors" surface does not exist.** The July plan's S3 says
   to remove it from Data Quality. `grep -ri "unmatched" src/` returns **zero
   hits**; `data-quality/` holds only summary, table and rate-reconciliation.
   **Delete this task** — do not send an executer hunting for it.

2. ⚠️ **A pre-write name-match GATE now exists that did not in July**, built after
   the Eitan Hoenig incident (2026-08-18, `7d76102`, merged). `author-match.ts`
   exports `cleanAuthorName`, `nameMatchWarning`, `authorMatchReport` and a whole
   confirmation screen, `name-mismatch-confirm.tsx`. **This is the sharpest
   hazard in the workstream** — see D3.

3. ⚠️ **Two SQL pairs are still UNAPPLIED and block this work**:
   `writers-registry.sql` (before the deploy) and `drop-staff-directory.sql`
   (after). New migration timestamps must land after them, and the DB must be in a
   known state before a table this central is added. **Apply those first.**

4. `post_format_type` already has an app-owned home (`public.post_attributes`,
   written by the live RPC and read by `src/services/post-attributes.ts`), so
   folding it into `posts` is a CONSOLIDATION of something that works — not the
   rescue of something broken.

---

## D1 — Sequencing: S1 → S2 → S3, and the gate between them is LIVE DATA

Three slices, each ending at a state that is safe to stay in indefinitely.

| Slice                                                     | Ends at                                                            | Reversible?              |
| --------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------ |
| **S1** Typed `posts` + new ingest + backfill (DUAL-WRITE) | `bi.*` still serves every read; `posts` is populated and unread    | Yes — stop using `posts` |
| **S2** Repoint the four seams to an app-owned view        | ArcBase reads its own data; `bi.*` still written, still intact     | Yes — revert 4 lines     |
| **S3** Retire                                             | Staging write dropped, `post_attributes` folded in, `bi.*` dropped | No                       |

⚠️ **S2 does not begin until the operator has run the S1 equivalence check
against LIVE data and read the row counts.** The standing lesson from the D1
staging repair applies: _a migration is not applied until its row count has been
seen._ A backfill that silently matched nothing looks identical to one that
worked, until the reports go blank.

---

## D2 — "Drop Shay" means ArcBase stops depending on him, in two separable acts

The directive is adopted. One distinction is worth keeping, because the two halves
carry very different risk:

- **Ours, unconditionally:** ArcBase stops READING `bi.*`, stops WRITING
  `linkedin_posts_staging`, owns the resolver, owns `interactions` and the
  engagement rate, and purges Power BI and Shay from the docs. Nothing outside
  ArcBase is touched. This is the whole of S1–S2 and most of S3.
- **Destructive and shared:** `drop view bi.linkedin_post_latest` /
  `drop table public.linkedin_posts_staging` mutate objects in a database ArcBase
  does not exclusively own. They are the LAST step, they are separately confirmed,
  and they happen only once ArcBase has demonstrably not read them for a while.

⚠️ **Keeping a dropped object is cheap; recreating a dropped table with its data is
not.** The recommendation is to finish S3's code, run on `posts` for a week, and
drop the objects after. The user may compress this; it is their call, and the plan
supports either.

---

## D3 — ⚠️ THE NAME-MISMATCH GATE'S COPY BECOMES A LIE, AND IT MUST CHANGE IN S2

`src/components/dashboard/ingest/name-mismatch-confirm.tsx` tells the operator, in
so many words:

> **"These posts won't appear under {clientName}"**

Under FK attribution that sentence is **false**. The operator's client selection
becomes authoritative, so the posts absolutely _will_ appear under that client —
that is the entire point of the ADR.

The gate is not deleted. It changes job, exactly as ADR 0010 says: from an
**attribution mechanism** ("these will be lost") to a **wrong-file guard** ("the
author on these rows isn't who you picked — is this the right file?"). The
consequence flips from data loss to misattribution, which is a different warning
with a different remedy.

⚠️ **This must land in the SAME slice as the repoint (S2), never later.** Between
the repoint and the copy fix, the app states a falsehood to staff on a screen
built specifically to stop a data-loss incident.

⚠️ `name-mismatch-confirm.test.tsx:80` asserts `/won't appear|never appear/i`. That
test currently PINS the false sentence. It must be rewritten, not deleted — and it
is the tripwire that proves the copy actually changed.

---

## D5a — The resolver, CALIBRATED AGAINST LIVE DATA (2026-08-20)

⚠️ **Every rule below is measured, not reasoned.** The first version of
`src/lib/post-date.ts` was written from five CSV rows in the repo and got the
most common unit in the entire dataset backwards. These are the numbers that
corrected it, kept here so nobody re-derives them from first principles.

**The real distribution of `post_age` across all 272 staging rows:**

| token | rows    | meaning      |
| ----- | ------- | ------------ |
| `m`   | **203** | months       |
| `w`   | 33      | weeks        |
| `y`   | 24      | years        |
| `d`   | 11      | days         |
| `h`   | 1       | hours → NULL |

⚠️ **Bare `m` is MONTHS.** It was briefly read as MINUTES on the reasoning that
the token is ambiguous and unsampled. 203 of 272 posts carry it against a single
`h`; that is a posting history, not a burst of posts scraped within the hour.
Reading it as minutes would have nulled the publish date of **75% of every future
upload** — counted in totals, silently dropped from every dated chart.
⚠️ Only the BARE token moved. `min`/`mins`/`minute`/`minutes` remain undatable.

⚠️ **Months and years follow DIFFERENT rules. Do not unify them.**

| unit  | rule                                             | evidence                                                                         |
| ----- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| month | first of month, `scrape_month − (N−1)`, midnight | `4m`/`3m`/`2m` scraped `2026-08-19` → `2026-05-01` / `2026-06-01` / `2026-07-01` |
| year  | same day of month, `N×12` months back            | `1y` scraped `2026-08-17` → `2025-08-17`                                         |

Assuming years followed the month rule was tried and was wrong; the test now
asserts the year branch does NOT produce the snapped value.

⚠️ **The month rule carries a known forward bias, accepted deliberately.** A post
"4 months old" on 19 August was published around 19 April; the rule returns
1 May — systematically later than the post can be. Consistency with all 271
already-loaded rows was chosen over accuracy against an unknowable true day.
**Do not "fix" this in isolation** — it would require backfilling the whole
table, not editing the resolver.

### ⚠️ A consequence for an existing client-facing chart

203 of 272 posts resolve to the **first of a month**. `impressionsByWeekday` —
"Average impressions by day of week posted" — is therefore driven for most of its
input by which weekday the 1st happened to fall on, not by posting rhythm. Only
the `d` and `w` rows (44) carry a meaningful weekday.

⚠️ **This is NOT introduced by ADR 0010.** The previous analytics layer resolved
the same way and the chart has always been computed from those values. It is
recorded here because the cutover made it visible and because a month-grained age
cannot support a weekday claim at all.

⚠️ **DECIDED AND SHIPPED (2026-08-20) — this paragraph's "open, and out of scope"
no longer holds.** The precision slice made date precision a first-class fact and
applied the granularity rule: a bucket at granularity G admits only posts whose
precision is at least as fine as G. The weekday charts now take the 11
day-precision posts and disclose the other 261; the cadence WEEK bars take 44 and
disclose 227; the monthly charts are unchanged, because month precision is exactly
month granularity.

⚠️ **BUT THE CADENCE GAP STATISTICS WERE NOT FIXED, AND THEY ARE WORSE THAN THE
BARS WERE.** `medianGapDays`, `longestGapDays` and `postsPerWeek` are still
computed over the full dated `timeline` in `cadence.ts:136`, not over the placed
subset. Every post sharing a month snaps to the SAME instant — the 1st at midnight
— so their pairwise gap is exactly `0`. With 203 month-aged posts spread across
roughly a dozen month values, the `gaps` array is dominated by zeros and
`medianGapDays` collapses toward **0 days** for any client who posts more than
once a month. Both surfaces are CLIENT-FACING: `posting-cadence.tsx` renders the
median and longest gap, and `report-status.tsx` renders `postsPerWeek` on the
tokenized `/r/[token]` report.

The slice also left the panel internally inconsistent: week bars built from 44
posts now sit beside a median gap built from 271, and only the bars carry a
disclosure.

⚠️ THE PLANNING BRIEF CAUSED THIS. Its consequence list named the weekly _buckets_
and not the statistics derived from the same timeline. The executer implemented
what was written and flagged the remainder rather than widening scope, which is
the correct behaviour. **A granularity rule applied to the buckets but not to the
figures computed from the same array is not a partial fix — it is a new
inconsistency.** Next slice.

---

## D4 — Four-state discipline survives typing, or the workstream has failed

The single non-negotiable. Today's staging is all-text and `bi.*` does the
coercion; when ArcBase types the columns it inherits that responsibility.

- Valid integer text → the number. `"0"` → **0** (a real measurement).
- `""`, null, non-numeric → **NULL** ("could not be read"). **NEVER 0.**
- `interactions` → NULL if any component is NULL — a partial sum presented as a
  total is the same lie as a null presented as a zero.
- `calculated_engagement_rate` → NULL when impressions is NULL **or 0**. No
  divide-by-zero, no fabricated rate.
- Every typed metric column is NULLABLE. A `not null default 0` anywhere in this
  schema is the defect.

The whole reporting layer's honesty — the em dashes, the "≥" lower bounds, the
`savesPartial` flag, the four-state discipline in `CONTEXT.md` — rests on this and
nothing else.

---

## D5 — ArcBase owns the date resolver, and hour-ages stay NULL

`src/lib/post-date.ts` (new, pure, TypeScript, unit-tested) replaces Shay's
resolver. `post_age` + `scraped_at` → `estimated_post_date | null`.

- Day / week / month ages subtract from `scraped_at`.
- ⚠️ **Hour and minute ages → NULL.** This matches the current behaviour and is
  load-bearing: `impressionsByWeekday` documents that bucketing a weekly scrape
  onto its scrape day _"fabricates a rhythm in a client-facing chart"_, and
  `weekdayUndatedPosts` exists to disclose the exclusion. Resolving hour-ages
  would silently invalidate a chart that is already correct.
- Malformed → NULL.
- **Resolved in TypeScript, not plpgsql** — Vitest can test it, and the RPC then
  receives already-resolved values.

⚠️ **Open question the resolver branches on:** does the scrape's raw
`post_date`/`post_age` text ever carry an ABSOLUTE date for older posts, or is it
always relative (`"4d"`, `"3w"`, `"23h"`)? Unanswered since July. The S1 handoff
resolves it empirically — from the real staging rows — rather than assuming.

---

## D6 — The historical backfill is the LAST legitimate use of the name-match

One-time function: existing staging rows → `posts`, attributed by a final
`clients.name ≈ cleaned post_name` match, reproducing exactly what `bi.*`
attributed so there is **no analytics regression on day one**.

⚠️ **Unmatched rows are SKIPPED AND COUNTED, never silently dropped** — and the
count is returned so the operator reads it. Those rows were invisible before too;
the difference is that now we know how many there are. Eitan Hoenig's 14 posts are
exactly this population.

⚠️ **The backfill must be idempotent** (`on conflict (linkedin_post_id) do …`) and
must `RETURNING`-count its work. Re-running it must not double-count or corrupt.

---

## D7 — Power BI and Shay come out of the documentation too

Thirteen documents name Power BI. The sweep is part of S3, not a separate chore,
because a document that still describes the pipeline as
`scraper → ArcBase → Supabase views + Power BI` will re-teach the retired
architecture to the next session that reads it — `CLAUDE.md` does exactly that
today, in its opening paragraph.

Files: `CLAUDE.md`, `CONTEXT.md`, `docs/SRS/SPEC.md`, `docs/SRS/CLAUDE.md`,
`docs/specs/2026-07-16-arcbase-v1.md`, plus the design brief's schema notes.

⚠️ **ADRs are NOT rewritten.** 0008, 0009 and 0010 are a decision record; their
Power BI references are history and history stays. Only ADR 0009's _Status_ is
touched, and it already says superseded.

⚠️ Handoff and decision docs under `docs/handoffs/` and `docs/decisions/` are also
historical records — left alone.

---

## Frozen behind the firewall — do NOT touch in any slice

The reporting layer neither knows nor cares about the source swap:
`client-report.ts`, everything in `components/dashboard/report/` and
`components/dashboard/analytics/`, `posting-cadence.tsx`,
`content-composition.tsx`, `interactions-comparison.tsx`, the report-link
surfaces. They consume `BiPostRow`. If a reporting file needs to change, the view
is wrong — **stop and flag rather than editing the reader.**

---

## Interaction with the queued "Total impressions" slice

`docs/decisions/2026-08-19-total-impressions-hero-figure.md` is handed off and
unstarted. It touches `client-report.ts`, which is frozen here, and it reads
`BiPostRow.impressions`, which this workstream preserves exactly.

**They do not conflict.** Land whichever is convenient first; if both are in
flight, keep them on separate working trees to avoid two executers racing in one
checkout — a failure mode this repo has already hit once.

---

## Verification policy (all slices)

`pnpm lint && pnpm type:check && pnpm test && pnpm build`, plus unit and component
tests. **No Claude-in-Chrome, no dev-server walk** — standing instruction.

⚠️ **No Postgres runs in the test suite.** Every SQL assertion in this repo is a
SOURCE-TEXT assertion: it pins the characters in the file, never the behaviour of
the database. The backfill's correctness, the view's column types and the RPC's
NULL handling are provable ONLY by the operator running them and reading the
counts. Say so plainly in every report; never let a green suite imply a verified
migration.

SQL is applied by staff via the Supabase SQL editor — never `db push`, never by an
agent.

---

## Feedback & revisions log

| Date                    | From    | Change                                                                                                                                                                                                               |
| ----------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-25              | Bryan   | Green-signal pivot: retire Power BI, ArcBase becomes the analytics terminal. ADR 0010 written and accepted.                                                                                                          |
| 2026-07-25 → 2026-08-19 | —       | Not implemented. Four reporting workstreams shipped on top of `bi.*` in the meantime.                                                                                                                                |
| 2026-08-19              | Bryan   | _"Execute ADR 0010 in full … and let's drop all of Power BI and Shay in this system."_ Sequencing decided: S1 → S2 → S3.                                                                                             |
| 2026-08-19              | Planner | Re-measured against live code: seam line numbers corrected, dead `ingest-write.sql` identified, "unmatched surface" task deleted as void, name-mismatch-gate copy hazard (D3) added, unapplied-SQL blocker surfaced. |

---

## S4 — OUTCOME, INDEPENDENTLY VERIFIED (2026-08-20)

S4 (the D7 documentation purge + the `bi` identifier rename) is **built, uncommitted,
and verified by the planner rather than accepted on report.**

### The gate, re-run by the planner on an idle machine

    LINT:0  TSC:0  TEST:0  BUILD:0
    Test Files  151 passed (151)
         Tests  2599 passed (2599)      0 skipped, 34.72s

Identical to the pre-S4 baseline of 2,599, which was the point: a prose-and-identifiers
slice that changed the count would have changed behaviour.

⚠️ A STALE FAILING RUN NEARLY CAUSED A FALSE REPORT. A background gate from
`2026-08-19 22:45` read `152 files / 2601 tests / 55 skipped / 4 failed` and was still
sitting in the session. It predated S4 entirely. The 55 "skipped" is the tell: Vitest
abandons the remainder of a file it times out on, so a load-degraded run inflates the
file count and invents skips. **A test count is only comparable between runs of the same
tree on a comparably loaded machine.**

### "No behaviour change" was PROVEN, not asserted

Method: for every modified non-test source file, take the pre-image at `HEAD`, apply the
same identifier substitutions the slice applied (`BiPostRow`→`PostMetricsRow`,
`biRow`/`biRows`/`biPages`/`biError`/`biCount`→`metrics*`, `bi-posts`→`post-metrics`),
and diff against the working tree. Whatever survives is a change the rename does not
explain.

Result: **every surviving line is a comment, in every file but one.** Four service
modules — `report-links.ts`, `data-quality.ts`, `content-composition.ts`, `cadence.ts` —
survived byte-identical: pure renames. The renamed module `bi-posts.ts` →
`post-metrics.ts` differs only by a four-line comment replaced with a corrected
four-line comment.

The single exception is `src/lib/metric-definitions.ts`, where two string literals
changed. Those are the ⓘ tooltips on the Client List, and the change was disclosed.

### ⚠️ FINDING — the replacement tooltip OVERCLAIMS, and a test locks it in

The old Posts tooltip was false about the mechanism going forward and was correctly
rewritten. The replacement went one step too far:

> "A post belongs to whichever client was chosen on the upload form — a recorded link,
> not a guess from the author name on the row — so a client whose name is written
> differently in the scrape is still counted correctly here."

True for every upload from here on. **False for the migrated history**, and
`supabase/posts-ownership.sql` says so itself at line 517 and in its own `comment on
function`: the backfill "attributes by the SAME exact name match `bi.linkedin_post_latest`
uses — the last legitimate use of it". The live backfill returned
`skipped_unmatched: 1`. A spelling difference did lose a post — once, permanently.

The tooltip does mention migration-loaded posts, but only to excuse a blank upload date,
never as a population attributed by a different and lossier rule.

⚠️ THE TEST MAKES THE HONEST VERSION FAIL. `metric-definitions.test.ts` asserts
`expect(posts).not.toMatch(/name match/i)` under a comment reading "a spelling difference
cannot lose a post." Adding the qualifier would go RED. The pin must be narrowed before
the copy can be corrected.

This is the Eitan Hoenig failure shape (see the name-match attribution gate): a Premium
scrape name failed this exact join and stranded 14 posts. The hazard is historical now,
not growing — but it is not zero, and the tooltip currently reads as though it is.

### FINDING RESOLVED (same session, 2026-08-20)

Fixed RED-first, on the operator's instruction. The new disclosure assertion was run
against the old copy first and failed on exactly the intended clause —
`expected 'How many posts ArcBase holds for this…' to match /left behind|did not match|missing/i` —
before the copy moved.

**The test.** Both blanket forbids came out. `not.toMatch(/name match/i)` and
`not.toMatch(/under-?counted/i)` were written to kill a false warning, but they also
banned the only accurate words for the migration's lossier rule — a pin that made the
honest version fail. They are replaced by a positively-pinned test,
_"discloses that MIGRATED history was matched by NAME and can be short"_, whose ⚠️
comment carries the `skipped_unmatched: 1` evidence and the Eitan Hoenig precedent so a
future reader cannot mistake the disclosure for boilerplate and delete it.

**The copy.** The absolute claim is now scoped, and the second population is named:

> "…**For anything uploaded here**, a post belongs to whichever client was chosen on the
> upload form — a recorded link, not a guess from the author name on the row — so a
> spelling difference in the scrape cannot lose it. **Older history arrived by a one-time
> migration that did match on the author name, so a post whose name did not match was
> left behind and is missing from this count.** That migration is also why this can show
> a count for a client with no upload date beside it. A dash means the count could not be
> read, which is never a zero."

Gate after the fix: `LINT:0 TSC:0 TEST:0 BUILD:0`, 151 files, **2,600** tests.

⚠️ THE COUNT MOVED 2,599 → 2,600 ON PURPOSE. One test was added, none altered in what it
checks. The S4 rule that the count must not move applied to a prose-and-identifiers
slice; this is a new claim being pinned, and an unexplained count is the thing the rule
guards against, not a changed one.

### The general lesson: a corrected overclaim is still an overclaim

Both the original copy and its replacement were confident single sentences about a number
fed by two differently-attributed populations. The first was wrong about new uploads; the
second was wrong about migrated history. **Correcting a false claim by inverting it
reproduces the defect with the sign flipped.** The honest form names both populations and
the rule each was attributed by — which is the four-state discipline applied to
provenance rather than to values.

### Guardrails held

- `docs/adr/`, `docs/handoffs/`, `docs/decisions/` — untouched.
- `docs/specs/2026-07-25-full-analytics-ownership.md` — +2 lines, the superseded pointer
  and a blank. Body untouched.
- No `.sql` file written or modified. Nothing dropped.
- `grep -rn "Power BI" docs/adr/` → **7**. The record was preserved, not swept.

### Flagged, not fixed

`src/graphify-out/cache/stat-index.json` still indexes `bi-posts.ts` by its old path.
It is **untracked** (0 files tracked under `src/graphify-out/`; the real graph is the 61
tracked files at the repo root), so it cannot reach anyone through git. It regenerates
with `graphify update`, which executers are forbidden to run.

---

## D5b — Cadence gap statistics: OUTCOME, INDEPENDENTLY VERIFIED (2026-08-20)

The slice D5a's correction opened. Verified by re-running the gate myself on an idle
machine and reading the implementation, not by accepting the report.

### Gate, my own run

`LINT:0 TSC:0 TEST:0 BUILD:0` · `Test Files 151 passed (151)` · `Tests 2680 passed
(2680)` · 0 skipped · 116s wall. Baseline 2,652 → **+28**, and the count is comparable:
single pass, no timeouts, no abandoned files.

### ⚠️ The parallel session committed the precision slice under a misleading message

`8f4f590 feat: add migration script to retire external analytics layer (ADR 0010)` is
**30 files / +2,531 lines**. The retirement SQL is two of them; the other 28 are the
date-precision slice (`post-date.ts`, `analytics.ts`, both weekday charts,
`print-report.tsx`, `types.ts`, …). The git history now attributes the largest honesty
fix in this workstream to a migration script. Recorded, not rewritten.

State at time of writing: HEAD `8f4f590`, **6 ahead** of `origin/main` (`ac91891`), 9
files uncommitted (this slice).

### The four figures were separated, and that was the right shape

| figure                             | decision                                                                       | why it holds                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `medianGapDays` / `longestGapDays` | **withheld** unless every dated post is day-precise **and** nothing is undated | a gap needs both endpoints precise **and** completeness of the interval |
| `postsPerWeek`                     | **kept**                                                                       | a rate is a count over one span; interior dates cancel                  |
| `daysSinceLastPost`                | **withheld** unless the last post is day-precise                               | a recency inherits exactly one post's precision                         |
| the bars                           | untouched                                                                      | already correct at their own granularity                                |

The executer added the second gap condition — `undatedPosts === 0` — which the brief did
not name but its own definition requires. An undated post is a post known to have
happened and impossible to place, so it may sit inside any gap; "nothing was published
between these two" becomes unknown, not true. Correct, and kept.

**The trap was avoided.** `gaps` is computed over `timeline`, guarded by
`gapsAreKnowable`, and the loop is skipped entirely rather than run over a filtered
array. Verified by reading `src/services/cadence.ts`, not inferred from the report.

The sharpest test in the slice is the one that separates a measurement from an artifact
using identical arithmetic:

```ts
expect(buildCadence(sameDayReal, NOW).medianGapDays).toBe(0); // measured
expect(buildCadence(sameMonthArtifact, NOW).medianGapDays).toBeNull(); // artifact
```

### One find beyond the brief, endorsed: a false reason spoken aloud

Every withheld figure carries an `sr-only` reason. The existing text said a gap "needs at
least two dated posts" — true when written, and a **lie** against a history of twelve
posts. A screen-reader user was being told something false about the person the report is
about. `gapReason()` now returns the real cause. This is the D5a lesson recurring: the
first copy was true of the case that existed when it was written, and the population
changed underneath it.

### ⚠️ FINDING — `year` is claimed as MONTH precision, and that claim is false

`post-date.ts` maps `year → month` with this justification:

> ⚠️ `year` IS `month`, NOT `year`. "1y" resolves to the same day-of-month twelve months
> back, so the day is inherited from the scrape while the month is genuinely asserted by
> the age. Month is the finest honest answer.

**The month is not asserted by the age.** LinkedIn floors its relative stamps, so "1y"
means _at least 12 months, less than 24_ — exactly as "3w" means 21–27 days and "3m"
means 3–4 months. The resolved instant is therefore the **latest** the post can be, and
the true date runs up to twelve months earlier. The asserted month is right only for a
post 12–13 months old and wrong for everything else in the window.

The comment reasons about which _component of the timestamp_ the age fixes — day-of-month
inherited, month asserted. That is the wrong question: the age does not fix a month at
all, it fixes a year-wide range. The `d`/`w`/`m` rungs of the ladder are sound for exactly
the reason `y` is not.

**This is the same defect class the precision slice just fixed one tier up**, and it has
three live consumers over the 24 `y`-aged posts:

1. **The monthly bars** place each of them in one specific month bar the age cannot
   support — the weekday defect, one granularity coarser.
2. **`postsPerWeek`.** `firstMs` is the oldest post, which in a 272-post history is very
   likely `y`-aged. Coarse resolutions are biased **late**, and the oldest post carries
   the largest bias, so `activeSpanDays` is systematically **understated** and the rate
   systematically **overstated** — by up to a factor of two if the oldest post is a "1y"
   that is really 23 months old.
3. **The new `/r/[token]` string.** "Around Jul 2025" for a `y`-aged last post is a
   manufactured month on a document the client opens.

⚠️ **AND IT UNDERCUTS THE `postsPerWeek` JUSTIFICATION AS WRITTEN.** The comment defending
the kept rate says "an endpoint uncertain by up to a month is a small relative error."
That bound is true for the 203 `m` posts and **false for the 24 `y` posts**, where it is
up to eleven months. The executer flagged the `y` mapping and defended the rate in the
same report without connecting the two. The decision to keep the rate still looks right to
me; the stated bound does not, and a justification that understates its own error by an
order of magnitude is the kind of comment this repo treats as binding.

Fixing it means a fourth `DatePrecision` rung — `year`, coarser than `month` — which is
why it could not be done inside this slice's scope. That is the next honesty slice.

### ⚠️ Recorded again: the month snap's forward bias now has a client-facing consumer

`snapToMonthStart` carries a documented, deliberately accepted forward bias — "a post '4
months old' on 19 August was published around 19 April; this returns 1 May". Consistency
with every already-loaded row was chosen over accuracy, and unwinding it is a whole-table
backfill, not a resolver change.

That trade was made when the bias fed bars. It now also feeds **"Around Jul 2026"** on the
tokenized report, for 203 of 272 posts, roughly one month later than truth. "Around"
softens the claim without making it correct. Not a defect introduced by this slice —
but the first time the bias is spoken to a client in words, which is a different bar from
a bar chart, and it should be weighed before the deploy rather than after.

### Guardrails held

No commit, no push, no SQL applied, no browser walk. Nine files modified, all uncommitted.
Two files touched beyond the scope list, both required by in-scope changes and both
disclosed: `client-report.test.ts` (a re-target) and `public-report.test.tsx` (fixture
fields only).
