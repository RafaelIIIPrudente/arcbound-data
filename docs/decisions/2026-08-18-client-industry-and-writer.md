# Decision record — Industry and Writer on a Client

**Status:** 🟢 SHAPED — four decisions settled, slices sequenced, not yet handed off.
Raised 2026-08-18 by the user as "a task we still have"; ⚠️ **it was never
specified** — `Industry` appears ZERO times in the repo (code, SQL, docs, ADRs,
handoffs, decisions) and `Writer` only as prose in ADR 0013 and font licences.
**New work, not unfinished work.**
**Planner session.** Nothing here is implemented.

---

## Ground truth (looked up, not asked)

### What a Client holds today

|                                            |                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `Client` (`services/types.ts:20`)          | `id` · `name` · `linkedin_url` · `createdAt` · `postsCount` (derived) |
| Add Client dialog                          | Name · LinkedIn URL · Services                                        |
| Client list columns (`client/columns.tsx`) | Client · LinkedIn URL · Last ArcBase upload · Posts                   |
| Services                                   | separate, via `client_services` (ADR 0015)                            |

### ⚠️ THERE IS NO EDIT PATH FOR A CLIENT

`services/clients.ts` exposes `listClientRegistry` / `listClients` / `getClient` /
`createClient` — **create only**. `clients/actions.ts` has only
`createClientAction`. Collecting these at creation ONLY would leave every existing
Client permanently blank. **The first Client edit path is part of this task.**

### ⚠️ AND NO UPDATE POLICY ON `public.clients`

The repo's SQL contains only `"arcbase add clients"` (INSERT, narrowed to
`is_admin()`) and `"arcbase read clients"` (SELECT, `qual = true`). An UPDATE is
currently denied outright. **This task adds the first mutable field on a Client**
— which softens the "records are immutable" line asserted in
`staff-roles-enforce.sql:40`. ⚠️ That comment attributes immutability to ADR 0007,
but ADR 0007 does not contain the word; the claim should be re-grounded or dropped.

⚠️ `public.clients` was **created outside this repo's migrations**, so its full
policy set is not visible here. Confirm with
`select polname, cmd from pg_policies where tablename = 'clients';` before writing
the migration.

### Who may do what

- Creating a Client is **already admin-only** — RLS `with check (public.is_admin())`
  plus `requireAdmin()` in the action. Both required; neither replaces the other.
- **`listStaff()` is admin-only** — `list_staff` raises `42501` otherwise.
- ⚠️ **A Data Analyst READS EVERYTHING** — the SELECT policy is deliberately
  untouched (ADR 0013 is a privilege tier, not a visibility tier).

---

## Decisions

### D1 — Writer is a LINKED STAFF MEMBER (user, 2026-08-18)

`clients.writer_id uuid` → the staff account. Rejected: free text (no integrity —
"Bryan" / "bryan" / "Bryan W." are three writers, the same defect class that lost
Eitan's 14 posts) and a Services-style registry (a second roster beside the staff
one).

⚠️ **ON DELETE SET NULL** (planner's call). There is no in-app staff removal —
`services/staff.ts` has `listStaff` / `setStaffRole` / `inviteStaff` and no
delete — so this fires only if an account is removed in the Supabase dashboard.
`writer_id` is **current state, not history** ("who writes for them now"); the
audit trail lives in `uploads.uploaded_by`. So nulling is honest: the answer
genuinely becomes "nobody".

### D2 — Industry is a CONTROLLED LIST (user, 2026-08-18)

Admin-editable, following the ADR 0015 Services registry pattern. Rejected: free
text (uncountable) and free-text-then-tighten (the reconciliation step never
happens).

### D3 — STAFF-ONLY; the client-facing report is untouched (user, 2026-08-18)

Neither field reaches `/r/[token]`. A report link is a read-only window on the
Client's own numbers; Arcbound's internal staffing is not part of that artefact.
⚠️ **Consequence: no public-safe display name is needed, and the `/r/[token]`
bundle must not grow.** Assert the latter.

### D4 — A staff DIRECTORY read for analysts (user, 2026-08-18)

New `list_staff_directory()` → `user_id, email` for every staff account, readable
by any authenticated staff. `list_staff()` is untouched and stays admin-only with
its roles and invite state. This **follows** ADR 0013's stated principle ("removes
the ability to change things, never the ability to see them") rather than making a
new decision.

⚠️ **ARCBASE STAFF HAVE NO DISPLAY NAME.** `StaffMember` is
`userId · email · role · assigned · pending`, so the UI reads
`Writer: bryan@arcbound.com` until one is added. Accepted for now — adding a name
field is its own slice and D3 removes the client-facing reason to rush it.

### D5 — The edit path covers INDUSTRY AND WRITER ONLY (planner's call)

⚠️ **`clients.name` IS THE ATTRIBUTION JOIN KEY.** `bi.linkedin_post_latest` joins
on `c.name = TRIM(regexp_replace(s.post_name, '\s*•\s*You\s*$', '', 'i'))` (read
first-hand from the view's DDL, 2026-08-18). **Editing a Client's name silently
re-attributes or strands every post they have** — exactly the failure that lost
Eitan's 14 posts, but self-inflicted and with no upload to point at.

So the edit surface exposes Industry and Writer and **must not** expose `name` or
`linkedin_url`. Editing is **admin-only**, matching creation: `requireAdmin()`
plus a new RLS UPDATE policy with `is_admin()`, and ⚠️ the policy must restrict
which columns can change, not merely who may write.

### D6 — Where they surface (planner's call)

Client **detail** for both, and both as **client list columns**. "Which clients are
mine" and "how many clients in SaaS" are the two questions these fields exist to
answer, and neither is answerable from a detail page alone. ⚠️ The list already
carries four columns and has had mobile work — the new ones must collapse, not
overflow.

---

## Slices

|        | Slice                          | Contains                                                                                                                                                                                  | Depends on |
| ------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **S1** | Industry registry + data model | `industries` table + admin CRUD (Services pattern), `clients.industry_id`, `clients.writer_id`, `list_staff_directory()`, RLS UPDATE policy. **SQL applied by staff via the SQL editor.** | —          |
| **S2** | Read path                      | `Client` type + `getClient`/`listClients` resolve both; `listStaffDirectory()` service                                                                                                    | S1         |
| **S3** | Industries admin screen        | Settings ▸ Industries — list, add, rename, archive, delete. ⚠️ **RE-SEQUENCED IN, 2026-08-18**                                                                                            | S2         |
| **S4** | Capture                        | Add Client dialog gains both pickers; the first `updateClientAction` + edit surface, admin-only, ⚠️ Industry and Writer only                                                              | S3         |
| **S5** | Surfaces                       | Client detail + two list columns, responsive                                                                                                                                              | S2         |

⚠️ **WHY S3 WAS INSERTED.** The registry ships EMPTY by decision, and S1 delivered
its four CRUD functions but no screen — the original plan had one nowhere. An
Industry picker with nothing to pick is half a feature, and seeding by SQL is a
runbook workaround, not a product. No new SQL is needed: `industries` is
`select to authenticated using (true)`, so listing is a plain read, and only
writes go through the RPCs.

⚠️ S1's SQL is **not applied until its row counts have been seen** — the lesson
from `2026-08-18-name-match-attribution-failure.md`, where a repair was believed
applied and was not.

---

## S1 built — planner verification, 2026-08-18

Branch `feat--client-industry-writer` off `origin/main` @ **`929a04a`** (⚠️ PR #22,
the name-match gate, HAS NOW MERGED). Uncommitted. Gate re-run by the planner:
lint ✅ · tsc ✅ · **138 files / 2,359 tests** ✅ (baseline 2,307 → +52).

| Claim                                     | How it was checked                                     | Result                                           |
| ----------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Script and migration twins agree          | Stripped comments/blanks from both and compared        | ✅ identical, 173 executable lines each          |
| The pair is registered                    | `sql-sync.test.ts` `PAIRS`                             | ✅ present                                       |
| No `src/` touched, no UPDATE policy added | `git status`, `git diff --stat`                        | ✅ 1 modified + 4 new, all under `supabase/`     |
| `name` unreachable through the write path | Added `name = 'hijacked'` to the UPDATE, ran the suite | ✅ 2 red; restored, sha256 `be500684…` identical |

### ⚠️ A risk the planner checked that nobody raised: report-link viewers

`list_staff_directory()` is granted to `authenticated`. **If a public report viewer
held an authenticated session, a client with a link could enumerate every staff
email.** They do not: `resolve_report_link` and `report_link_read` are granted to
**`anon`, authenticated** (`report-links.sql:374,377`), which is the whole point —
the public route runs as `anon` and cannot execute the directory. ⚠️ **This must
be re-checked if the report-link path ever gains a real session.**

### 🟡 GAP — the guarantee is FUNCTION-scoped, the claim is FILE-scoped

The executer built exactly what the brief asked: a test that fails if `name` or
`linkedin_url` appears **inside `set_client_industry_writer`**. Verified working.

⚠️ **But this document claims `name` is unreachable, and that is broader.** Planner
mutation: appended a _second_ definer function to the same script that runs
`update public.clients set name = p_name`. **No test said so.** Two fired
incidentally — the sync pair (only because one twin was edited) and a _count_ check
on `coalesce(public.is_admin(), false)` vs `ADMIN_FUNCTIONS.length`, which a future
author would resolve by adding their function to the list and moving on, green.

**Fix (cheap, fold into S2):** one file-wide assertion — no `update public.clients`
statement anywhere in the script may name `name` or `linkedin_url`. It cannot
police other files, and should say so.

### Flags accepted as accurate

⚠️ Flag 1 is correctly rated **stop-and-report**: if an UPDATE policy already
exists on `clients` from outside this repo, the slice's central guarantee is void —
a policy grants direct table access and no function can prevent a caller choosing
its own columns. The runbook snapshots `pg_policy` before and after.

⚠️ Flag 5 is the kind of catch that saves a cycle: **`create_industry` will fail
with `42501` when pasted into the SQL editor**, because `auth.uid()` is null there
and `is_admin()` correctly says no. The refusal is the guard working; the runbook
carries the direct-insert workaround.

⚠️ Carry into S3: the write function **sets both columns unconditionally** — NULL
clears. A UI that sends only the field it changed will silently wipe the other.
Documented at `client-industry-writer.sql:314-317`, and the S3 brief must repeat it.

## S2 built — planner verification, 2026-08-18

Same branch, still `929a04a`. Gate re-run by the planner: lint ✅ · tsc ✅ ·
**138 files / 2,377 tests** ✅ (2,359 → +18). ⚠️ The tree is now **staged**
(`git add` was run at some point); still uncommitted, still the user's to commit.

| Claim                                            | How it was checked                                          | Result                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `getClient` cannot throw from the directory read | Removed the `try/catch` in `staffEmailsById`, ran the suite | ✅ **5 red**, incl. both error-precedence tests; restored, sha256 `2c5570f0…` identical           |
| The writer keeps four states                     | Read `types.ts:91`                                          | ✅ `null` / resolved / unknown / unavailable, none collapsed                                      |
| One directory read per page                      | Executer asserted call count AND peak concurrency           | ✅ the concurrency probe is what proves it joined the `Promise.all` rather than awaiting after it |

### ⚠️ THE HAZARD MOVED — it did not go away, and the executer said so

The writer read is guarded. **The industry read is not, because it rides inside
the client `SELECT`** as a PostgREST embed `industry:industries(id, name)`.

⚠️ **If PostgREST's schema cache does not know the new foreign key, that select
errors — and `getClient` throwing is exactly the condition that degrades the
upload name-match gate to "could not check".** The gate then passes every upload
through with only a post-hoc warning: the failure mode this whole workstream
exists to prevent, reached from a different direction.

It is the right design (one round trip, and a set industry always resolves), and
the risk is a one-off at deploy, not a standing condition. **But it must be
checked live before this is trusted:**

```sql
notify pgrst, 'reload schema';
```

then load `/clients` once and confirm no error. ⚠️ **Nothing in the test suite can
tell you this** — the embed has never executed.

### Reporting discrepancy, minor and in the right direction

Flag 3 said a stale comment (`countForClient` "swallows its own failures **and
returns 0**" — it returns `null`) was left alone. ⚠️ **It was actually fixed** —
the false clause is gone from the whole file, and the replacement additionally
documents the upload-gate safety property. Noted only because these reports are
what verification runs on.

### Judgements accepted

- Flag 1 — editing `clients-table.test.tsx` (a fixture, +5 lines) was correct.
  The alternative, making the fields optional, would have added `undefined` as an
  unmodelled fifth writer state: the exact collapse the slice prevents.
- ⚠️ Not merging `unknown` and `unavailable` is right, and the reason is the best
  line in the report: they demand **opposite actions** — `unavailable` says retry,
  `unknown` says a human must reassign.
- Flag 2 — `/r/[token]` unaffected: no `getClient` caller outside the auth-gated
  segments, and the route's bundle is byte-identical at 1.42 kB / 273 kB. D3 holds.

## Still open

- Whether staff should gain a display name (own slice; D3 removes the urgency).
- Seed values for the industry list, or start empty and let admins fill it.
- Re-grounding or dropping the "records are immutable, ADR 0007" comment.

---

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | 2026-08-18 | S1 built and planner-verified on `feat--client-industry-writer` off `929a04a` (PR #22 merged in the meantime), 2,359 green. Twins identical, pair registered, `name` proved unreachable through the write path by mutation. Planner additionally checked a risk nobody raised — report-link viewers run as `anon`, so `list_staff_directory()` is not reachable by a client holding a link. 🟡 Found one gap: the name guard is scoped to the one function, while this document claims file-wide unreachability; a second function writing `clients.name` goes undetected. One file-wide assertion folded into S2. Executer's own flags all verified accurate, including that `create_industry` refuses from the SQL editor because `auth.uid()` is null there. |
| 2   | 2026-08-18 | D2 (controlled list), D3 (staff-only, `/r/[token]` untouched) and D4 (staff directory read) settled by the user. Planner added D5 — ⚠️ the edit path must NOT expose `clients.name`, because it is the attribution join key and editing it silently re-attributes posts — plus D6 (surfaces) and the four-slice sequence. Also established that there is **no UPDATE policy on `public.clients`** at all, so this task adds the first mutable field on a Client, and that the table was created outside this repo so its policy set must be confirmed live before writing the migration.                                                                                                                                                                        |
| 1   | 2026-08-18 | Created. Established that the feature was never specified, that no Client edit path exists (so this is bigger than two columns), and that creating a Client is already admin-only. D1 settled: Writer is a linked staff member. Recorded the two consequences — the analyst read gap and the missing staff display name.                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## S3 built — Industries admin screen, planner verification, 2026-08-18

Branch `feat--client-industry-writer`. ⚠️ **The brief's premise was stale: it said
S1+S2 were uncommitted and staged. They were not** — the user committed them as
`33f4fea`, and the index was empty. The executer detected this, corrected it, and
left the index alone. HEAD is still `33f4fea`; S3 is uncommitted.

Gate re-run by the planner: **142 files / 2,415 tests, exit 0** (2,377 → +38,
+4 files). Nothing under `supabase/` touched — confirmed by
`git status --porcelain supabase/` returning empty.

| Claim                                  | How it was checked                                                                     | Result                                                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The four RPC arg names are right       | Compared `supabase.rpc(...)` calls against `pg`'s own signatures in the applied SQL    | ✅ `create_industry(p_name)`, `update_industry(p_id, p_name)`, `set_industry_status(p_id, p_status)`, `delete_industry(p_id)` — all four exact                                           |
| The refusal fixture matches reality    | Read the `raise exception` at `client-industry-writer.sql:277`                         | ✅ `'cannot delete: % client(s) are still recorded in this industry'` — the fixture is the database's real format string, not an invention                                               |
| Empty ≠ failed, enforced               | ⚠️ **Planner's own mutation**: collapsed the `unavailable` branch into the empty state | ✅ **3 red across 2 files**, incl. the page-level test; restored, sha256 `6083469f…` byte-identical                                                                                      |
| The admin gate is real, not decorative | Read both guard tests                                                                  | ✅ They assert the redirect escapes **and** the seam was never called — and the create test passes an EMPTY name, so it proves the guard runs **before** zod, not merely that both exist |
| The nav rule is not dead code          | Read the diff in context                                                               | ✅ Placed **above** the generic `paths.settings.profile` prefix line, per that file's own warning                                                                                        |

### ⚠️ MY BRIEF WAS WRONG, AND THE REPO HAD ALREADY WRITTEN DOWN WHY

I listed `settings-tabs.tsx` under MODIFY. The executer refused and flagged it.
**The refusal is correct.** `settings-tabs.tsx` owns only the Profile/Security
tabs of `/settings` — the analyst-facing page, which deliberately uses
`getRole`/`isAdmin` rather than `requireAdmin()` so an analyst can still reach
their own profile and password form. Adding an admin tab there would have forced
the guard onto the parent and locked every analyst out of their own account
settings to hide one panel from them.

⚠️ **This was not a judgement call the executer had to make — it was a rule the
codebase states in three places**, including `paths.ts` verbatim: _"admin-only
surfaces get their own routes rather than becoming tabs that would force
`requireAdmin()` onto the parent."_ My brief contradicted a documented invariant;
matching the Services precedent "exactly", as the brief also demanded, is what
caught it. The three files the brief failed to list (`paths.ts`,
`settings/page.tsx`, `nav-config.ts`) are what the correct route actually needs.

### Divergence from the Services precedent, accepted

⚠️ **There is no `list_industries_admin` RPC**, so unlike Services this screen has
no per-industry client count and cannot pre-disable Delete. The executer left
Delete always offered and let the database refuse. **That is right:** computing a
count here would be a second copy of `delete_industry`'s rule derived from an
already-stale read — it would start offering deletes the database refuses, and it
would make the verbatim-refusal requirement unreachable, since nothing would ever
produce the message. If a count in the list is wanted later, it is an S1 follow-up
(a new RPC), not a UI change.

### Open after S3

- ⚠️ **The registry is still empty and must be filled through this screen.**
  `create_industry` refuses from the SQL editor with `42501` because `auth.uid()`
  is null there. S4's picker has nothing to offer until an admin adds rows.
- ⚠️ Still outstanding from S2 and unrelated to S3: run `notify pgrst, 'reload
schema';` and load `/clients` once. The PostgREST embed has never executed, and
  `getClient` throwing degrades the upload name-match gate.
- The rename UI has no precedent — `updateServiceAction` exists but is wired to
  nothing, so the inline rename form is new design rather than a copy.

## S4 shaping — Capture. Four decisions, 2026-08-18

Taken by the planner before the S4 brief, from first-hand reads of the applied
SQL, the RLS policies, and the create path.

### D7 — Creation writes both columns in the SAME insert; it does NOT call the RPC

`createClient` is a direct `.insert()` on `public.clients`, guarded by the RLS
policy `"arcbase add clients" with check (public.is_admin())`. RLS gates ROWS,
not columns — so an admin inserting `industry_id` and `writer_id` in that same
statement is guarded exactly as tightly as `set_client_industry_writer` would
guard them, and needs no new SQL.

⚠️ **The deciding reason is failure states, not tidiness.** Registering a Client
is already TWO writes with a four-outcome result, including
`created_services_failed` — "the Client EXISTS but is broken on arrival, and
retrying would duplicate it, because `clients` has no unique constraint
(ADR 0009)". A second write for industry/writer would add another such outcome.
Folding both columns into the insert adds **none**: one statement, atomic.

### D8 — The edit surface always submits BOTH fields, every time

Forced by the signature, not chosen: `set_client_industry_writer` applies both
arguments including NULL, so **NULL clears**. `client-industry-writer.sql:314-317`
states it — _"a caller must always send the current value of the field it is not
changing; a partial update is impossible through this signature, on purpose."_
A form that posts only the field the admin touched silently wipes the other.

### D9 — The picker offers ACTIVE industries **plus the client's current one, even if archived**

⚠️ **The sharpest trap in the slice, and it is created by D8.** The SQL already
decided that an archived industry stays assignable, and says why: refusing one
would mean a Client whose industry was archived after assignment could never be
saved again — its writer could not be changed without also changing its industry.

Because every save re-sends both fields, an edit form whose picker lists only
active rows has **no option matching an archived current industry** — so saving a
writer change would silently move or clear that Client's industry. The picker must
therefore include the current value whatever its status, marked as archived.
Creation is different: a brand-new Client has no current value, so its picker
offers active rows only.

### D10 — `Industry[] | null` into the dialog and the card, mirroring `services`

`AddClientDialog` already takes `services: ArcboundService[] | null` and reads the
three states apart: `null` → the read failed, "assign afterwards"; `[]` → "No
services are registered yet. An admin adds them under Settings → Services"; rows →
the picker. Industries take the identical shape, so S3's empty-vs-failed
distinction survives into capture instead of being re-litigated.

⚠️ **The registry is empty today**, so the `[]` branch is the one that renders on
the first run — and it must point at Settings ▸ Industries, as the services one does.

### ⚠️ S4 ENDS THE "CLIENTS ARE IMMUTABLE" READING OF ADR 0007

`src/app/(app)/clients/actions.ts` opens: _"Clients are immutable (ADR 0007,
invariant #2) — this file exposes only a create action. There is deliberately no
update or delete action."_ **S4 makes that false**, and the comment must be
corrected by the slice that falsifies it.

ADR 0007's own text — `clients` has _"no update/delete policies (enforcing
immutability at the database)"_ — remains **literally true**: S1 added no policy,
and `set_client_industry_writer` is SECURITY DEFINER, so it bypasses RLS rather
than being permitted by it. What changed is the invariant that sentence was
enforcing. Two columns are now admin-mutable; `name` and `linkedin_url` remain
unreachable by construction, which is the half that actually protects attribution.

⚠️ **A narrowing, exactly like the one report links applied to the same ADR.**
Recording it is the planner's job — the executer FLAGS it and does not edit the ADR.

## S4 built — Capture, planner verification, 2026-08-18

Branch `feat--client-industry-writer`, HEAD still `33f4fea`, index empty, nothing
committed. Gate re-run by the planner: lint ✅ · tsc ✅ · **144 files / 2,457
tests** ✅ (2,415 → +42, +2 files). `supabase/` and `docs/adr/` both clean.

| Claim                                           | How it was checked                                                      | Result                                                                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The RPC is called with the right names          | Compared against the applied SQL                                        | ✅ `p_client_id`, `p_industry_id`, `p_writer_id` — exact                                                                                                                                      |
| ⚠️ A writer-only save re-sends the industry     | **Planner's own mutation**: made the action forward `null` for industry | ✅ **2 red**; restored, sha256 `e44f0035…` identical                                                                                                                                          |
| ⚠️ An archived current industry survives a save | **Planner's own mutation**: filtered the picker to active-only          | ✅ **2 red**, and it reproduced the defect exactly — `expected '' to be '3333…'`, i.e. the select falls back to empty, which posts as NULL and CLEARS. Restored, sha256 `c3d862cc…` identical |
| The widened create assertion is not a loosening | Read it                                                                 | ✅ `toHaveBeenCalledWith({...})` is exact-match on all four keys with explicit `null`s — **stricter** than before, not weaker                                                                 |
| Trap 3 is really fixed                          | Read `createClient`                                                     | ✅ the directory is read only when `writer_id` is set, so the `unknown` state — "a human must reassign" — can no longer be manufactured about a writer just assigned                          |

### Two things the executer got right that the brief did not ask for

⚠️ **The same trap on the other field.** A writer whose staff account has left the
directory has no matching option either — so an INDUSTRY-only change would clear
the writer. `writerOptions` offers the raw id labelled _"no longer a staff
account"_. My brief named the industry half only; they generalised it.

⚠️ **Absent ≠ empty on the wire.** The action refuses a submission with a field
MISSING rather than obeying it, because once both become `null` a broken form and
a deliberate clear are indistinguishable. An empty string means "not recorded"; a
missing key means some future form forgot a field, and now gets a loud error
instead of silent data loss. That is the four-state discipline applied one layer
lower than anyone asked.

### ⚠️ THE ONE UNTESTED BEHAVIOUR IN THE SLICE — the recurring shape

`src/app/(app)/clients/page.tsx` **has no test file at all**, confirmed. The
change there — fetch industries and staff only for admins, `Promise.all`, degrade
to `null` never `[]` — is unproven. It follows the existing `services` line
exactly and is low-risk, and the executer was right not to widen scope, but this
is the same **"View tested, wiring not"** defect shape recorded against the
Services registry. Worth a test in S5, where that page is already in scope.

### ⚠️ CARRIED INTO S5: a false sentence is on screen now

`clients/page.tsx:79` still renders **"records are immutable"** to every staff
member. S4 made that false. The executer left it as list copy belonging to S5 —
defensible, but it is user-visible text that this slice falsified, so **S5 must
correct it**, not merely may. The parallel comment in `clients/actions.ts` and a
second one in `services/clients.ts:25` were both corrected in place; ADR 0007 was
correctly flagged and left alone.

## S5 shaping — Surfaces. Four decisions, 2026-08-18

⚠️ **S4 ALREADY SHIPPED THE DETAIL DISPLAY.** `ClientIndustryWriterCard` renders
both fields on `/clients/[id]` for analysts and admins alike, so S5's detail work
is not "add the fields" — they are there. S5 is **the two list columns, the copy
S4 falsified, and the test that page never had.**

`ClientListRow extends Client`, so both fields already reach the table; no type
or service change is needed.

### D11 — The Writer column gets an ⓘ; Industry does not

`ClientWriter` has four states, two of which are alarming and easily confused
("assigned to an account that no longer exists" vs "the directory could not be
looked up"). A table cell can only hold a terse label, so the sentence that
distinguishes them has to live somewhere — that is what ⓘ is for on this table
already. `ClientIndustry` is two states and self-evident; an ⓘ would be noise.

⚠️ **TWO EXISTING TESTS GO RED BY DESIGN, AND BOTH MUST BE UPDATED DELIBERATELY:**
`metric-definitions.test.ts:461` pins `Object.keys(CLIENT_LIST_METRIC_KEYS)` to
exactly `["Last ArcBase upload", "Posts"]`, and a sweep at :439 asserts every
client-list metric key stays OFF every client-visible map. ⚠️ **The sweep is a D3
boundary, not a formality — extend it, never weaken it.** A Writer's email is
staff PII and must never reach `/r/[token]`.

### D12 — Both new columns hide below a breakpoint, via `meta.className`

Seven columns do not fit a phone. `clients-table.tsx` applies `meta.className` to
BOTH the header cell (:102) and the body cell (:159), so one class hides a column
in both places and the table cannot misalign — verified first-hand.

⚠️ **Hiding is acceptable here ONLY because the detail page carries the full
truth**, including all four writer states in prose. Hiding a column is making
information invisible, not smaller; it is defensible for a staff-admin attribute
and would not be for a figure a reader is asked to reconcile.

### D13 — The four writer states in a cell: terse label, dash for unreadable ONLY

Follow the `lastUpload` precedent exactly, which the repo already argues for:
`Never` is a known fact in muted text, and the em dash is reserved for "could not
be read" and carries an `sr-only` sentence via `<Unavailable what="…" />`.

So: resolved → the email, truncated · `null` → "Not recorded" (a known fact, NOT
a dash) · `unknown` → a terse label that does NOT read as "nobody" · `unavailable`
→ `<Unavailable what="Writer" />`. ⚠️ **Only the last one may be a dash.**

### D14 — Sorting: only `unavailable` parks

`accessorFn` returns `undefined` for `unavailable` with `sortUndefined: "last"`,
so unreadable rows park at the bottom in BOTH directions — the rule `lastUpload`
already sets. ⚠️ `null` and `unknown` are **known facts** and sort as values; they
are not missing data and must not park with it.

### Also in S5, and not optional

- ⚠️ `clients/page.tsx:79` renders **"records are immutable"** to every staff
  member. S4 made that false. **Correct it.**
- ⚠️ `src/app/(app)/clients/page.tsx` **has no test file at all**. S4's untested
  wiring lives there — the "View tested, wiring not" shape. S5 gives it one.

## S5 built — Surfaces, planner verification, 2026-08-18. WORKSTREAM CODE-COMPLETE

HEAD still `33f4fea`, index empty, nothing committed. Gate re-run by the planner:
lint ✅ · tsc ✅ · **145 files / 2,482 tests** ✅ (2,457 → +25). `supabase/` and
`docs/adr/` clean.

| Claim                                    | How it was checked                                             | Result                                                                                                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Four writer states render distinctly     | Read the column + its test                                     | ✅ `new Set(texts).size === 4`, and only `unavailable` is a dash                                                                                                                                                                                 |
| ⚠️ Only `unavailable` parks when sorting | **Planner's own mutation**: made `null` return `undefined` too | ✅ red — and it confirms their subtlest claim: the two `at(-1)` parking assertions **still passed**; the failure is the REVERSAL, `['Orphaned','Resolved','Unset']` vs `['Unset','Orphaned','Resolved']`. Restored, sha256 `4a10f8ad…` identical |
| The PII sweep was extended, not weakened | Read it                                                        | ✅ the `Object.keys` pin went 2 → 3 entries; the sweep still asserts every client-list key stays off client-visible maps, plus a named test pinning WHY the Writer is excluded — a colleague's email, a different reason from its neighbours     |

### ⚠️ MY SCOPE LIST WAS WRONG AGAIN — the same failure as S3

`clients-table.tsx` was NOT in the MODIFY list, and it had to be. Its sort
`aria-label` was a nested ternary whose final `else` branch was the literal string
`"last ArcBase upload"` — so **any** new sortable column inherits that name, and
the Writer control would have announced itself as the column two along. The
executer replaced it with a `SORT_LABELS` record whose fallback is the raw column
id: still wrong, but never another column's name.

⚠️ **My own brief demanded the aria-label keep agreeing with the header, which is
only possible by editing that file.** Twice now the brief's file lists have been
the defect — S3 named a file that must NOT be touched, S5 omitted one that must be.

### ⚠️ CARRIED — `CONTEXT.md` IS NOW FALSE, AND IT IS THE GLOSSARY

`CONTEXT.md:114` defines **Immutability** as _"the rule that Clients and Uploads
are never edited"_, and :119 says _"the Client RECORD stays immutable"_. S4 made
both false. This is sharper than the list caption already fixed, for two reasons:

1. It is the **domain glossary** — the file every future session reads to learn
   what the words mean. A false definition there propagates into briefs.
2. ⚠️ **The existing carve-out does not cover this case.** Line 119 already
   distinguishes an _assignment_ from the _record_ — but that worked because
   Services live in a join table. `industry_id` and `writer_id` are columns **on
   the clients row**, so the assignment IS the record this time. The distinction
   the glossary relies on does not survive contact with this slice.

The honest replacement is narrower and true: `clients.name` and
`clients.linkedin_url` are unreachable by construction; two attribute columns are
admin-writable through one definer function. ⚠️ **Planner's job, not an
executer's** — it is a `domain-modeling` edit, and ADR 0007 should be re-read
beside it.

Also still false and out of every slice's scope: two captions in
`docs/arcbase-dashboard-design-brief/`.

### Status

**S1–S5 are code-complete and green.** Nothing further is handed to an executer.
Remaining: the glossary correction (planner), adding industry rows through
`/settings/industries`, `notify pgrst, 'reload schema';`, and commit/push/PR.

## Glossary corrected — `CONTEXT.md`, 2026-08-18 (planner)

Done by the planner, not an executer: `CONTEXT.md` is the domain glossary, and a
false definition there propagates into every future brief.

**Immutability** was rewritten. The old entry claimed _"Clients and Uploads are
never edited"_ and rescued the Services exception by placing the line at
**record vs relation** — Services being _"a row in a separate relation, changing
nothing about the Client record"_. ⚠️ **S4 broke that line**, because Industry and
Writer are recorded on the Client record itself.

The replacement moves the line to **identity vs attribute**, which is where it
actually holds and always did: a Client's **name** and **LinkedIn URL** are
unreachable by every write path at any privilege — load-bearing, since the name
is what the reporting pipeline joins scraped Posts on — while attributes recorded
_about_ a Client (Services, Industry, Writer) are admin-assignable.

Two terms the workstream introduced were **missing from the glossary entirely**
and have been added beside **Client**, whose attributes they are:

- **Industry** — a controlled registry value, archivable, "not recorded" a
  legitimate state distinct from unreadable.
- **Writer** — ⚠️ **an assignment, not a permission**; it grants and withholds no
  access (every staff member still reads every Client). Its four states are named
  and the reason they never collapse is recorded: `unknown` and `unavailable`
  **demand opposite actions** — reassign vs retry.

`npx prettier --check CONTEXT.md` passes; no test reads the file. ⚠️ **ADR 0007
was NOT edited** — this repo records a narrowing in the narrowing document, the
way ADR 0007 itself narrows 0005 in its own Status section, rather than by
rewriting the older ADR.

### ⚠️ RECOMMENDED, NOT DONE: this workstream should have an ADR

All three of the repo's ADR tests are met — hard to reverse (a schema change plus
a permanent narrowing of a stated invariant), surprising without context (a future
reader WILL ask why Clients became mutable after 0007 said they never would), and
a real trade-off (a SECURITY DEFINER function vs an RLS update policy; columns on
the row vs a join table as Services used). The decision doc is not a substitute:
it is a working record, and ADRs are where this repo puts narrowings.

## D15 — Industries SEEDED, and Writer becomes a REGISTRY, not a staff account

**2026-08-18.** Arcbound supplied its real vocabulary, which settled the open seed
question and exposed a modelling error at the same time.

### Industries — seeded, decided, done

The roster of 27 clients holds **7 distinct industries**:
`Tech 9 · Coaching 6 · Services 4 · Health 4 · Food 2 · Business 1 · Finance 1`.
Only the 7 names are stored; counting Clients per industry is the reporting
layer's job and is not duplicated in the registry.

Written as a twin pair — `supabase/industries-seed.sql` +
`supabase/migrations/20260818130000_industries_seed.sql`, added to
`sql-sync.test.ts`'s `PAIRS` and **mutation-proved live** (changing one value in
one copy turns it red). ⚠️ The table's DDL objected that _"a guessed seed would be
indistinguishable from a decision"_ — this is the decision, so the objection is
spent.

### ⚠️ D15 — THE WRITER MODEL WAS WRONG, AND THE FOUR NAMES PROVED IT

Asked to add **Ryan Prior, Courtney Taylor, Izzy Bailey and Siddharth Kumar**, no
migration can do it: S1 made `clients.writer_id` a
`uuid references auth.users(id)`, and `list_staff_directory()` reads `auth.users`
and labels people by **email**. A Writer was therefore a _login_, and these four
are _people_.

**Decision: Writer becomes a free-standing registry, exactly like Industries.**

The argument that settles it is already written into `CONTEXT.md` by the glossary
correction, one step earlier and without noticing the consequence: _"a Writer is
**an assignment, not a permission** — it grants no access and withholds none."_
⚠️ **Binding Writer to `auth.users` made it exactly the thing that entry denies:**
to record who writes for a Client you had to issue that person a login, and under
ADR 0013 a Data Analyst reads EVERY Client. The model forced a credential and a
full read grant for a fact about authorship.

⚠️ **THIS COLLAPSES `ClientWriter` FROM FOUR STATES TO TWO.** The four states
existed only because a `writer_id` could point at an account the directory could
not resolve. A registry row read through the same embed as `industry` cannot: a
set writer always resolves, so `unknown` and `unavailable` cease to exist — they
were artefacts of the wrong model, not facts about the world. ⚠️ Deleting a
distinction is only honest when the thing it distinguished can no longer happen;
that is the case here, and the brief must make an executer prove it.

**Consequences, in dependency order:**

| #      | Work                                                                                                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **W1** | ⚠️ SQL ONLY: `public.writers` + 4 admin RPCs mirroring `industries`; swap `clients.writer_id`'s FK from `auth.users` to `public.writers`; seed the four names                                |
| **W2** | Code collapse: `ClientWriter` → 2 states, `writer:writers(id, name)` embed, delete `staffEmailsById`; update the Writer ⓘ and ⚠️ its PII-sweep rationale, which currently cites an **email** |
| **W3** | Settings ▸ Writers admin screen — a near-mechanical mirror of S3                                                                                                                             |

⚠️ **`list_staff_directory()` is orphaned by W1 but MUST NOT be dropped there** —
the shipped code still calls it. It goes in W2, after its last caller.

⚠️ **`supabase/client-industry-writer.sql` IS APPLIED AND MUST NOT BE EDITED.**
W1 is a NEW twin pair that alters what that one built.

⚠️ **PERSON NAMES COLLIDE AND INDUSTRY NAMES DO NOT.** The case-insensitive unique
index is still right — a registry whose entries cannot be told apart is useless —
but a genuine second "Ryan Prior" is a real possibility, and the answer is a
human making the name distinguishable at that moment, never a silent second row.

This is now ADR material (it narrows ADR 0013's boundary between privilege and
attribution); the ADR is owed and not yet written.
