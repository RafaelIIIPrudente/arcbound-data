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
