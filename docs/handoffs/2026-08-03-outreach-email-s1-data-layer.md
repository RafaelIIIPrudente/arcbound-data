# Handoff — Outreach Email channel, S1: data layer

**Status:** 🟢 LANDED — A1 and A2 both applied and planner-verified 2026-08-03.
Gate green and independently reproduced on the planner's machine (lint 0 · type:check 0 ·
test 0), **125 files / 1,843 tests**, 28.0 s. Uncommitted, as instructed.
**The SQL is now safe to paste into the Supabase SQL editor.**

**Branch:** `feat-outreach-email-channel` off `893d9c7`.
**Decision record:** [`docs/decisions/2026-08-03-outreach-email-channel.md`](../decisions/2026-08-03-outreach-email-channel.md) (D1–D7).

---

## What the slice delivered

15 `text` columns on `public.outreach_prospects`, `has_email_channel` on
`public.outreach_uploads`, a three-argument `ingest_outreach`, a 39-header parser, and
the four coupled read artefacts (`OutreachRow`, `OutreachProspect`, `ProspectRow` /
`PROSPECT_COLUMNS` / `toProspect`). New SQL pair registered in `sql-sync.test.ts`.

**Test count 1,827 → 1,837.** No assertion weakened, skipped or deleted.

---

## Planner verification (independent, not taken on report)

| Claim                                          | Verified how                                                   | Result                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Gate green at 124 / 1,837                      | Re-run from clean start on the planner's machine               | ✅ exact match                                                                                               |
| Diffstat 10 files / 512 / 17 + 2 new SQL files | `git diff --stat`, `git status`                                | ✅ exact match                                                                                               |
| The 3 out-of-scope edits are fixture-only      | Full `git diff` of all three read                              | ✅ 15 null defaults before `...over`; no logic touched                                                       |
| The em-dash header guard is real               | Mutation re-applied by the planner (`Email — Status` → hyphen) | ✅ RED — 3 tests in that file, incl. one asserting the error names `email — status`; restored byte-identical |

Restore used `cp`/`diff -q`, never `git checkout --` — the work is uncommitted.

---

## A1 — ✅ RESOLVED 2026-08-03 — the deploy-order window (was blocking)

`supabase/outreach-email-channel.sql` drops the two-argument `ingest_outreach` and
creates a three-argument replacement **with no default**, while `ingestOutreach` now
sends three arguments. That makes the change non-atomic across the code/database
boundary in a way neither ordering survives:

- **SQL applied first** → production ArcBase is still the old build and sends two
  arguments. The two-argument function no longer exists. **Every outreach upload fails**
  until the new build deploys.
- **Code deployed first** → the new build sends three arguments to a database that still
  has only the two-argument function. **Every outreach upload fails** until the SQL is
  applied.

There is no order that avoids a broken window, and the failure is silent to anyone not
uploading at that moment.

**The fix is one word, in both files of the pair:**

```sql
create or replace function public.ingest_outreach(
  p_client_id          uuid,
  p_rows               jsonb,
  p_has_email_channel  boolean default false
)
```

A two-argument call then resolves to this function and takes `false` — which is not a
fallback, it is **the correct value**: any caller still sending two arguments is the old
build, which parses only 24 columns and genuinely carried no email block. The new build
passes `true` explicitly. Both orders are correct, and the window disappears.

⚠️ Make this change BEFORE the script is pasted. Amending the signature afterwards means
a second `drop function` / `create` round against a live database.

---

## A2 — ✅ RESOLVED 2026-08-03 — two stale comments inside an IN-SCOPE file

The brief's guardrail was: _"do not silently leave a comment in place that your change
has made false."_ The executer flagged the stale comment in
`src/app/(app)/upload/outreach-actions.ts:55` (out of scope, correctly reported) but
missed two in `src/lib/parse-outreach.ts`, which it edited:

- **line 8** — _"the 24-column 'Arcbound LinkedIn Master Database' CSV export"_. It is
  39 now.
- **line 195** — _"Empty for the ordinary 24-column export"_. The ordinary export is 39.

Not a defect in behaviour; both are false statements in the file that defines the
contract, which is the worst place for one. Non-blocking, but fix with A1.

---

## Judged and accepted

- **The three out-of-scope fixture edits.** Extending `OutreachProspect` with 15 required
  fields necessarily breaks every `prospect()` factory; the alternative — optional
  fields — would have weakened the type to avoid touching three test files. The executer
  stopped and asked rather than proceeding quietly, which is what the brief demanded.
  Diffs verified fixture-only.
- **`p_has_email_channel: true` hardcoded inside `ingestOutreach`** rather than passed by
  the caller. Sound: `parseOutreachCsv` hard-requires all 39 headers (D3), so any row set
  reaching this function provably came from a file carrying the email block. There is no
  live decision left for a caller to make, and inventing a parameter would imply there
  was. `outreach-actions.ts` stays untouched and still compiles.
- **`has_email_channel` reading deferred to S2.** Correct against §6 of the decision doc:
  S1 writes the column, S2 renders "not in this export". `OutreachUpload` and `toUpload`
  were rightly left alone.

---

## Amendment run — planner verification (2026-08-03)

| Claim                                             | Verified how                                          | Result                                                                   |
| ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Gate at 125 files / 1,843 tests                   | Re-run from clean start                               | ✅ exact match (28.0 s)                                                  |
| `default false` in BOTH SQL files                 | `grep -c` on each                                     | ✅ once in each                                                          |
| `drop` still precedes `create`                    | Line numbers in both files                            | ✅ 77/109 (script), 74/106 (migration)                                   |
| `parse-outreach.ts` change is comments-only       | Full diff read                                        | ✅ two lines, `24-column` → `39-column`; +2/−2 on the diffstat           |
| The ORDERING assertion is real, not presence-only | Planner moved `drop` to end of file and ran the suite | ✅ RED at `expect(drop).toBeLessThan(create)`; restored, sha256 verified |

The new `supabase/outreach-email-channel.test.ts` reads only the paste script, not the
migration twin. That is correct rather than a gap — `sql-sync.test.ts` already pins the
two equal, so asserting on one covers both, and it matches the
`staff-roles-admin.test.ts` precedent.

## SQL APPLIED — 2026-08-03, partially live-verified

Bryan pasted `supabase/outreach-email-channel.sql` into the Supabase SQL editor
(project `jozdugwmmyxacmksqjdl`, Primary Database, role `postgres`).

✅ **RPC verified live, from a screenshot of the result grid.**
`select pg_get_function_identity_arguments(oid) from pg_proc where proname =
'ingest_outreach'` returned **1 row**: `p_client_id uuid, p_rows jsonb,
p_has_email_channel boolean`. Exactly one function, three arguments — so the
`drop function` took and no two-argument overload survives to catch calls silently.
This was the risky half of A1 and it is now settled against the real database.

✅ **Columns verified live**, on a second pass. The first attempt pasted both statements
together and the editor rendered only the last result set — the recurring trap. Re-run
alone, `information_schema.columns` returned **15 rows, all `text`**, in source order
(`email_best_email`, `email_mobile`, `email_subject_line`, `email_message`,
`email_status`, `email_date_emailed`, `email_reply_status`, …).

Both halves of S1's schema change are therefore confirmed against the real database, not
inferred. Worth noting why the second check was not skippable: `add column if not exists`
succeeds silently whether or not it does anything, and a plpgsql body is not
name-resolved at creation time — so the function existing proved nothing about the
columns it references.

## Open

- Nothing on S1. Slice complete, applied, and live-verified. Until `supabase/outreach-email-channel.sql` is pasted into the
  Supabase SQL editor, every upload still calls the two-argument function and the 15
  columns do not exist. This migration is source code only.
- S2 (analytics + vocab), S3 (staff UI), S4 (public path) not started.

---

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2   | 2026-08-03 | **A1 and A2 applied and independently verified** — gate 125 / 1,843, `default false` in both SQL files, `drop` still first, comments-only diff in `parse-outreach.ts`. The planner re-ran the ordering mutation itself (moved `drop` past `create`) and confirmed it red, since a presence-only assertion would have passed it. New `supabase/outreach-email-channel.test.ts` (6 tests) added, honest that it asserts source text and not behaviour. Status 🟠 → 🟢; the SQL is now safe to apply. Left open: the stale comment in `outreach-actions.ts:55`, correctly not widened into by either run. |
| 1   | 2026-08-03 | Created from the S1 run report. Gate, diffstat, out-of-scope diffs and one mutation re-verified independently — all matched. A1 raised (deploy-order breakage window in the drop/create SQL, blocking). A2 raised (two stale comments in an in-scope file). Three judgement calls reviewed and accepted.                                                                                                                                                                                                                                                                                               |
