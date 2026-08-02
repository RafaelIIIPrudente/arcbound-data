# Handoff — RBAC S1: role foundation (inert)

**Date:** 2026-08-02
**Branch:** `feat--implement-RBAC`
**Shaping doc:** [`docs/decisions/2026-08-02-rbac-admin-and-data-analyst.md`](../decisions/2026-08-02-rbac-admin-and-data-analyst.md)
**Slice:** 1 of 3 — S2 (enforcement) and S3 (roles admin screen) are authored after this lands.
**Status:** 🟢 **LANDED, planner-verified.** Uncommitted on `feat--implement-RBAC` at `7d222f1`.

This file records the executer prompt verbatim. Feedback and revisions go in the
log at the bottom; the prompt itself is updated in place if it is re-issued.

---

## The prompt as issued

````
ROLE

You are a world-class TypeScript/React engineer and Postgres/Supabase security
practitioner. Your defining trait for this task: you treat an authorization
primitive as something that must FAIL CLOSED under every failure mode you did not
anticipate — a dropped network call, a missing row, an unconfigured backend, a
cache with the wrong scope. You know that "the query errored so we returned the
permissive default" is not a bug report, it is a breach. You also know the
difference between a privilege boundary and a UI affordance, and you never let the
second masquerade as the first.

Working style, binding:
- READ BEFORE WRITE. Every file named below exists (except the ones marked NEW);
  read it before changing it. Verify the repo facts in this brief rather than
  trusting them — if one is wrong, STOP and report it.
- ⚠️ comments in this codebase are BINDING CONSTRAINTS, not decoration. Read them.
  Do not delete or weaken one to make a change fit.
- RED-first (superpowers:test-driven-development) for the helper module: failing
  test, watch it fail for the right reason, then implement.
- DO NOT WIDEN SCOPE. If a change seems to need a file outside the Scope section,
  STOP and FLAG it rather than doing it.
- Report honestly with real command output. If something does not pass, say so and
  paste what you actually saw.

GOAL

Introduce ArcBase's staff-role concept — `admin` and `analyst` — as a fully tested
foundation that CHANGES NO BEHAVIOUR. After this slice the app renders and behaves
exactly as it does today: nothing is hidden, nothing is blocked, no route is
guarded. What exists afterwards is the role table, the SQL helper, the typed read
path, and the decision record — ready for slice S2 to enforce against.

This slice is deliberately INERT. If a user notices any difference, something is
wrong.

CONTEXT

The repo IS ArcBase: an internal, auth-gated, single-tenant Next.js app for
Arcbound staff. Read `AGENTS.md` (stack and architecture rules — follow them, do
not restate them) and `CONTEXT.md` (domain vocabulary) before starting.

Authorization today is a single boolean. `routeAccess(pathname, isAuthed)` in
`src/lib/route-access.ts` is pure and edge-safe, called once from
`src/middleware.ts`. `ADR 0007` (`docs/adr/0007-arcbase-single-tenant.md`) states
verbatim: "Authorization collapses to authenticated vs. not... There are no in-app
role tiers in v1." THIS SLICE AMENDS THAT ADR. `ADR 0011` (Report Links) is the
precedent for narrowing 0007 — follow its shape.

Repo facts you must use (verify each; do not trust blindly):

1. `src/lib/auth/session.ts` exports `getSession()` — a React `cache()`-memoised
   read of the Supabase user. It reads Supabase DIRECTLY via
   `createClient(cookies())` from `@/lib/supabase/server`, NOT through the
   `src/services/*` seam. Auth/identity is an established exception to the seam
   rule in AGENTS.md; your new module follows session.ts, not the seam.
2. `src/lib/auth/session.test.ts` contains a SOURCE GUARD asserting the module uses
   React `cache()` and never `unstable_cache`/`revalidate`, plus "guard the guard"
   tests proving the guard is not vacuous. Your new module needs the same guard,
   for the same reason — a cross-request cache here would serve one user's ROLE to
   every visitor, which is privilege escalation, not a stale-cache annoyance.
3. `src/config.ts` exports `authDisabled = !isSupabaseConfigured && NODE_ENV !==
   "production"`. It is FALSE in every production build by construction.
4. EVERY SCHEMA CHANGE IN THIS REPO IS TWO FILES: a paste-into-the-SQL-editor
   script at `supabase/<name>.sql` and a CLI twin at
   `supabase/migrations/<timestamp>_<name>.sql`. `supabase/sql-sync.test.ts` holds
   them byte-identical after stripping comments and blank lines, via its `PAIRS`
   array. A single-file migration FAILS THE GATE. Read that test before writing SQL.
5. Latest existing migration timestamp is `20260727140000`. Yours must sort after it.
6. `auth.users` is NOT readable by the `authenticated` role. Do not write anything
   that assumes it is.
7. There is NO service-role key in this repo (`src/env.server.ts` holds exactly one
   server secret, `REPORT_LINK_SIGNING_SECRET`). Do not introduce one.

DESIGN DECISIONS THIS SLICE IMPLEMENTS (settled — do not relitigate)

- Two roles: `admin` and `analyst`. Display strings "Admin" and "Data Analyst".
- Role lives in `public.staff_roles`, NOT in `user_metadata` (user-writable via
  `auth.updateUser()` — an analyst could promote themselves) and NOT in a JWT claim
  (writing it would require a service-role key).
- ABSENCE OF A ROW MEANS `analyst`. Least privilege. The same migration seeds the
  known admin(s), so there is never a window in which the app has zero admins.
- `staff_roles` is OWN-ROW-READABLE ONLY. An analyst can read their own role and
  nothing else; the staff roster is not exposed to `authenticated` at large. S3's
  admin screen will read the full list through a `SECURITY DEFINER` function.
- In auth-disabled dev mode the role is `admin`, so the app stays browsable without
  a Supabase project. Safe because `authDisabled` is false in production (fact 3).
- ANY FAILURE TO DETERMINE THE ROLE RESOLVES TO `analyst`. Never to `admin`.

SCOPE

CREATE:
- `supabase/staff-roles.sql` — the paste script.
- `supabase/migrations/20260802120000_staff_roles.sql` — its byte-identical twin
  (comments may differ; executable SQL may not).
- `src/lib/auth/roles.ts` — the typed read path.
- `src/lib/auth/roles.test.ts` — behaviour + source guard.
- `docs/adr/0013-arcbase-staff-roles.md` — the ADR.

MODIFY:
- `supabase/sql-sync.test.ts` — register the new pair in `PAIRS`.
- `CONTEXT.md` — add the domain vocabulary (below).
- `AGENTS.md` — its "Auth is Supabase-only" bullet currently says "authorization is
  authenticated-vs-not"; that sentence becomes false with this ADR. Correct it and
  point at ADR 0013.

DO NOT TOUCH: `src/middleware.ts`, `src/lib/route-access.ts`, `src/paths.ts`, any
nav config, any component, any page, any server action, any existing migration or
SQL script, any existing RPC, `public.clients` policies. Those are S2 and S3. If
you believe one is needed, STOP AND FLAG.

APPROACH

1. Report the real git state first (`git status`, `git log --oneline -3`,
   `git branch --show-current`). Whatever is already there is NOT yours — build
   additively. If you find a commit you did not make, SURFACE IT; never rewrite or
   "clean up" history.
2. Capture the test-count baseline: run `pnpm test` BEFORE writing anything and
   record the number. Report baseline and final counts at the end.
3. Write the SQL pair. Shape:

   - Table:
     ```sql
     create table if not exists public.staff_roles (
       user_id    uuid primary key references auth.users(id) on delete cascade,
       role       text not null check (role in ('admin','analyst')),
       created_at timestamptz not null default now(),
       updated_at timestamptz not null default now()
     );
     ```
     Use a CHECK constraint, not a Postgres enum — a future third role should be a
     one-line change, not a type migration.

   - RLS, own-row select only, no write policies at all (writes arrive in S3 via
     `SECURITY DEFINER`, whose owner bypasses RLS):
     ```sql
     alter table public.staff_roles enable row level security;
     drop policy if exists staff_roles_select_own on public.staff_roles;
     create policy staff_roles_select_own on public.staff_roles
       for select to authenticated using (user_id = auth.uid());
     ```

   - The SQL helper S2 and S3 will consult from inside policies and function
     bodies:
     ```sql
     create or replace function public.is_admin()
     returns boolean
     language sql
     stable
     security definer
     set search_path = public
     as $$
       select exists (
         select 1 from public.staff_roles
         where user_id = auth.uid() and role = 'admin'
       );
     $$;
     revoke all on function public.is_admin() from public;
     grant execute on function public.is_admin() to authenticated;
     ```
     ⚠️ Note in a comment WHY the `staff_roles` select policy above does not call
     `is_admin()`: a policy that consulted it would recurse into the very table the
     policy guards. The own-row predicate keeps that impossible.

   - An idempotent admin seed, with the address list clearly marked as the thing
     staff edit at apply time:
     ```sql
     insert into public.staff_roles (user_id, role)
     select id, 'admin' from auth.users
     where email in ('bryan@arcbound.com')
     on conflict (user_id) do update set role = 'admin', updated_at = now();
     ```
     ⚠️ Comment that this list must be edited in BOTH files or `sql-sync.test.ts`
     will fail — the twins are compared on executable SQL.

4. Write `src/lib/auth/roles.ts`, RED-first. Contract:

   ```ts
   export type StaffRole = "admin" | "analyst";

   /** The current user's role; `null` when there is no authenticated user. */
   export const getRole: () => Promise<StaffRole | null>;

   /** True only for an authenticated admin. */
   export function isAdmin(role: StaffRole | null): boolean;

   /**
    * Redirects to `paths.home` unless the caller is an admin.
    * ⚠️ DELIBERATELY UNCALLED IN THIS SLICE — S2 wires it into the guarded
    * routes and actions. It is built and tested here so S2 turns the boundary on
    * against a primitive that is already proven, not one written under pressure.
    */
   export async function requireAdmin(): Promise<void>;
   ```

   Resolution order inside `getRole`, in exactly this order:
   - `authDisabled` → `"admin"`, WITHOUT touching Supabase.
   - no `getSession()` user → `null`.
   - own row found with `role = 'admin'` → `"admin"`.
   - own row found with any other value, or NO ROW → `"analyst"`.
   - THE QUERY THREW OR RETURNED AN ERROR → `"analyst"`. Fail closed. A layout will
     call this; a throw would blank the shell, and a permissive default would hand
     out admin on a network blip.

   Memoise with React `cache()` from `react`, mirroring `session.ts`, and carry an
   equivalent ⚠️ block explaining that the scope is the security property.
   Use `.maybeSingle()` so a missing row is an absence, not an error.

5. Write `src/lib/auth/roles.test.ts`. Cover, at minimum:
   - auth-disabled → `"admin"` and the Supabase client is never constructed
     (assert a call counter stays at 0, the way session.test.ts does).
   - no user → `null`.
   - row `admin` → `"admin"`; row `analyst` → `"analyst"`; NO row → `"analyst"`.
   - query error AND thrown exception → `"analyst"` (two separate tests; this is
     the assertion that matters most in the file).
   - `requireAdmin()` redirects for `null` and for `"analyst"`, and does not for
     `"admin"`. Mock `next/navigation`.
   - The SOURCE GUARD: `roles.ts` imports `cache` from `react` and contains neither
     `unstable_cache` nor `revalidate`. Include the "guard the guard" tests from
     `session.test.ts` — strip comments before matching (the ⚠️ block will name
     `unstable_cache` in order to forbid it, and a raw-text match would flag the
     warning itself as the violation), then assert the stripped source still
     contains real code.
   Mutation-verify at least the fail-closed tests: break the implementation
   deliberately, confirm the test goes red, restore it.

6. Write `docs/adr/0013-arcbase-staff-roles.md`, matching the house format
   (`# 13. <title>`, Date, Status, Context, Decision, Consequences). It must:
   - State that it AMENDS ADR 0007, narrowing "there are no in-app role tiers"
     exactly as ADR 0011 narrowed the same ADR for Report Links. Reference both.
   - Record WHY `user_metadata` was rejected (self-promotion) and why a JWT claim
     was rejected (needs a service-role key; stale until refresh).
   - Record the accepted costs honestly: Add Client becomes admin-only, so an
     analyst with data for a brand-new client waits on an admin; and S3 will add a
     staff-enumeration capability that does not exist today.
   - State plainly that a role is NOT a tenant. ADR 0007's single-tenant decision
     STANDS — all staff still share one dataset. This adds privilege tiers, not
     data partitions.

7. Add to `CONTEXT.md`, in its existing style:
   - **Staff Role** — the privilege tier attached to an Arcbound staff Supabase
     account. Two values: Admin and Data Analyst. A Staff Role is NOT a tenant
     (ADR 0007 stands — all staff share one dataset), NOT a Client (that is the
     LinkedIn profile being tracked), and NOT the Report Link read grant (ADR 0011),
     which is not a user account at all.
   - **Admin** — a Staff Role that adds the governance surface: registering a
     Client, issuing/rotating/revoking a Report Link, and assigning Staff Roles.
   - **Data Analyst** — a Staff Role that uploads data and reads everything. The
     default: a staff account with no assigned role is a Data Analyst.

ACCEPTANCE CRITERIA

- `supabase/staff-roles.sql` and its migration twin exist, are registered in
  `PAIRS`, and `sql-sync.test.ts` passes.
- `public.staff_roles` has RLS enabled with EXACTLY ONE policy (own-row select) and
  no insert/update/delete policy.
- `is_admin()` is `stable`, `security definer`, `set search_path = public`, revoked
  from `public`, granted to `authenticated`.
- `getRole()` returns `"analyst"` — never `"admin"` — for every failure path.
- The source guard in `roles.test.ts` fails if `cache` is swapped for
  `unstable_cache`. Prove it by making that swap, watching it go red, reverting.
- ADR 0013 exists and explicitly amends ADR 0007.
- `CONTEXT.md` and `AGENTS.md` are updated as above.
- BEHAVIOUR IS UNCHANGED. No component, page, action, route, nav item, or
  middleware file is modified. `git diff --stat` shows only the files in Scope.
- Gate is green; test count is strictly UP from the baseline you captured; no
  existing assertion is weakened or deleted.

VERIFICATION

Run, and paste the real output:

    pnpm lint && pnpm type:check && pnpm test && pnpm build

Verification is the automated gate plus unit tests ONLY. DO NOT use
Claude-in-Chrome, a dev server, or any live-browser runtime walk.

GUARDRAILS

- DO NOT APPLY THE SQL. Do not run `supabase db push`, do not connect to the
  database, do not execute the migration. Staff apply it by pasting
  `supabase/staff-roles.sql` into the Supabase SQL editor. Your job ends at
  authoring the files.
- LEAVE ALL WORK UNCOMMITTED on `feat--implement-RBAC`. Do not commit, push,
  branch, tag, or open a PR. Never commit to `main`.
- DO NOT run `graphify update`. The knowledge graph is rebuilt once at the end of
  the workstream, not per slice; running it now adds thousands of lines of churn to
  a diff the user is about to review by hand.
- Conventional Commits apply if the user later asks you to commit — not now.
- If you cannot satisfy an acceptance criterion, DO NOT quietly drop it. Finish
  everything else and report exactly what you left undone and why.

REPORT BACK

1. Git state at start and at end (`git status --short`, `git branch --show-current`).
2. Files created/modified, with `git diff --stat`.
3. Baseline and final test counts.
4. Full gate output.
5. The exact `getRole()` resolution order as implemented, so it can be checked
   against the contract above.
6. Confirmation that the mutation checks were run (source guard, fail-closed) and
   what went red.
7. FLAGS: anything in this brief that turned out to be wrong about the repo,
   anything you had to decide that the brief did not settle, and anything you
   believe S2 must know.
````

---

## Feedback & revisions log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-02 | Emitted. Not yet run by an executer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-02 | **Landed and planner-verified.** Independently re-checked, not accepted on report: `git diff --stat` shows only the eight scoped files and no commits; `pnpm test` re-run → **97 files / 1,480 tests passing, exit 0** (baseline 96/1,460); the SQL twins diff clean on executable SQL (comments stripped); the `PAIRS` entry is registered; `roles.ts` matches the published contract branch-for-branch; ADR 0013 opens `Accepted. **Amends ADR 0007**`.                                                                                                                                                                                                                                   |
| 2026-08-02 | **Brief correction — the recursion rationale in step 3 was imprecise.** It claimed a policy on `staff_roles` calling `is_admin()` "would recurse". As specified, `is_admin()` is `SECURITY DEFINER`, so its owner bypasses RLS and there would be no recursion _today_. 42P17 bites only if the helper later becomes invoker-rights or the table gains `force row level security`. The executer wrote the accurate version instead of copying the brief — the own-row predicate cannot recurse _however `is_admin()` is later redefined_ — which is the stronger guarantee. **Corollary for S2: calling `is_admin()` from policies on OTHER tables is correct and is exactly its purpose.** |
