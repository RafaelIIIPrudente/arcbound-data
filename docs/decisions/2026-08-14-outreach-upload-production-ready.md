# Decision record — Outreach upload → display, production-readiness (2026-08-14)

**Status:** 🟡 SHAPING (grilling in progress).
**Branch:** `fix-feedbacks` (HEAD `41f8204`), with S6 + S7 uncommitted.
**Ask:** _"having the LinkedIn outreach upload to display be very settled and
production-ready"_ — the user, 2026-08-14.
**Planner session.** Nothing here is implemented.

---

## Ground truth established before grilling (planner, read-only)

Facts looked up rather than asked, so the grilling spends the user's attention on
decisions only.

### The write path is genuinely well-built — this is not a rescue job

| Property        | State                                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Attribution     | `clientId` from the staff dropdown and **nothing else** — no column of the file is consulted (ADR 0012). `owner` is "Bryan" on 1,432 of 1,435 rows, so any name-match would be wrong                                                 |
| Rows            | Stored **untouched** — no dedupe, no trim, no coercion. Genuine duplicate prospects are preserved by design                                                                                                                          |
| Blanks          | `?? null` everywhere, **never `?? ""` and never `?? 0`**                                                                                                                                                                             |
| Parse           | Full parse **before** the seam; a partial write would bake an uncorrectable row count into an immutable header                                                                                                                       |
| Unknown columns | Non-blocking notice that says plainly the data was **not stored** and that re-uploading will not help                                                                                                                                |
| RPC security    | `security definer`, `revoke all … from public`, `grant execute … to authenticated`. The 2-arg signature was **dropped** when the 3-arg replaced it, and the new signature got its own revoke/grant — the overload trap did not recur |
| RLS             | `select` only, for `authenticated`. **No insert/update/delete policies exist at all** — every write goes through the RPC                                                                                                             |
| Uploader        | `auth.uid()` stamped on every upload row                                                                                                                                                                                             |
| Auth            | Both upload actions rely on middleware's route gate rather than their own check — **consistent between LinkedIn and Outreach**, so not an outreach-specific gap                                                                      |

### The transport ceiling — known, documented, and finite

`next.config.ts` raises `serverActions.bodySizeLimit` to **4 MB**, with a ⚠️
recording why: the real Master Database CSV measured **1,493,914 bytes (1.42 MiB)
at 1,435 prospects** on 2026-07-27 — already 1.46× Next's 1 MB default.

- Vercel caps a serverless request body at **~4.5 MB**, so 4 MB is near the
  practical maximum; raising it further buys nothing.
- Headroom: roughly **2.8× today's file, or ~4,000 prospects** at ~1,041 bytes/row.
- ⚠️ **The failure mode past the cap shows the user nothing** — the request is
  rejected before any action code runs, so there is no validation message and no
  parse error the form could display.
- The config already records the correct escape hatch: upload to storage from the
  browser, then ingest server-side. **Deliberately not built.**

### The gap that is actually open: operational recovery

- **There is no delete or undo path anywhere** — not in SQL, not in the app. Grep
  finds no `delete_outreach`, no snapshot removal action.
- Snapshots are **immutable by design** (ADR 0012), and the Client's own report
  reads the **latest** one.
- So a snapshot attributed to the wrong Client, or a stale file uploaded twice,
  is **permanent from inside the app** and can only be undone by staff running SQL
  in the Supabase editor.
- `on delete cascade` exists on `outreach_prospects.outreach_upload_id`, so the
  mechanism for a clean removal exists — nothing exposes it.

### Known honesty properties already built (not to be re-litigated)

- Stage counts are **terminal**, so the funnel is derived from four other columns.
- Unmapped vocabulary values are **disclosed, never guessed**.
- The two channels (LinkedIn / Email) are **never summed**; combined meetings is a
  union that counts each person once.
- A prospect **deleted** from the source sheet vanishes with no tombstone, so
  per-prospect diffing is unanswerable and only aggregate movement is sound.
- Staff-only PII boundary: no prospect-level column crosses to `/r/[token]`.

---

## Questions and decisions

| #   | Question                                                    | User's answer (all matched the planner's recommendation)                                                                                                                                       |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Which failure do we insure against first?                   | **Recovery from a bad upload.** The growth ceiling, display hardening and live verification queue behind it                                                                                    |
| Q2  | What shape does recovery take, given ADR 0012 immutability? | **A reversible void flag** — `voided_at` / `voided_by`. Nothing deleted, nothing rewritten; voiding ADDS a fact. Decisive argument: the remedy for a mis-click must not itself be irreversible |
| Q3  | When every snapshot is voided, what does each audience see? | **Client sees `empty`; staff see the voids.** A Client is not owed a record of ArcBase's internal corrections. Staff must never see voided-to-zero as "never uploaded"                         |
| Q4  | Who may void?                                               | **Own uploads, plus admin voids any.** Closes the exposure window — whoever erred fixes it immediately — without letting anyone erase a colleague's work                                       |
| Q5  | Where does the control live?                                | **A snapshot history list on the Outreach tab**, void/un-void per row. Implied by Q3, not added scope                                                                                          |
| Q6  | How is an upload/void attributed on screen?                 | **"You" vs "Another user."** Staff identities are NOT resolvable today (see below)                                                                                                             |

### D1 — Why voiding is a flag, not a delete

A hard delete would have been simpler (no read filter, no SQL change to the
client path). It was rejected because it destroys the record that a mistake
happened, and because **an un-undoable fix for a mis-click is a second mis-click
waiting to happen.** The whole premise of Q1 is that staff make mistakes.

### D2 — ⚠️ Staff identities cannot be resolved, and this constrains the UI

The planner's first Q5 mockup showed uploader NAMES. **That was wrong and is
retracted.**

- `public.staff_roles` holds only `user_id`, `role`, `created_at`, `updated_at` —
  **no name, no email.**
- Its RLS is deliberately **own-row** (`user_id = auth.uid()`), written that way to
  avoid the self-referential-policy recursion (42P17) its own ⚠️ describes.
  `getRole()` asks only "what am I?".
- `auth.users` is not readable by `authenticated`.
- ⚠️ `outreach_uploads.uploaded_by` is **written (`auth.uid()`) but never read** —
  it is not on `OutreachUpload` and must be added to the read.

So "voided by R. Prudente" needs identity plumbing that does not exist. "You" vs
"Another user" is the honest surface available today, and it is **the same
comparison Q4's permission rule must compute anyway**.

---

## The blast radius, verified

### Two independent read paths — and only one is TypeScript

⚠️ **This is the fact that shapes the whole slice.** A void honoured only in
TypeScript would leave the voided snapshot live on `/r/[token]` — the one surface
where the mistake actually matters.

| Path   | Reads                                                                                  | Filter goes                                                                                                                                     |
| ------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff  | `uploadPageReader` (`outreach.ts:286`) → `latestSnapshot` + `listOutreachUploads`      | ⚠️ **NOT a single blanket filter** — Q3 requires staff to SEE voided rows, so the reader needs an opt-in, or the two callers filter differently |
| Client | `report_link_read` reads `outreach_uploads` / `outreach_prospects` **directly in SQL** | one `and ou.voided_at is null` on the latest-snapshot select                                                                                    |

### The client-facing change is one line, and Q3 falls out for free

`outreach-email-report-link.sql` selects the latest snapshot with
`where ou.client_id = v_client order by ou.created_at desc, ou.id desc limit 1`.
Adding `and ou.voided_at is null` is the entire change — and the existing branch
below it already reads:

> ⚠️ NO SNAPSHOT ⇒ THE KEY STAYS jsonb null, NOT AN OBJECT OF ZEROS.

which is **exactly** Q3's answer for the all-voided case, with no new vocabulary.

### ✅ Correction: only ONE report-link SQL file changes, not both

An earlier planner statement said both must change. **Wrong.**
`outreach-email-report-link.sql` `create or replace`s `report_link_read(text, text)`
wholesale, superseding `outreach-report-link.sql`, which is now history. One new
SQL pair (file + migration twin, registered in `sql-sync`'s `PAIRS`) replaces it
again.

### Consequences to specify, not decide

- The **movement panel** compares two snapshots and must skip voided ones.
- `listOutreachUploads` **nulls a truncated read**; the new history list inherits
  that and must not render a partial history as a complete one.
- Un-void is governed by the same Q4 rule as void.

---

## S1 — data + SQL (LANDED, planner-verified, ⚠️ ONE DEFECT OPEN)

**Delivered uncommitted** on `fix-feedbacks` at HEAD `16de176` (the operator's own
commit of S6+S7; `41f8204` verified an ancestor). New: `supabase/outreach-void.sql`

- its migration twin `20260814120000_outreach_void.sql` + `outreach-void.test.ts`,
  with the pair registered in `sql-sync.test.ts`'s `PAIRS`.

**Gate re-run by the planner from a clean start: 133 files / 2,160 tests green**
(35.2 s). Neither known flake fired.

### Planner verification (independent, not taken on report)

| Claim                                                             | Verified how                                                      | Result                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| `report_link_read` differs by exactly one predicate               | Planner extracted both function bodies, stripped comments, diffed | ✅ ADDED `['and ou.voided_at is null']`, REMOVED `[]`    |
| No `drop function`                                                | grep of the new script                                            | ✅ appears only inside the two comments forbidding it    |
| The pair is registered                                            | `git diff supabase/sql-sync.test.ts`                              | ✅ `outreach-void` prepended to `PAIRS`                  |
| Both RPCs are definer + search-path-pinned + `authenticated`-only | Read the script                                                   | ✅ all four grant/revoke lines present                   |
| No RLS write policy added                                         | Read the script                                                   | ✅ none; the ⚠️ explaining why is present                |
| Idempotency is in the `where` clause, not an `if`                 | Read both bodies                                                  | ✅ `and voided_at is null` / `and voided_at is not null` |

### ⚠️ DEFECT — the Q4 guard is not NULL-safe, and it fails OPEN

`outreach-void.sql:103` and `:163` both read:

```sql
if not found or not (v_upload.uploaded_by = auth.uid() or public.is_admin()) then
```

⚠️ **`outreach_uploads.uploaded_by` IS NULLABLE** — `outreach-system.sql:39` is
`uploaded_by uuid references auth.users(id)`, with no `not null`. When it is null
and the caller is not an admin:

`null = auth.uid()` → **NULL** · `NULL or false` → **NULL** · `not NULL` → **NULL**
· `false or NULL` → **NULL** · and **`if NULL then` does not fire in plpgsql**.

**Control falls through to the UPDATE. Any authenticated user can void — or
un-void — a snapshot whose uploader was never recorded.** The failure direction is
open, not closed, which is the wrong direction for the one check the file itself
calls "the entire security boundary".

Reachable because a null `uploaded_by` is a real state, not a hypothetical: this
project applies SQL by pasting into the editor, where `auth.uid()` is null — and
the script's own comment at line 46 acknowledges exactly that ("auth.uid() is null
when a definer function is invoked outside a user session"). It reasoned about the
null actor when _writing_ the column and not when _reading_ it.

**Fix — `coalesce(..., false)` in both functions**, so the comparison fails closed:

```sql
if not found or not (coalesce(v_upload.uploaded_by = auth.uid(), false) or public.is_admin()) then
```

⚠️ **This must land BEFORE the script is pasted.** Nothing has been applied yet, so
the correction costs one edit now and a second migration later.

**Planner mutation:** applying the fix to the script alone turned **3 tests RED** —
both `… source carries the owner-or-admin predicate (Q4)` assertions and the
`outreach-void` pair check. So the fix requires the twin **and** the test's expected
string to move with it. Restored by `cp`; sha256 `753ca8c5…6449` identical.
⚠️ It also proves what the executer stated plainly: **these tests pin the predicate's
TEXT, not its SEMANTICS.** They would have gone green on the null-open version
forever, and no test in this repo can catch this class of bug — there is no Postgres
in the suite.

### ✅ DEFECT FIXED (same day, before any database saw the script)

All **four** sites — void and un-void, script and twin — now read:

```sql
if not found or not (coalesce(v_upload.uploaded_by = auth.uid(), false) or public.is_admin()) then
```

Planner-verified: four sites changed, **zero bare `uploaded_by = auth.uid()`
remaining in executable SQL** in either file, `uploaded_by`'s column definition
untouched, `report_link_read` still differing from the live definition by exactly
one predicate. Gate re-run clean: **133 files / 2,161 tests** (+1 exactly).

**Planner mutation, deliberately the mirror of the executer's:** they reverted
_un-void_, so I reverted _void_. **2 RED** — the Q4 literal pin for `void` and the
new `BOTH sources carry the NULL-SAFE form` assertion. Restored by `cp`; sha256
`bf64e473…f006` identical. Both halves of the pair are independently pinned.

⚠️ **`coalesce` wraps the COMPARISON, not the column.** `coalesce(uploaded_by,
auth.uid()) = auth.uid()` would make a null uploader match _every_ caller — the
same hole, written more confidently. Confirmed the shipped form is the correct one.

**FLAG 1 independently verified.** Every `auth.uid()` in `supabase/*.sql` was
audited: all are insert/`values` stamps, one RLS `using` clause
(`staff-roles.sql:51`), or one `exists(…)` subquery (`staff-roles.sql:72`). RLS
`using` denies on NULL and `exists` is never NULL, so both fail **closed** by
construction. The hazard is specific to `if not (…) then raise` in plpgsql, where
NULL means "skip the raise" — a pattern that appears nowhere else in this repo.
**No other fail-open comparison exists.**

### ⚠️ Consequence for S3 — a null-uploader snapshot is admin-only in practice

`voided_by` will be null for anything voided from the SQL editor, by the same
mechanism that produces a null `uploaded_by`. Correct and honest — but it means a
snapshot created by pasting SQL **cannot be voided or un-voided by any non-admin**,
because no non-admin will ever match a null `uploaded_by`. That is the fail-closed
behaviour working as intended, not a defect. **S3's UI must not offer a control
that will always raise 42501** — either hide void for rows the caller cannot act
on, or surface the refusal plainly.

### ⚠️ The one check that only a live database can make

When the script is applied, call `void_outreach_upload` as a **non-admin** against a
row with `uploaded_by is null` and confirm a **42501**. Nothing in the repo can
prove this; the fix rests on the three-valued-logic argument, not on the suite.

### Accepted as good judgement

- **Conflating "not found" with "not yours"** under one `42501`, so the function is
  not an existence oracle for other Clients' uploads.
- **`set search_path = public`** on both, reasoned about as a shadowing defence
  rather than copied as hygiene.
- **Re-reading the row instead of `returning`**, because `returning` on an
  idempotent no-op cannot be told apart from a failure.
- **Fixing their own tests rather than loosening them** when their explanatory
  comments tripped the `drop function` / `is_voided` scans — the invariant was
  always about executable SQL, and widening the regex would have been the wrong
  repair.
- **Declining to claim behaviour they could not prove**, and naming every test as a
  claim about source text.

---

## S2 — the service read (LANDED, planner-verified)

Uncommitted on `fix-feedbacks` at HEAD `16de176`. Six files, exactly the scope
list. Gate re-run by the planner: **133 files / 2,171 tests** (+10).

- `OutreachUpload` gains `uploadedBy` / `voidedAt` / `voidedBy`, all nullable, no
  derived boolean.
- `uploadPageReader(clientId, { includeVoided })` — ⚠️ **REQUIRED, NO DEFAULT.**
  A default is how the next caller inherits the wrong behaviour silently.
  `listOutreachUploads` passes `true`, `latestSnapshot` passes `false`.
- `LatestSnapshot` gains a fourth member, `all-voided` + `voidedCount`.

### Why the filter is query-side (`.is("voided_at", null)`), not post-read

⚠️ Post-read filtering would be **wrong for `all-voided` specifically**.
`readAllPages` orders newest-first and truncation drops the OLDEST rows. Finding
the newest _live_ snapshot survives either way — but deciding _all-voided_ does
not: if every retained row were voided, a live one could still sit below the cap,
and TypeScript filtering would report `all-voided` for a Client who has a live
snapshot. Paging over live rows only makes zero rows definitive.

`voidedCount` comes from `total` (the database's exact count, which survives
truncation), falling back to `rows.length` only when not truncated, else `null`.
⚠️ **`null` drops the count from the sentence rather than printing 0.**

### Planner verification

| Claim                            | Verified how                                                        | Result                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Gate at 133 / 2,171              | Full re-run from clean start                                        | ✅ 30.2 s, no flake                                                                                                             |
| The opt-in is genuinely required | Read `outreach.ts:294-320`                                          | ✅ no default; `.is()` not `.eq()`, because SQL null is not a value                                                             |
| Voided-skipping is pinned        | Planner mutation: flipped `latestSnapshot` to `includeVoided: true` | ✅ **3 RED** — the skip, the query-side assertion, AND the all-voided discriminator. Restored, sha256 `33b6ec17…b7a5` identical |
| The union break reached one file | `git status` + the executer's own audit                             | ✅ only the outreach page; the three other mentions are comment-only                                                            |

### ⚠️ DEPLOY ORDER — the executer corrected the planner's brief, and was right

The S2 brief asserted "S1's SQL is applied". **It was not.** The planner inferred
it from a "go" that was an approval to proceed, not a report of having pasted.
`supabase/outreach-void.sql` is still untracked and unapplied.

This is a **hard deploy-order dependency**: `UPLOAD_COLUMNS` now requests
`uploaded_by, voided_at, voided_by`, which do not exist yet.
**⚠️ THE SQL MUST BE PASTED BEFORE THIS TYPESCRIPT DEPLOYS.**

✅ **Severity, measured rather than assumed:** the planner traced the failure path.
PostgREST resolves an undefined-column error as `{ error }`, and
`src/lib/supabase/paged.ts:129` turns that into `unavailable: true`. So an
un-migrated database **degrades honestly** — the staff Outreach tab reads "could
not be read right now", the Client List shows `Unavailable` — rather than
crashing or showing zeros. The four-state discipline absorbs the mistake, and it
self-heals the moment the SQL lands. Real, ordered, but not a white-screen event.

### ⚠️ Two stale comments, confirmed and deliberately left

`src/services/report-links.ts:196` and
`src/components/report-link/outreach-summary.tsx:32` both claim the client-facing
states mirror `LatestSnapshot` **"exactly — ok / empty / unavailable"**. The staff
side now has four members. The _behaviour_ is still correct (Q3: the client path
renders an all-voided Client as "no outreach", gaining no new vocabulary) — only
the claim of exactness is false. Both files were on S2's DO-NOT-TOUCH list, so
they were correctly left. **Queued for S3.**

### Accepted as good judgement

- **Disclosing a self-inflicted grep miss.** `pnpm type:check | grep "error TS"`
  returned nothing because of ANSI colour codes, and was briefly read as "no
  exhaustiveness break". Reported rather than quietly corrected — a silent grep
  miss is exactly how one would wrongly conclude the union was optional.
- **Deleting a drafted test that needed a `__failVoidCountRead` hook**, rather
  than putting a test-only parameter into a production signature, and naming the
  resulting uncovered branch instead of hiding it.
- **No "Go to Add Data" button on the all-voided state**, on the reasoning that it
  would push staff toward re-uploading data ArcBase already holds — the exact
  failure the state exists to prevent.
- **Two existing assertions changed and neither weakened** — both enumerate fields
  exhaustively, so both correctly went red when the three columns landed.

---

## S3 — the UI (LANDED, planner-verified) — the void feature is COMPLETE

Uncommitted on top of `35704cc` (the operator's commit of S1+S2; `16de176`
verified an ancestor). Gate re-run by the planner: **135 files / 2,209 tests**
(+2 files, +38). ⚠️ S1's SQL is **APPLIED** to the live database.

New: `void-actions.ts`, `snapshot-history.tsx`, `outreach-attribution.ts`, and
their tests. Modified: the service (RPC wrappers), types, the outreach page, and
the two stale comments — comment text only.

### The permission line, and why it holds structurally

`canVoidSnapshot(u.uploadedBy, session?.id ?? null, isAdmin(role))` is computed
**server-side, per row, in `page.tsx`**.

⚠️ It cannot be mistaken for authorisation for a **structural** reason rather than
a documented one: **the value never leaves the server render.** Both actions are
`(uploadId: string)` — verified by the planner — so there is no parameter through
which a forged `canVoid` could arrive. A source assertion checks the action seam
contains no `isAdmin|getRole|getSession|auth.uid`, i.e. it does not re-implement
the rule the RPC already enforces correctly.

Additional hardening the executer added unprompted: the action revalidates the
path built from the RPC's **returned** `client_id`, not a caller-supplied one, so
a forged id cannot bust an unrelated Client's cache.

### Q6 gained a third outcome, and it was necessary

| `uploadedBy`        | Renders          |
| ------------------- | ---------------- |
| `=== currentUserId` | **You**          |
| a different uuid    | **Another user** |
| `null`              | **Not recorded** |

⚠️ **The null check runs FIRST**, because with both sides null
`userId === currentUserId` is `true` in JavaScript — which would attribute an
unattributed row to whoever happens to be looking. Planner-verified at
`outreach-attribution.ts:44-46`.

**Planner mutation:** reordered the guard so `===` is checked before the null case.
**1 RED** — `still says UNRECORDED when there is no signed-in user either` — the
one test that exists precisely for this. Restored, sha256 `8d8631cf…abe5`
identical.

### A null-uploader row offers a non-admin NO control — not a disabled one

Under the RPC's `coalesce(…, false)` a null uploader matches nobody, so a button
there would raise 42501 on every press. An admin still gets it (the `is_admin()`
arm), without which nobody could ever correct a snapshot written from the SQL
editor. Both directions tested.

### ✅ FLAG 1 — an out-of-scope file, correctly created and correctly disclosed

`src/lib/outreach-attribution.ts` was not on the CREATE list. It had to exist:
`attribute`/`canVoidSnapshot` are called from `page.tsx` (a Server Component) and
the history component needs `"use client"` for the dialog. ⚠️ **`"use client"`
converts EVERY EXPORT of a module into a client reference**, so hosting the
helpers there would make `canVoidSnapshot(...)` a proxy that throws at request
time — invisible to both `next build` and Vitest. `page.tsx` cannot host them
either (Next forbids named exports from `page.tsx`).

Planner-verified: `outreach-attribution.ts` carries **no** `"use client"`;
`snapshot-history.tsx` does. This is the same RSC trap that opened this
workstream, avoided rather than re-hit, and named rather than buried.

### ⚠️ OPEN — a stale claim is now COMMITTED

`supabase/outreach-void.test.ts:27-28` still reads _"That has NOT been done — this
SQL is not yet applied to any database."_ **It has been applied.** The file was
`DO-NOT-TOUCH` for S3 and was correctly left, but it went into `35704cc`, so the
repo now carries a committed statement that is false. **One-line fix, unscheduled.**

### ⚠️ The limit that no slice can close

Nothing in this suite executes either RPC. **No test shows a non-admin is actually
refused**, that voiding is idempotent, or that a void reaches the Client's report.
The security boundary remains `void_outreach_upload`'s own predicate, verified
only by reading it and by the three-valued-logic argument in S1.

⚠️ **And this may not be closable soon: ArcBase has effectively one account**, so
the deny path has never executed and cannot be exercised without a second staff
login. Recorded so the guard is not mistaken for tested.

### Accepted as good judgement

- **Rejecting their own first mutation.** Deleting the null guard turned only one
  test red because `null === "<uuid>"` is false anyway — so they mutated again the
  way a real wrong implementation looks, `(uploadedBy ?? currentUserId) === currentUserId`:
  **the same "coalesce the column, not the comparison" shape that was the trap in
  S1's SQL.** That produced 3 RED including the page-level wiring test.
- **Rendering the history OUTSIDE the state branch**, gated on `assigned` only —
  in the `all-voided` state the history is the only route to an un-void, so nesting
  it inside `ok` would strand exactly the Clients the feature exists for.
- **No confirmation on un-void**, and no undo-of-the-undo prompt; pressing twice is
  a database no-op.

---

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | 2026-08-14 | **S1 landed and planner-verified** at 133 files / 2,160 tests; the one-predicate `report_link_read` diff confirmed by independent extraction-and-diff, not by reading the executer's test. ⚠️ **One defect found by the planner and NOT by the suite: the Q4 guard is not NULL-safe and fails OPEN** — `uploaded_by` is nullable, `null = auth.uid()` is NULL, and `if NULL then` does not fire, so any authenticated user can void a snapshot with no recorded uploader. Fix is `coalesce(…, false)` in both functions, and it must land before the script is pasted. Mutation showed the fix moves 3 tests RED (both predicate assertions + the pair check), confirming the tests pin the predicate's TEXT and not its SEMANTICS.                                                                                                                                                                                                                                              |
| 7   | 2026-08-14 | **S3 landed and planner-verified** at **135 / 2,209** (+38) on top of `35704cc` — **the void feature is complete: SQL applied, service reading, UI wired.** Permission holds STRUCTURALLY (both actions are `(uploadId: string)`, planner-verified — no parameter exists through which a forged `canVoid` could arrive). Q6 gained a necessary third outcome, "Not recorded", with the null check FIRST because `null === null` is `true`; planner mutation reordering it → 1 RED, restored, sha256 `8d8631cf…abe5`. ✅ The out-of-scope `outreach-attribution.ts` was correctly created and disclosed — the RSC client-reference trap that opened this workstream, avoided rather than re-hit. ⚠️ **OPEN: `supabase/outreach-void.test.ts:27-28` now carries a COMMITTED false claim** that the SQL is unapplied. ⚠️ **The RPC's refusal has never executed and may not be closable — ArcBase has effectively one account.**                                                    |
| 6   | 2026-08-14 | **S2 landed and planner-verified** at 133 / **2,171** (+10). Required-no-default `includeVoided` opt-in; query-side `.is("voided_at", null)` because post-read filtering would wrongly report `all-voided` when a live snapshot sits below the truncation cap; `LatestSnapshot` gains a fourth member. Planner mutation (flipping `latestSnapshot` to `includeVoided: true`) → **3 RED**, restored, sha256 `33b6ec17…b7a5` identical. ⚠️ **The executer corrected the planner's brief and was right: S1's SQL is NOT applied** — the planner inferred it from a "go" that approved proceeding, not a paste. Hard deploy-order dependency recorded, with severity measured rather than assumed (PostgREST's undefined-column error → `paged.ts:129` → `unavailable`, so an un-migrated DB degrades honestly and self-heals). Two stale "mirrors LatestSnapshot exactly" comments confirmed in `report-links.ts:196` and `outreach-summary.tsx:32`, correctly left, queued for S3. |
| 5   | 2026-08-14 | **Defect fixed before any database saw the script.** All four sites now `coalesce(…, false)`; planner confirmed zero bare comparisons remain in executable SQL, and ran the MIRROR mutation (reverting `void` where the executer had reverted `un-void`) → 2 RED, restored, sha256 `bf64e473…f006` identical. Gate 133 / **2,161** (+1 exactly). FLAG 1 independently audited across every `auth.uid()` in `supabase/*.sql`: all others are insert stamps, an RLS `using`, or an `exists(…)` — all fail CLOSED, so no second instance exists. ⚠️ Recorded a consequence for S3 (a null-uploader snapshot is admin-only in practice, so the UI must not offer a control that always raises 42501) and the one check only a live database can make (call `void_outreach_upload` as a non-admin against a null-uploader row, expect 42501).                                                                                                                                         |
| 2   | 2026-08-14 | Q1–Q6 settled, all matching the planner's recommendation. Records D1 (flag not delete — an un-undoable fix for a mis-click is a second mis-click) and **D2, a retraction: the planner's Q5 mockup showed uploader names that are not buildable** — `staff_roles` carries no name/email, its RLS is own-row by design, and `uploaded_by` is written but never read. Blast radius verified: two independent read paths, the client one being SQL; the client-facing edit is ONE line and Q3's all-voided case falls out of the existing jsonb-null branch for free. ✅ Corrected an earlier planner claim that both report-link SQL files change — only the newest does.                                                                                                                                                                                                                                                                                                           |

| 3 | 2026-08-14 | Delivery sequence proposed (S1 data+SQL → S2 service → S3 UI), pending the user's confirmation of shared understanding before any handoff is written. |
| 1 | 2026-08-14 | Created at the start of the grill. Ground truth established read-only: the write path is well-built (attribution, blanks, parse-before-seam, RPC grants, RLS select-only, the dropped 2-arg overload); the 4 MB transport ceiling is documented with ~4,000 prospects of headroom and a silent failure mode past it; **the open gap is operational recovery — no delete/undo path exists anywhere, and the Client's report reads the latest snapshot.** |
