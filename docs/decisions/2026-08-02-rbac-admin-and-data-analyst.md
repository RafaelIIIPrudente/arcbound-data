# RBAC: `admin` and `data analyst`

**Date opened:** 2026-08-02
**Branch:** `feat--implement-RBAC` (branched off `main` at `7d222f1`, clean tree)
**Session role:** planning (shape → `/handoff`). No production code written here.
**Status:** 🟢 **COMPLETE** — four slices landed, all SQL applied and live-verified
(2026-08-02), 1,545 tests green. S1+S2 committed as `f379882`, S3 as `50f65c8`;
S4 uncommitted. Residual open items are at the bottom; none block use.

**S4 was unplanned and necessary.** S3 put the Staff Roles link on `/settings`, but
`/settings` was not in the sidebar and nothing linked to it — `top-bar.tsx` has no
links at all, the avatar being decorative. So the roles screen was reachable only by
typing a URL. **Planner miss:** the S3 brief said "render a link on the settings
page" without checking the settings page was itself reachable. S4 added Settings to
the sidebar as a sixth item, visible to everyone (the roles link inside stays
admin-only), which also un-orphaned profile and password management.
Handoff: [`2026-08-02-rbac-s4-settings-nav.md`](../handoffs/2026-08-02-rbac-s4-settings-nav.md).

---

## Origin prompt (verbatim)

> I would like to implement RBAC here. Roles: admin, and data analyst (which
> uploads the data to each client) ask me questions using /grill-with-docs

---

## Repo facts established before questioning

Looked up, not assumed. Line references are as of `7d222f1`.

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                                        | Source                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| F1  | Authorization today is a single boolean. `routeAccess(pathname, isAuthed)` is pure and is the only gate.                                                                                                                                                                                                                                                                                    | `src/lib/route-access.ts:59`, called from `src/middleware.ts:77`                       |
| F2  | ADR 0007 explicitly forecloses roles: _"Authorization collapses to authenticated vs. not… There are no in-app role tiers in v1."_ RBAC **amends an Accepted ADR**.                                                                                                                                                                                                                          | `docs/adr/0007-arcbase-single-tenant.md`                                               |
| F3  | Precedent for amending it exists — ADR 0011 (Report Links) already narrowed 0007 for a non-user read grant.                                                                                                                                                                                                                                                                                 | `docs/adr/0011-client-report-links.md`, cited at `route-access.ts:15`                  |
| F4  | **No role storage exists.** No `profiles` / `staff_roles` table. The only user attribute read anywhere is `user_metadata.full_name`.                                                                                                                                                                                                                                                        | `src/app/(app)/settings/page.tsx:12`                                                   |
| F5  | `getSession()` returns a Supabase `User \| null`, request-memoised via React `cache()`, with a source-guard test forbidding `unstable_cache`. Natural seam for deriving a role.                                                                                                                                                                                                             | `src/lib/auth/session.ts:31`                                                           |
| F6  | **Nearly every write is a `SECURITY DEFINER` RPC granted to `authenticated`** — `ingest_metrics`, `ingest_outreach`, `issue_report_link`, `rotate_report_link`, `revoke_report_link`, `backfill_post_attributes`. `SECURITY DEFINER` **bypasses RLS**, so role restrictions on these paths cannot be expressed as RLS policies; they must live in the function body or the `EXECUTE` grant. | `supabase/migrations/*.sql`                                                            |
| F7  | Base tables have **`select`-only** policies for `authenticated` and no insert/update/delete policies at all (immutability enforced at the DB).                                                                                                                                                                                                                                              | `uploads`, `post_attributes`, `report_links`, `outreach_uploads`, `outreach_prospects` |
| F8  | **Exception to F6:** Add Client is a direct `.insert()` under an RLS insert policy.                                                                                                                                                                                                                                                                                                         | `src/services/clients.ts:272`                                                          |
| F9  | **`public.clients` has no migration in this repo** — created out-of-band. Any RBAC migration touching its policies edits DDL this repo does not own the history of.                                                                                                                                                                                                                         | `supabase/migrations/` (absent)                                                        |
| F10 | Write surface = 8 server-action files; read surface = 18 page routes; nav = 5 items.                                                                                                                                                                                                                                                                                                        | `grep -rl '"use server"' src`; `find src/app -name page.tsx`                           |
| F11 | Outreach data is flagged staff-only third-party PII — a pre-existing sensitivity boundary that does not currently map to a role.                                                                                                                                                                                                                                                            | `src/paths.ts` (`clients.outreach` ⚠️ block), ADR 0012                                 |
| F12 | Dev mode (`authDisabled`) lets **every** request through with no session at all. RBAC must decide what role, if any, that implies.                                                                                                                                                                                                                                                          | `src/middleware.ts:48`                                                                 |

---

## Decisions

_(recorded as they are made — see the Feedback & revisions log at the bottom)_

| #   | Question                                       | Decision                                                                                                                                                                      | Rationale                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | What is the analyst blocked from?              | **Admin-only governance actions.** Analyst uploads (LinkedIn + Outreach) and **reads everything**. Admin adds: Add Client, Report Link issue/rotate/revoke, role management.  | Fits "analyst uploads the data to each client". Deliberately does **not** reintroduce per-row scoping — that is the tenancy machinery ADR 0007 deleted (F2).                                                                                                                                                                                     |
| D2  | Where is the boundary enforced?                | **App layer + database.** Role checked in the app _and_ inside the `SECURITY DEFINER` bodies / `EXECUTE` grants.                                                              | The three Report Link RPCs are `grant execute … to authenticated` (F6) — an analyst with their own token can call them directly. Hiding a button does not remove a capability. Also matches ADR 0007's "RLS remains the data boundary".                                                                                                          |
| D3  | Where does the role live?                      | **`public.staff_roles` table** (`user_id` → role) + an `is_admin()` SQL helper.                                                                                               | Readable in SQL, so D2's DB-side checks work. Role changes take effect immediately. In-app management needs **no service-role key** — none exists in this repo (verified: 0 hits in `src`), and adding one would introduce a total-RLS-bypass secret. `user_metadata` rejected outright: user-writable via `auth.updateUser()` → self-promotion. |
| D4  | What is a user with no `staff_roles` row?      | **Analyst**, with admins **seeded in the same migration** by email against `auth.users`.                                                                                      | Absence = least privilege, but no window in which the app has zero admins. Existing staff keep working when it lands; only governance narrows. Emails filled in by staff at apply time (SQL is applied by hand in the editor).                                                                                                                   |
| D5  | How does an admin change a role?               | **Full admin screen.** Two new `SECURITY DEFINER` RPCs (list staff, set role) + page + tests.                                                                                 | Chosen over SQL-only and read-only variants. ⚠️ Note: `authenticated` **cannot read `auth.users`**, so enumerating staff requires its own `SECURITY DEFINER` function — this puts a user-enumeration surface in the app.                                                                                                                         |
| D6  | Lockout guard on `set_staff_role`?             | **Refuse to remove the last admin** — raised inside the function, same transaction, so it holds under concurrent demotions. Self-demotion allowed while another admin exists. | The precise invariant is "at least one admin always exists". Blocking self-demotion as well is a broader rule that does not add safety.                                                                                                                                                                                                          |
| D7  | How do admin-only controls look to an analyst? | **Hidden.** No Add Client button, no issue/rotate/revoke controls, no roles nav item.                                                                                         | Read-only state still shows (D1: analyst reads everything) — an analyst still sees _that_ a Report Link exists and when it was issued. Only the action affordances disappear. No dead UI.                                                                                                                                                        |
| D8  | Where does the route check run?                | **Page level** — a `requireAdmin()` helper at the top of each admin route, redirecting to `/`. Middleware is **unchanged**.                                                   | Middleware already makes one Supabase round-trip per request (`middleware.ts:68`); a role lookup there would be a second, on every matched route including those that do not care. Page-level reads are memoised alongside `getSession()` (F5) at zero extra cost, and the check sits next to the code it protects.                              |

| D9 | Is Add Client admin-only, even though it blocks the analyst? | **Yes — onboarding is an admin act.** Admin decides who ArcBase tracks; analyst keeps their data current. | Accepted cost: an analyst with a fresh CSV for a brand-new client waits on an admin. ⚠️ Consequence: Add Client is the **only** write behind an RLS insert policy rather than an RPC (F8), so DB enforcement means altering a policy on `public.clients` — the table with **no migration in this repo** (F9). |
| D10 | What is the role in auth-disabled dev mode? | **Admin.** | Preserves the browsable-without-Supabase dev affordance, including the new roles screen. Cannot fail open in production: `authDisabled = !isSupabaseConfigured && NODE_ENV !== "production"` (`src/config.ts:47`), so it is false in every deployed build by construction. |
| D11 | How is this delivered? | **Three sequenced handoffs** — S1 foundation + ADR (inert), S2 enforcement, S3 admin screen. | Mirrors the date-picker workstream shape that worked in this repo. S1 changes no behaviour, so it cannot break anyone. Between S2 and S3, role changes require SQL — accepted and disclosed. |

---

## Planner-decided specifics

Not put to the user — conventions and consequences that follow from D1–D11.

- **Role values:** `admin` and `analyst` in the database. Display strings "Admin" and
  "Data Analyst". Both terms go into `CONTEXT.md` as part of S1's scope (domain
  vocabulary lands with the code, not in this planning doc).
- **`staff_roles` RLS is own-row-only:** `using (user_id = auth.uid())`. An analyst
  can read their own role and nothing else — the staff roster is not readable by
  the `authenticated` role at large. The admin screen gets the full list through
  the `list_staff()` `SECURITY DEFINER` function instead (D5), so enumeration is
  gated on admin rather than on being signed in.
- **No recursion hazard:** `is_admin()` is `SECURITY DEFINER`/`stable`/
  `set search_path = public`, and the `staff_roles` select policy above does **not**
  call it — so a policy that consults `is_admin()` (e.g. `clients` insert) cannot
  recurse into itself.
- **Helper location:** `src/lib/auth/roles.ts`, mirroring `src/lib/auth/session.ts`.
  `getRole()` is memoised with React `cache()` and must carry the **same ⚠️
  request-scope warning** as `session.ts:18` — a cross-request cache would serve one
  user's role to everyone, which is a privilege-escalation bug rather than a
  performance bug.
- **Route:** `/settings/roles`, registered in `paths.settings` alongside the existing
  `profile` and `security` entries.
- **RPC guard shape:** `if not public.is_admin() then raise exception … using
errcode = '42501'; end if;` at the top of each guarded `SECURITY DEFINER` body.
- **`public.clients` discovery is a prerequisite, not a guess.** Before S2's migration
  is written, staff run a read-only `select * from pg_policies where tablename =
'clients';` and the migration is authored against what is actually there. The
  policy name is not assumed.
- **`/customers` is out of scope on the facts, not by omission.** `src/services/customers.ts:1`
  imports `MOCK_CUSTOMERS` — it is a pure in-memory mock with no database behind it,
  so an ungated write there touches nothing real.

---

## S1 landing record — 🟢 LANDED, planner-verified (2026-08-02)

Handoff: [`docs/handoffs/2026-08-02-rbac-s1-role-foundation.md`](../handoffs/2026-08-02-rbac-s1-role-foundation.md).
Uncommitted on `feat--implement-RBAC` at `7d222f1`.

**Shipped:** `supabase/staff-roles.sql` + `supabase/migrations/20260802120000_staff_roles.sql`
(twins, registered in `PAIRS`) · `src/lib/auth/roles.ts` + `roles.test.ts` ·
`docs/adr/0013-arcbase-staff-roles.md` · `CONTEXT.md` + `AGENTS.md` updates.

**Verified independently, not accepted on report:** scope is exactly the eight briefed
files with no commits; `pnpm test` re-run → **97 files / 1,480 tests, exit 0**
(baseline 96 / 1,460); SQL twins diff clean on executable SQL; `roles.ts` matches the
published contract branch-for-branch; ADR 0013 opens `Accepted. **Amends ADR 0007**`.
The slice is inert as designed — no component, page, action, route, nav, or middleware
file was touched.

### 🔴 CARRY INTO THE APPLY STEP AND INTO S2 — the zero-admin trap

`insert … select id from auth.users where email in ('bryan@arcbound.com')` inserts
**zero rows, with no error**, if that account does not exist in the target Supabase
project. Combined with D4 (absence of a row means `analyst`), applying against a
project where the address is absent or differs leaves ArcBase with **no admin at
all** — and once S2 enforces, every governance action is locked out with no in-app
route back in. Recovery would be SQL.

**The apply step is therefore not "paste and run". It ends with:**

```sql
select u.email, r.role
from public.staff_roles r join auth.users u on u.id = r.user_id;
```

**and confirming at least one `admin` row comes back.** S2 must not be authored
until that has been seen.

### 🔴 THE TRAP FIRED ON APPLY — 2026-08-02

S1's SQL was applied to the live project (`Arcbound LinkedIn Post Analytics`,
branch `main`, PRODUCTION). The verification query returned **0 rows**.

Diagnosis: the join **succeeded** rather than erroring, so `public.staff_roles`
exists and the DDL ran correctly — the table is simply **empty**. The seed's
`where email in ('bryan@arcbound.com')` matched nobody and inserted nothing,
silently, exactly as predicted.

**Cause:** `bryan@arcbound.com` does not exist in `auth.users`. The only account
in the entire project is **`rflprdnt@gmail.com`**. This corroborates
[[bryan-is-the-boss-not-the-operator]] — Bryan is the recipient of ArcBase's
reports, not an operator with an account.

**Fix issued and CONFIRMED 2026-08-02:** the seed was re-run against
`rflprdnt@gmail.com` and the verification query now returns exactly one row —
`rflprdnt@gmail.com | admin`. **S2 is unblocked.** S2 must still carry the
corrected address into BOTH twins (`supabase/staff-roles.sql` and
`supabase/migrations/20260802120000_staff_roles.sql`), or a future clean apply
repeats the bug. Open question left with the user: whether the committed seed
should hold the real address or a documented placeholder typed at apply time.

**⚠️ The project has exactly ONE account.** Consequences for S2/S3, recorded so
the boundary is not over-claimed:

- The boundary currently has **no second party**. Every role decision applies to
  one person, who must be the admin.
- D6's last-admin guard means that account can never demote itself — correct, but
  it makes S3's roles screen a read-only view of a single row until a second
  account exists.
- "An analyst cannot issue a Report Link" is **not observable in this project**.
  It is covered by unit tests only. S2 therefore ships a boundary verified by
  tests rather than by demonstration — true and acceptable, but it must not be
  described as live-verified.

---

## S2 landing record — 🟢 LANDED + APPLIED + LIVE-VERIFIED (2026-08-02)

Handoff: [`docs/handoffs/2026-08-02-rbac-s2-enforcement.md`](../handoffs/2026-08-02-rbac-s2-enforcement.md).
Code uncommitted on `feat--implement-RBAC`; SQL applied to production by staff.

**Code verified independently:** no commits; `pnpm test` → **98 files / 1,495 tests,
exit 0** (baseline 97 / 1,480); the guard appears exactly 3× in each report-links
twin; `alter policy "arcbase add clients"` present with `"arcbase read clients"`
explicitly untouched; both S1 seed twins corrected to `rflprdnt@gmail.com`.

**Database verified live** via two `pg_catalog` reads:

| check                                                             | result                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| `arcbase add clients` `with_check`                                | `is_admin()` ✅                                         |
| `arcbase read clients` `with_check`                               | `NULL` — untouched, analysts still read every Client ✅ |
| `issue_report_link` / `rotate_report_link` / `revoke_report_link` | guarded **true** ✅                                     |
| `report_link_read` / `resolve_report_link`                        | **false** — anonymous `/r/<token>` path intact ✅       |

### Findings from S2

| Finding                                                                                                                                                                                                                                                                                                                                                                                                                                               | Consequence                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **⚠️ Brief gap the executer caught, and it mattered.** All three report-link actions wrap their body in `try { … } catch { return errorState(err) }`. `requireAdmin()` denies by calling `redirect()`, which denies **by throwing** — so a guard placed inside that `try` would be swallowed, converting a denial into a generic error state with no redirect. Guard placed **before** the `try`, with a per-action test asserting the throw escapes. | **S3: any guarded action that catches broadly needs the guard outside the `catch`.** Generalise: `requireAdmin()` is only as strong as the narrowest `try` above it.           |
| **📄 Documentation defect.** `supabase/INGEST-WRITE-APPLY.md:38-43` documents the `clients` policies as `clients_select_authenticated` / `clients_insert_authenticated`. Production actually has `arcbase read clients` / `arcbase add clients`.                                                                                                                                                                                                      | The runbook is **stale relative to the live database** and will mislead the next reader. Correct it. Nothing is broken — the live names were read from `pg_policies` and used. |
| **🔧 Supabase SQL editor renders only the LAST statement's result set.** A multi-statement verification block silently hides earlier output — this nearly left the function guards unconfirmed.                                                                                                                                                                                                                                                       | Run verification queries **one at a time**. Applies to every future apply step in this repo.                                                                                   |
| **Copy defect, undecided.** In the no-link state an analyst still reads _"Give this client a private, read-only link…"_ with no button beneath it — a call to action they cannot perform. The executer correctly declined to rewrite user-facing copy outside its scope.                                                                                                                                                                              | Fold a fix into S3 (e.g. "No report link — ask an admin").                                                                                                                     |
| Executer flag partly mistaken: it reported the brief named `issueReportLinkAction`. The brief named `createReportLinkAction`.                                                                                                                                                                                                                                                                                                                         | No impact; the correct action was guarded. Recorded for accuracy only.                                                                                                         |

---

## S3 landing record — 🟢 CODE LANDED, planner-verified (2026-08-02) · ⏳ SQL NOT YET APPLIED

Handoff: [`docs/handoffs/2026-08-02-rbac-s3-roles-screen.md`](../handoffs/2026-08-02-rbac-s3-roles-screen.md).
Code uncommitted on `feat--implement-RBAC`; S1+S2 committed by the user as `f379882`.

**Shipped:** `list_staff()` + `set_staff_role()` SQL pair · `src/services/staff.ts` ·
`/settings/roles` page + action · `staff-roles-table` components · admin-only link on
`/settings` · `paths.settings.roles` · `resolvePageTitle` branch · the S2 analyst
copy fix on the report-link card.

**Verified independently:** `pnpm test` → **104 files / 1,540 tests, exit 0**
(baseline 98 / 1,495); twins diff clean and registered in `PAIRS`; both functions
revoked from `public`, granted to `authenticated`; `list_staff` **LEFT JOINs from
`auth.users`**; the `/settings/roles` title branch precedes the generic settings
branch; and a grep for a client-side copy of the last-admin rule found **none**.

### 🟢 SQL APPLIED AND LIVE-VERIFIED (2026-08-02)

`supabase/staff-roles-admin.sql` was applied by staff. `pg_proc` confirms:

| function         | `security_definer` | guarded by `is_admin()` | advisory lock                            |
| ---------------- | ------------------ | ----------------------- | ---------------------------------------- |
| `list_staff`     | true               | true                    | **false** — read path, correctly no lock |
| `set_staff_role` | true               | true                    | **true** — write path, lock present      |

**All three slices are now applied. The RBAC workstream is functionally complete.**

### ⚠️ What the 1,540 green tests do and do not prove

The four `set_staff_role` refusal tests, the `updated_at` assertion, and the
advisory-lock test are **SOURCE assertions**. No Postgres runs in this suite, so they
verify the shipped SQL _says_ the right thing — not that the database _does_ it. The
race the advisory lock prevents cannot be tested here at all. Combined with the
one-account reality, that means:

| Behaviour                                                         | Status                                      |
| ----------------------------------------------------------------- | ------------------------------------------- |
| App-layer guards, hidden controls, redirect                       | Covered by real behavioural tests           |
| S2's DB guards (`is_admin()` on the three RPCs, `clients` policy) | **Live-verified** against production        |
| S3's `set_staff_role` refusals, `updated_at`, the lock            | **Source assertions only** — never executed |
| The deny path, the defaulted-analyst row, the last-admin refusal  | **Never executed anywhere**                 |

Real verification of S3 needs the script applied to a database with **two** admins.

### Findings from S3

| Finding                                                                                                                                                                                                                                            | Consequence                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The "unexpected commit" was the user's own** — `f379882`, authored `RafaelIIIPrudente <rflprdnt@gmail.com>`, containing exactly the S1+S2 work. The executer surfaced rather than touched it.                                                    | Correct behaviour under the standing rule. No action.                                                                                                          |
| **Minor deviation, accepted.** `list_staff` returns `sr.created_at` (role-assignment date, NULL when unassigned) rather than `u.created_at` (account creation).                                                                                    | Coherent with `assigned = false`, but the screen cannot show when someone joined. Known choice, not a silent one.                                              |
| **Executer decisions the brief did not settle, both endorsed.** `list_staff`/`set_staff_role` raise for a non-admin rather than returning empty (matches S2's `42501` idiom); `listStaff()` throws on a failed read rather than degrading to `[]`. | The second is this repo's four-state discipline applied to a list — an empty roster would read as "there are no staff accounts", a lie a reader cannot detect. |
| `graphify-out/cache/last_query_stamp` was swept into `f379882`.                                                                                                                                                                                    | Per-machine churn now tracked; it will dirty the tree on every clone that runs a graphify query. Worth adding to the ignore block.                             |

### Other findings from S1

| Finding                                                                                                                                                                                                                                                                                                 | Consequence                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Brief correction (mine).** My recursion rationale was imprecise — a `SECURITY DEFINER` `is_admin()` would not actually recurse today; 42P17 bites only if it later becomes invoker-rights or the table gains `force row level security`. The shipped comment states the stronger, accurate guarantee. | **S2: calling `is_admin()` from policies on OTHER tables is correct and is exactly its purpose.**                                                                                                                                                       |
| `updated_at` has **no trigger** — it is maintained only by the seed's `on conflict … set`.                                                                                                                                                                                                              | **S3's `set_staff_role` must set it explicitly**, or the column will silently lie.                                                                                                                                                                      |
| D10 (`authDisabled` → `admin`) means the analyst view is **not reachable in local dev** without a configured Supabase project.                                                                                                                                                                          | S2's hidden-control behaviour is verifiable by unit/component test only — which is this repo's verification policy anyway, so no change of approach, just no eyeballing.                                                                                |
| **Glossary collision (new).** `CONTEXT.md` already defined **Engineer/Admin** — "sets up and maintains ArcBase and provisions staff accounts" — and now also defines **Admin** as a Staff Role. Two different "Admin"s in one glossary.                                                                 | Needs resolving before S3 puts the word on a screen. Options: rename the Staff Role, rename the operational term, or state explicitly that Engineer/Admin is a _person doing Supabase-level provisioning_ while Admin is an _in-app privilege tier_.    |
| `getSession()` kept **outside** the try in `getRole()` — brief did not settle it.                                                                                                                                                                                                                       | Correct: `getSession()` is total (catches internally, returns `null`), and `null` = "nobody signed in" is genuinely distinct from `analyst` = "could not read the role". Both deny, so both are fail-closed; the distinction is preserved deliberately. |

---

## Open items

✅ CLOSED: admin row confirmed · `clients` policy discovery done (`arcbase read/add
clients`) · `updated_at` set explicitly in `set_staff_role`.

Residual housekeeping the workstream surfaced but did not own. **None blocks use.**

| #   | Item                                                                                                                                                                                                                      | Why it matters                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`CONTEXT.md` defines two different "Admin"s** — the pre-existing _Engineer/Admin_ ("provisions staff accounts") and the new _Admin_ Staff Role.                                                                         | The word is now on a screen (`/settings/roles`). One is a person doing Supabase-level provisioning, the other an in-app privilege tier. Rename one, or state the distinction. |
| 2   | **`supabase/INGEST-WRITE-APPLY.md:38-43` is stale** — documents the `clients` policies as `clients_select_authenticated` / `clients_insert_authenticated`; production has `arcbase read clients` / `arcbase add clients`. | Nothing is broken (S2 used the live names), but the runbook will mislead its next reader.                                                                                     |
| 3   | **`graphify-out/cache/last_query_stamp` was committed** in `f379882`.                                                                                                                                                     | Per-machine churn now tracked; dirties the tree on every clone that runs a graphify query. Add to the `.gitignore` graphify block.                                            |
| 4   | **No second staff account exists**, so the deny path has never executed and `/settings/roles` shows one unchangeable row (the last-admin guard correctly refusing).                                                       | Operational choice, not a defect. Until one exists, S3's SQL behaviour stays source-asserted rather than demonstrated.                                                        |
| 5   | S3 code is **uncommitted**; S1+S2 are committed as `f379882`.                                                                                                                                                             | Per the standing rule, the user commits.                                                                                                                                      |
| 6   | `graphify update .` not run for the workstream.                                                                                                                                                                           | Deferred per slice to keep diffs reviewable; worth one run now the branch is complete.                                                                                        |

---

## Feedback & revisions log

| Date       | Change                                                                |
| ---------- | --------------------------------------------------------------------- |
| 2026-08-02 | Opened. Origin prompt + repo facts F1–F12 recorded. Grilling started. |
