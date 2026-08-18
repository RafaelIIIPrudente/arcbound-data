# Decision record — Posts uploaded but not displayed (name-match attribution failure)

**Status:** 🔴 DIAGNOSED · immediate repair specified · durable fix handed off.
**Reported:** 2026-08-18 — _"I have uploaded for Eitan Hoenig, it records the
uploads but the posts doesn't display in the system."_
**Baseline:** `main` @ `6b6cefc` (PR #21 merged), 2,265 tests green.
**Planner session.** Nothing here is implemented.

---

## Diagnosis — certain, confirmed against the live database

Client attribution for LinkedIn posts is a **downstream name match** (ADR 0009).
`bi.linkedin_post_latest` INNER JOINs staging to `clients` on:

```sql
clients.name = TRIM(regexp_replace(post_name, '\s*•\s*You\s*$', '', 'i'))
```

⚠️ **Exact, case-sensitive string equality.** The only leniency is stripping ONE
trailing ` • You`.

|                           |                                                                      |
| ------------------------- | -------------------------------------------------------------------- |
| ArcBase `clients.name`    | `Eitan Hoenig` — **12 chars, clean**                                 |
| Scraped `post_name`       | `Eitan Hoenig Eitan Hoenig • You Premium • You`                      |
| After the join's cleaning | `Eitan Hoenig Eitan Hoenig • You Premium` — **39 chars**             |
| Join result               | ❌ no match — **all 14 posts dropped**                               |
| Symptom                   | Upload recorded in `uploads`; report reads "No posts in this period" |

### Root cause is the SCRAPER, and it is Premium-specific

Blast radius query over all of staging returned exactly two distinct authors:

| `post_name`                                     | Cleaned      | Posts | Matches |
| ----------------------------------------------- | ------------ | ----- | ------- |
| `Bryan Wish • You`                              | `Bryan Wish` | 41    | ✅      |
| `Eitan Hoenig Eitan Hoenig • You Premium • You` | _(39 chars)_ | 14    | ❌      |

⚠️ **Bryan's scrape is clean `Name • You`; Eitan's has the name DUPLICATED plus a
`Premium` badge swept in.** The scraper is capturing LinkedIn's whole author
block rather than the name node. **Every future Premium client breaks identically
on day one.**

---

## Why ArcBase cannot fix this at the source

⚠️ **The join lives in `bi.linkedin_post_latest`, which is Shay's view, not
ArcBase's.** ArcBase writes to `public.linkedin_posts_staging` (all-text, **no
`client_id` column**) and reads back from the `bi.*` views.

⚠️ **AND ARCBASE ALREADY KNEW THE ANSWER.** Staff picked Eitan from a dropdown at
upload time, so `client_id` was in hand. The name match _discards information the
app already has._ That is precisely what **ADR 0010** (Accepted, unimplemented)
exists to correct.

⚠️ But ADR 0010 is **not a quick fix**: staging has no `client_id`, so
attribution-at-ingest needs ArcBase's own posts table (ADR 0006). Workstream, not
slice. **Recorded so it is not mistaken for a small change.**

---

## The three layers, and who owns each

| Layer                            | Owner                      | Fixes                                                                      |
| -------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| **1. Scraper author extraction** | ⚠️ **Shay** — external     | The root cause. Without it, every re-scrape re-breaks Eitan                |
| **2. Upload-time confirm step**  | **ArcBase** ⬅️ handed off  | Stops the SILENT failure. Cannot fix attribution itself                    |
| **3. Data Quality visibility**   | ArcBase — ✅ already built | `severityRank` ranks `submitted > 0 && attributed === 0` as **severity 1** |

### Layer 3 already works and should have caught this

`data-quality.ts:170` — Eitan is `submitted 14 / attributed 0`, which is rank 1,
top of the screen. ⚠️ **If he is NOT at the top of Data Quality, that is a third,
separate defect** and should be raised.

---

## D1 — The immediate repair, and what it costs

The only lever ArcBase controls is the staging data. Renaming the client to match
the mangled string was rejected: it corrupts the client record and the report
title to satisfy a join.

```sql
create table if not exists public.linkedin_posts_staging_repair_20260818 as
select * from public.linkedin_posts_staging
 where post_name = 'Eitan Hoenig Eitan Hoenig • You Premium • You';

update public.linkedin_posts_staging
   set post_name = 'Eitan Hoenig • You'
 where post_name = 'Eitan Hoenig Eitan Hoenig • You Premium • You';  -- expect 14
```

⚠️ **THIS EDITS A RAW SCRAPED VALUE, WHICH ADR 0009 FORBIDS.** Accepted as a
one-off repair of a known scraper defect rather than a reinterpretation of data —
hence the backup table. ⚠️ **It will be UNDONE by the next scrape** until layer 1
is fixed.

## D2 — Confirm step, not a hard block (user's decision, 2026-08-18)

⚠️ A hard block would be wrong: a mismatch is sometimes legitimate (a genuine
rename, a co-authored post), and blocking would leave staff holding data they
cannot get in, with no override. A confirmation stops the silent failure without
stranding anyone.

### Why the current warning is too weak

`upload/actions.ts:102-112` computes the mismatch **AFTER `ingestMetrics` has
already written**, then attaches it to the success screen. ⚠️ **The write is
irreversible before anyone is told**, and the message competes with a success
summary. The inputs needed — `parsedPayload.rows` and `clientId` — are both
available at line 88, _before_ the write.

---

## D2 built — planner verification, 2026-08-18

Branch `feat--pre-write-name-match-gate` off `main` @ `6b6cefc`, uncommitted.
Gate re-run by the planner: lint ✅ · tsc ✅ · **137 files / 2,298 tests** ✅
(baseline 2,265 → +33). Neither known flake fired.

**Verified by the planner, not taken on report:**

| Claim                                | How it was checked                                                           | Result                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Gate runs before the write           | Read `actions.ts:140` — the check sits above the `ingestMetrics` call at 146 | ✅                                                                       |
| Exhaustiveness genuinely breaks      | Deleted the `case "name-mismatch"` from the switch, ran `tsc`                | ✅ `TS2322 … not assignable to type 'never'`; restored, sha256 identical |
| "Could not check" ≠ "matches"        | Read `checkAuthorNames` — a failed read returns `unchecked`, cannot throw    | ✅ three states, none collapsed                                          |
| No SQL / `bi.*` / ingest RPC touched | `git status`, `git diff --stat`                                              | ✅ 8 modified + 2 new, all in scope                                      |
| `getClient` is per-request cached    | `clients.ts:246` — `export const getClient = cache(...)`                     | ✅ the extra read costs nothing on the `ok` path                         |

### 🔴 DEFECT FOUND BY THE PLANNER — the gate creates an unescapable loop

⚠️ **A scrape that BOTH mismatches on name AND needs Format Review can never be
uploaded at all.** `confirmNameMismatch` is scoped to a single dispatch, and the
form rebuilds `FormData` from scratch on every submit:

| #   | Dispatch             | Flags sent                                          | Server answer                              |
| --- | -------------------- | --------------------------------------------------- | ------------------------------------------ |
| 1   | Upload metrics       | —                                                   | `name-mismatch`                            |
| 2   | Upload anyway        | `confirmNameMismatch`                               | `review` (gate passed; formats unresolved) |
| 3   | Trust scraper & skip | `skipReview` — ⚠️ **confirmation dropped**          | `name-mismatch` again                      |
| 4   | Upload anyway        | `confirmNameMismatch` — ⚠️ **skip/formats dropped** | `review` again                             |

→ back to 3. **Proved executably**, not by reading: a throwaway component test
drove the real `UploadForm` against an action mock mirroring the real ordering —
four dispatches, both screens alternating, nothing written. The proof file was
deleted and the tree restored.

⚠️ **This is reachable by default, not an edge case.** `computeReviewPosts`
(`ingest.ts:59`) sends a post to review whenever its `post_format_type` is not a
confident value — which is why Format Review exists at all. A mangled-author
scrape with blank format types hits both gates.

⚠️ **It is a REGRESSION.** Before this slice the same upload landed (with the
weak post-write warning). The slice trades a silent failure for a dead end.

**Fix (D3): the confirmation must be scoped to the FLOW, not the dispatch** — and
scoped to the exact `(client, payload)` it was granted for, so that changing
either re-fires the gate. Anything stickier re-opens the silent write this whole
decision exists to close.

## D3 shipped — the loop is closed, planner-verified

`upload-form.tsx` now records **what** was confirmed rather than **that**
something was:

```ts
const granted =
  extra?.confirmNameMismatch === true ||
  (confirmedFor !== null &&
    confirmedFor.clientId === clientId &&
    confirmedFor.sourceType === sourceType &&
    confirmedFor.rawText === rawText);
```

⚠️ `actions.ts` was NOT changed, and should not be: re-running the gate on every
dispatch is the honest server behaviour — it cannot know what an earlier dispatch
was told. The form is what has to keep re-sending the confirmation.

**Planner verification — own harness, not the executer's tests.** Four throwaway
tests drove the real `UploadForm` against an action mock mirroring the real
ordering, then were deleted:

|     | Check                                             | Result               |
| --- | ------------------------------------------------- | -------------------- |
| A   | Mismatch + Format Review now LANDS (the loop)     | ✅ "Upload complete" |
| B   | Confirmation does not leak to a different CLIENT  | ✅ gate re-fires     |
| C   | Confirmation does not leak to a different PAYLOAD | ✅ gate re-fires     |
| D   | An unchanged resubmit still carries it            | ✅ not vacuous       |

Then the guard was mutated to a **bare sticky boolean**: A and D stayed green, B
and C went red. ⚠️ **That is the shape of the wrong fix, and it now has a test
standing on it** — a bare flag closes the loop and reopens the silent write.
Restored, sha256 `b9885726…c02c9d` identical.

Gate: lint ✅ · tsc ✅ · **137 files / 2,307 tests** ✅ (+9). Uncommitted on
`feat--pre-write-name-match-gate`.

⚠️ Still unproven, and stated rather than assumed: no test in this repo touches
Postgres or the `bi.linkedin_post_latest` join. `cleanAuthorName` mirrors that
join in TypeScript, and the mirror is an assumption. If the view's cleaning ever
changes, these tests stay green while the gate quietly stops matching reality.

## D1 applied — 2026-08-18, live-verified

The join condition is now confirmed **against the view's own DDL**, not against a
code comment:

```sql
JOIN clients c ON c.name = TRIM(regexp_replace(s.post_name, '\s*•\s*You\s*$', '', 'i'))
```

⚠️ `relkind = 'v'` — a plain view, not materialized. No refresh step exists or is
needed; a staging edit is visible immediately.

⚠️ **THE FIRST ATTEMPT AT D1 NEVER RAN.** A follow-up check found staging still
holding the 45-char mangled string with 0 attributed — the repair had been
believed applied and was not. The lesson is cheap and general: **a repair is not
applied until its row count has been seen.** The re-run used `RETURNING` so the
count could not be missed.

| Step                                            | Result                                 |
| ----------------------------------------------- | -------------------------------------- |
| Backup `linkedin_posts_staging_repair_20260818` | created                                |
| `UPDATE … RETURNING`                            | **14 rows**                            |
| staging now                                     | `Eitan Hoenig • You`, len 18, 14 posts |
| `bi.linkedin_post_latest` for `770d8f12-…838e`  | **14 attributed** (was 0)              |

Client id: `770d8f12-5b25-4cd2-8f12-dd01e064838e`, `clients.name` = `Eitan
Hoenig` (12 chars, clean — never the problem).

⚠️ **THIS IS UNDONE BY THE NEXT SCRAPE.** Layer 1 is untouched: the scraper still
captures LinkedIn's whole author block for Premium accounts. The difference is
that the D2/D3 gate now stops the _next_ upload and says so before it writes.

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | 2026-08-18 | D1 APPLIED and live-verified: 14 rows updated, staging now `Eitan Hoenig • You` (18 chars), `bi.linkedin_post_latest` returns **14 attributed** for him (was 0). The view's DDL was read directly and matches what the gate mirrors — the join assumption is now measured, not inferred; `relkind = 'v'`, so no refresh exists. ⚠️ Recorded because it nearly cost a second cycle: the FIRST D1 attempt never ran, and was believed applied — a repair is not applied until its row count has been seen.                                                                                                                         |
| 3   | 2026-08-18 | D3 shipped and planner-verified on an independent harness: the loop is closed (mismatch + Format Review now lands), and the confirmation is keyed to `(clientId, sourceType, rawText)` so it cannot carry to a different client or payload. Mutating the guard to a bare sticky boolean keeps the loop closed but reopens the leak — proved, and now covered by tests. `actions.ts` deliberately unchanged. 2,307 green. ⚠️ ArcBase's side of this is DONE; layer 1 (Shay's scraper) and the D1 staging repair are not, and Eitan's 14 posts are still invisible until the repair runs.                                          |
| 2   | 2026-08-18 | D2 built on `feat--pre-write-name-match-gate` (uncommitted, 2,298 green) and verified by the planner rather than accepted on report: gate confirmed pre-write, exhaustiveness confirmed by a `tsc` mutation, the `unchecked` third state confirmed non-collapsing. ⚠️ **Planner found a defect the executer did not**: `confirmNameMismatch` is dispatch-scoped, so a scrape that also needs Format Review loops between the two screens forever and can never be uploaded — a REGRESSION, proved executably with a throwaway test since deleted. D3 = scope the confirmation to the flow, keyed to the exact (client, payload). |
| 1   | 2026-08-18 | Created from the live investigation. Root cause confirmed against the database: the scraper emits a duplicated-name + `Premium` badge author string for Premium accounts, which fails the BI view's exact-match join and strands all 14 posts. Blast radius: only Eitan today; every future Premium client breaks the same way. Records that ArcBase cannot fix the join (Shay's view) and that ADR 0010 would kill the class but needs an app-owned posts table first. D1 = one-off staging repair, accepted with its ADR 0009 tension stated. D2 = user chose a **confirm step** over a hard block.                            |
