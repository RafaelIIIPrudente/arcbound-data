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
| **S3** | Capture                        | Add Client dialog gains both pickers; the first `updateClientAction` + edit surface, admin-only, ⚠️ Industry and Writer only                                                              | S2         |
| **S4** | Surfaces                       | Client detail + two list columns, responsive                                                                                                                                              | S2         |

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
