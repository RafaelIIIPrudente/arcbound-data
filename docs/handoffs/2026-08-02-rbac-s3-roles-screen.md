# Handoff — RBAC S3: the roles admin screen

**Date:** 2026-08-02
**Branch:** `feat--implement-RBAC`
**Shaping doc:** [`docs/decisions/2026-08-02-rbac-admin-and-data-analyst.md`](../decisions/2026-08-02-rbac-admin-and-data-analyst.md)
**Predecessors:** [S1](2026-08-02-rbac-s1-role-foundation.md) 🟢 landed · [S2](2026-08-02-rbac-s2-enforcement.md) 🟢 landed + applied + live-verified
**Slice:** 3 of 3 — the final slice.
**Status:** 🟡 emitted, not yet run.

Planner calls folded in without a further round-trip (user said "go"):

- The **analyst copy defect** from S2 rides this slice — it is role-aware UI, which
  this slice is already changing.
- **Creating a second Supabase account stays the user's operational choice.** S3 is
  built to be correct with one account; it just cannot be _demonstrated_ with one.

---

## The prompt as issued

```
ROLE

You are a world-class TypeScript/React engineer and Postgres/Supabase security
practitioner. Your defining trait for this task: you never write the same invariant
twice. When a rule is enforced in the database, you render what the database said
rather than re-deriving the rule in the client — because two copies drift, and the
copy users see is the one that drifts first, silently, into a lie.

You are also disciplined about absence: "has no role assigned" and "was explicitly
set to Data Analyst" behave identically and are NOT the same fact, and a screen
whose whole job is showing who holds what must not collapse them.

Working style, binding:
- READ BEFORE WRITE. Verify every fact below rather than trusting it; if one is
  wrong, STOP and report it.
- ⚠️ comments in this codebase are BINDING CONSTRAINTS. Do not delete or weaken one.
- RED-first (superpowers:test-driven-development).
- DO NOT WIDEN SCOPE. If a change needs a file outside Scope, STOP and FLAG.
- Report honestly with real command output.

GOAL

Ship the Staff Roles admin screen: an admin-only page listing every ArcBase staff
account with its Staff Role, and letting an admin change one. Plus one small copy
fix carried over from S2.

This completes the RBAC workstream.

CONTEXT

The repo IS ArcBase: an internal, auth-gated, single-tenant Next.js app for Arcbound
staff. Read `AGENTS.md` and `CONTEXT.md` first. `docs/adr/0013-arcbase-staff-roles.md`
records this design; it amends ADR 0007.

Already landed on this branch (uncommitted) and APPLIED to production:
- `public.staff_roles` — `user_id` PK → `auth.users(id) on delete cascade`, `role`
  text with `check (role in ('admin','analyst'))`, `created_at`, `updated_at`.
  RLS on, with EXACTLY ONE policy: `staff_roles_select_own` (`user_id = auth.uid()`).
  **No write policies at all** — writes must go through `SECURITY DEFINER`.
- `public.is_admin()` — `stable`, `security definer`, `set search_path = public`,
  granted to `authenticated`.
- `src/lib/auth/roles.ts` — `StaffRole`, `getRole()`, `isAdmin(role)`,
  `requireAdmin()`. Fails closed to `analyst` on every unknown.
- S2 guarded `issue_report_link` / `rotate_report_link` / `revoke_report_link`, and
  `"arcbase add clients"` now has `with_check = public.is_admin()`.

DESIGN DECISIONS (settled — do not relitigate)

- The last-admin invariant: `set_staff_role` REFUSES a change that would leave zero
  admins. Self-demotion IS allowed while another admin exists.
- ⚠️ ENFORCE THAT INVARIANT IN EXACTLY ONE PLACE — the database. Do NOT reimplement
  it in the client to pre-disable a control. Render the server's refusal. Two copies
  of a rule drift, and the UI copy drifts first.
- Absence is a distinct fact. A user with NO `staff_roles` row is a Data Analyst by
  default (D4), and the screen must show that it is a DEFAULT, not an assignment.

REPO FACTS YOU MUST USE (verify each):

1. EVERY SCHEMA CHANGE IS TWO FILES: `supabase/<name>.sql` + a CLI twin
   `supabase/migrations/<timestamp>_<name>.sql`, held identical on executable SQL by
   `supabase/sql-sync.test.ts` via `PAIRS`. Latest timestamp is `20260802130000`.
2. `auth.users` is NOT readable by `authenticated`. Listing staff REQUIRES a
   `SECURITY DEFINER` function. `auth.users.email` is `varchar` — cast it to `text`
   or the `returns table` signature will not match.
3. `/settings` is a SINGLE route (`src/app/(app)/settings/page.tsx`) rendering a
   client-side `<SettingsTabs email fullName />`. There are no nested settings
   routes yet. ⚠️ DO NOT add roles as a tab there — the page would then need
   `requireAdmin()`, which would lock analysts out of their own profile. It gets its
   own route.
4. `src/paths.ts` has `settings: { profile: "/settings", security: "/settings/security" }`.
5. ⚠️ `resolvePageTitle` in `src/components/dashboard/layout/nav-config.ts` matches
   by `startsWith` and ITS ORDER IS LOAD-BEARING — the file documents this trap
   TWICE, in ⚠️ blocks, because a branch placed after a broader `startsWith` is dead
   code that looks alive. `pathname.startsWith(paths.settings.profile)` already
   swallows `/settings/roles`. Any new branch MUST go BEFORE it.
6. S2's pattern for a guarded Server Action, and WHY: all report-link actions wrap
   their body in `try { … } catch { return errorState(err) }`. `requireAdmin()`
   denies by calling `redirect()`, which denies BY THROWING — so a guard inside that
   `try` is swallowed and a denial silently becomes a generic error with no
   redirect. See the ⚠️ block at the top of
   `src/app/(app)/clients/[id]/report-link-actions.ts`. Follow it exactly.
7. `src/components/dashboard/client/report-link-card.tsx` exports a presentational
   `ReportLinkCardView` alongside the connected `ReportLinkCard`, both taking a
   required `isAdmin: boolean`. That split is what makes the card unit-testable —
   mirror it for the new table.
8. AGENTS.md's seam rule applies here: this screen reads APP DATA, so it goes
   through `src/services/*`. (`roles.ts` bypasses the seam only because it is
   auth/identity, following `session.ts`.)

SCOPE

CREATE — SQL pair `supabase/staff-roles-admin.sql` +
`supabase/migrations/20260802140000_staff_roles_admin.sql`, registered in `PAIRS`:

(a) `public.list_staff()` — `plpgsql`, `stable`, `security definer`,
    `set search_path = public`, revoked from `public`, granted to `authenticated`.
    Guard first, in S2's exact shape:

        if not public.is_admin() then
          raise exception 'admin role required' using errcode = '42501';
        end if;

    ⚠️ IT MUST **LEFT JOIN FROM `auth.users`**, NOT SELECT FROM `staff_roles`.
    Absence of a row is the DEFAULT state, so a query driven by `staff_roles` makes
    every unassigned analyst INVISIBLE on the one screen whose job is showing who
    holds what. Return one row per account:

        user_id, email::text, coalesce(r.role,'analyst') as role,
        (r.user_id is not null) as assigned, u.created_at, r.updated_at

    `assigned` is what distinguishes an explicit Data Analyst from a defaulted one.

(b) `public.set_staff_role(p_user_id uuid, p_role text)` — `plpgsql`,
    `security definer`, `set search_path = public`, revoked from `public`, granted
    to `authenticated`. In order:

    1. The admin guard (same shape).
    2. Reject a `p_role` outside `('admin','analyst')` — do not rely on the CHECK
       constraint alone to produce a comprehensible error.
    3. Reject a `p_user_id` with no `auth.users` row.
    4. ⚠️ TAKE A TRANSACTION-SCOPED LOCK BEFORE READING OR WRITING:
       `perform pg_advisory_xact_lock(hashtext('staff_roles_admin_count'));`
       WITHOUT IT THE LAST-ADMIN GUARD IS RACY: two concurrent demotions of two
       different admins can each observe "one other admin remains", both pass, and
       both commit — leaving zero admins, which is precisely the state the guard
       exists to prevent. The table is tiny and writes are rare, so full
       serialisation costs nothing. Explain this in a comment.
    5. Upsert: `on conflict (user_id) do update set role = excluded.role,
       updated_at = now()`. ⚠️ `updated_at` HAS NO TRIGGER — if you do not set it
       here the column lies.
    6. AFTER the write, count admins; if zero, raise
       `'cannot remove the last admin'` with `errcode = '23514'`. Checking after the
       write inside the transaction means the raise rolls it back, and the check
       sees the world the write actually produced.

CREATE — app:
- `src/services/staff-roles.ts` + test — `listStaff()` and `setStaffRole()` over the
  two RPCs, returning typed rows. Follow the existing service shape in
  `src/services/report-links.ts`.
- `src/app/(app)/settings/roles/page.tsx` — Server Component. `await requireAdmin()`
  as its FIRST statement, before any data read.
- `src/app/(app)/settings/roles/actions.ts` + test — `setStaffRoleAction`, with
  `await requireAdmin()` OUTSIDE any `try` (fact 6). Validate input with `zod`.
- `src/components/dashboard/settings/staff-roles-table.tsx` + test — split into a
  connected component and a presentational view, per fact 7.

MODIFY:
- `src/paths.ts` — add `settings.roles: "/settings/roles"`.
- `src/app/(app)/settings/page.tsx` — it is already `async`; read the role and render
  a link to the roles screen ONLY for an admin. An analyst sees no trace of it.
- `src/components/dashboard/layout/nav-config.ts` — a `/settings/roles` title branch,
  placed BEFORE the generic settings branch (fact 5). Extend its test.
- `src/components/dashboard/client/report-link-card.tsx` — THE S2 COPY FIX. In the
  no-link state the description currently reads "Give this client a private,
  read-only link…" for everyone, including analysts who have no button beneath it.
  Make it role-aware: admins keep today's copy; an analyst reads something like
  "No report link yet — an admin can create one." Do not change the ACTIVE-link
  state; an analyst must still see the full status there.
- `supabase/sql-sync.test.ts` — register the new pair.
- `docs/adr/0013-arcbase-staff-roles.md` — append a short note that the roles screen
  landed and that the last-admin invariant lives ONLY in `set_staff_role`.

DO NOT TOUCH: `src/middleware.ts`, `src/lib/route-access.ts`, `src/lib/auth/*`,
`resolve_report_link`, `report_link_read`, `src/app/r/[token]/*`, S2's guards, the
`clients` policies, ingestion, Outreach, or any analytics service. If you believe one
is needed, STOP AND FLAG.

APPROACH

1. Report real git state (`git status --short`, `git branch --show-current`,
   `git log --oneline -3`). S1's and S2's files are there uncommitted and are NOT
   yours. Surface, never rewrite, any commit you did not make.
2. Capture the `pnpm test` baseline count first.
3. SQL, then service, then action, then page, then components, then the copy fix.
4. Mutation-verify three things, and report what went red:
   - Remove the `pg_advisory_xact_lock` line — assert your comment explains why it
     matters even if no test can catch a race (say so honestly if none can).
   - Delete `await requireAdmin()` from the action — a test must go red.
   - Make `list_staff` select from `staff_roles` instead of left-joining
     `auth.users` — a test must go red for the unassigned-analyst case.

ACCEPTANCE CRITERIA

- An analyst hitting `/settings/roles` directly is redirected to `/`; `/settings`
  itself still works for them and shows no link to the roles screen.
- `list_staff()` returns EVERY `auth.users` account, including those with no
  `staff_roles` row, and the screen visibly distinguishes an assigned Data Analyst
  from a defaulted one. A test covers the unassigned case specifically.
- `set_staff_role` refuses: a non-admin caller; an unknown role; an unknown user;
  and any change leaving zero admins. Four separate tests.
- `updated_at` is set on every update — asserted, not assumed.
- The last-admin rule appears in the DATABASE ONLY. Grep your own diff: if the
  client re-derives it, remove it.
- `requireAdmin()` sits outside every `try` in the new action, with a test asserting
  the denial throws rather than returning an error state.
- The new `resolvePageTitle` branch is BEFORE the generic settings branch, with a
  test that fails if reordered.
- An analyst viewing a Client with NO report link sees no call to action they cannot
  perform; with an ACTIVE link they still see the full status. Both tested.
- Gate green; test count strictly up; no existing assertion weakened or deleted.

VERIFICATION

Run and paste real output:

    pnpm lint && pnpm type:check && pnpm test && pnpm build

Verification is the automated gate plus unit/component tests ONLY. DO NOT use
Claude-in-Chrome, a dev server, or any live-browser runtime walk.

⚠️ `public.staff_roles` holds exactly ONE row and it is the admin. So the screen you
are building will, against real data, render a single row that cannot be changed —
the last-admin guard correctly refuses. That is correct behaviour, not a bug. It
also means NOTHING here can be demonstrated against live data. Your tests are the
only evidence. Do not write "verified" where "covered by tests" is what is true.

GUARDRAILS

- DO NOT APPLY THE SQL. No `db push`, no database connection, no execution. Staff
  paste `supabase/staff-roles-admin.sql` into the Supabase SQL editor.
- ⚠️ Put a note at the TOP of the paste script: run verification queries ONE AT A
  TIME. The Supabase SQL editor renders only the LAST statement's result set, so a
  multi-statement block silently hides earlier output — this already nearly caused a
  false confirmation during S2's apply.
- LEAVE ALL WORK UNCOMMITTED on `feat--implement-RBAC`. No commit, push, branch,
  tag, or PR. Never commit to `main`.
- DO NOT run `graphify update`.
- If you cannot satisfy an acceptance criterion, DO NOT silently drop it. Finish
  everything else and report exactly what is undone and why.

REPORT BACK

1. Git state at start and end.
2. `git diff --stat` plus new files.
3. Baseline and final test counts.
4. Full gate output.
5. The `set_staff_role` body, so the ordering of guard → lock → write → count can be
   checked by eye.
6. Confirmation that the last-admin rule appears in NO client-side code, and how you
   checked.
7. What the three mutation checks broke, and that you restored them.
8. FLAGS: anything in this brief wrong about the repo, anything you decided that it
   did not settle, and anything the user must do before this is usable (including
   the apply step).
```

---

## Feedback & revisions log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-02 | Emitted. Not yet run by an executer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-02 | **Code landed, planner-verified.** `pnpm test` → **104 files / 1,540 tests, exit 0** (baseline 98 / 1,495). SQL twins diff clean; pair registered in `PAIRS`; both functions revoked from `public` and granted to `authenticated`. `list_staff` **LEFT JOINs from `auth.users`** so unassigned analysts are visible. `resolvePageTitle`'s `/settings/roles` branch precedes the generic settings branch. Grepped for a client-side copy of the last-admin rule (`role === "admin"` in TSX, `lastAdmin`/`adminCount`/`admins.length`/`onlyAdmin` in `src/`): **none** — the invariant lives only in `set_staff_role`.                               |
| 2026-08-02 | **The "unexpected commit" was the user's own.** `f379882 feat: implement staff roles and admin controls` is authored by `RafaelIIIPrudente <rflprdnt@gmail.com>`, 2026-08-02 14:28, and contains exactly the S1+S2 work — the user committing as agreed. The executer surfaced it rather than touching it, which is the correct behaviour under the standing rule.                                                                                                                                                                                                                                                                                 |
| 2026-08-02 | ⚠️ **The most important line in the executer's report is a limitation, not an achievement.** The four `set_staff_role` refusal tests, the `updated_at` assertion, and the advisory-lock test are **SOURCE assertions** — no Postgres runs in this suite, so they verify the shipped SQL _says_ the right thing, not that the database _does_ it. The race the advisory lock prevents cannot be tested here at all. The executer stated this at the top of `supabase/staff-roles-admin.test.ts` rather than letting green checks imply more than they prove. **Real verification requires applying the script against a database with two admins.** |
| 2026-08-02 | **Minor deviation, accepted.** `list_staff` returns `sr.created_at` (when the ROLE was assigned, NULL when unassigned) rather than the brief's `u.created_at` (when the ACCOUNT was created). Coherent with `assigned = false`, but the screen cannot show when someone joined. Not worth a re-run; noted so it is a known choice rather than a silent one.                                                                                                                                                                                                                                                                                        |
| 2026-08-02 | **Executer decisions the brief did not settle, both endorsed:** (i) `list_staff`/`set_staff_role` **raise** for a non-admin rather than returning empty, matching S2's `42501` idiom; (ii) `listStaff()` **throws** on a failed read rather than degrading to `[]` — an empty roster would read as "there are no staff accounts", which is a lie a reader cannot detect. The second is exactly this repo's four-state discipline applied to a list.                                                                                                                                                                                                |
| 2026-08-02 | Executer reports the brief arrived **garbled** (duplicated blocks, truncated lines) and was reconstructed from intact fragments plus the acceptance criteria. Not verifiable from the planner side; the delivered work matches every acceptance criterion, so the reconstruction was faithful. It also added `supabase/staff-roles-admin.test.ts`, unnamed in the reconstructed scope, because three criteria had nowhere else to live — correct call. Service named `src/services/staff.ts` rather than the brief's `staff-roles.ts`; cosmetic.                                                                                                   |
