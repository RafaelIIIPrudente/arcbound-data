# Handoff — RBAC S2: turn the boundary on

**Date:** 2026-08-02
**Branch:** `feat--implement-RBAC`
**Shaping doc:** [`docs/decisions/2026-08-02-rbac-admin-and-data-analyst.md`](../decisions/2026-08-02-rbac-admin-and-data-analyst.md)
**Predecessor:** [S1 — role foundation](2026-08-02-rbac-s1-role-foundation.md) 🟢 landed, uncommitted.
**Slice:** 2 of 3. S3 (roles admin screen) is authored after this lands.
**Status:** 🟡 emitted, not yet run.

Live-DB facts this brief was written against (read from the production project on
2026-08-02, not assumed):

- `public.staff_roles` contains exactly one row: `rflprdnt@gmail.com | admin`.
- `public.clients` has two policies, both `{authenticated}`:
  `arcbase read clients` (SELECT, `qual = true`) and
  `arcbase add clients` (INSERT, `with_check = true`). **The names contain spaces.**
- `bryan@arcbound.com` does not exist in `auth.users`.

---

## The prompt as issued

```
ROLE

You are a world-class TypeScript/React engineer and Postgres/Supabase security
practitioner. Your defining trait for this task: you know the difference between
hiding a control and removing a capability, and you refuse to let the first be
mistaken for the second. You enforce at every layer that can be reached
independently, and you treat "the UI does not show it" as worth exactly nothing
against a caller holding their own token.

You are also careful with `create or replace`: you know it replaces a function
WHOLE, so a body retyped from memory silently ships a different function than the
one that was reviewed.

Working style, binding:
- READ BEFORE WRITE. Verify every repo fact below rather than trusting it; if one
  is wrong, STOP and report it.
- ⚠️ comments in this codebase are BINDING CONSTRAINTS. Do not delete or weaken one
  to make a change fit.
- RED-first (superpowers:test-driven-development).
- DO NOT WIDEN SCOPE. If a change seems to need a file outside Scope, STOP and FLAG.
- Report honestly with real command output.

GOAL

Turn the admin/analyst boundary ON. After this slice, a Data Analyst cannot register
a Client, and cannot issue, rotate, or revoke a Report Link — not through the UI,
not through a Server Action, and not by calling Supabase directly with their own
token. An Admin's experience is unchanged.

An analyst STILL READS EVERYTHING. This slice removes action affordances, never
information. An analyst must still see that a Client has an active Report Link and
when it was issued — only the buttons that change it disappear.

CONTEXT

The repo IS ArcBase: an internal, auth-gated, single-tenant Next.js app for Arcbound
staff. Read `AGENTS.md` (stack and architecture rules — follow, do not restate) and
`CONTEXT.md` (domain vocabulary) first. `docs/adr/0013-arcbase-staff-roles.md`
records this design and amends ADR 0007.

Slice S1 already landed (uncommitted, same branch) and gives you:
- `public.staff_roles` (own-row-readable) and `public.is_admin()` — a `stable`,
  `security definer`, `set search_path = public` function, granted to
  `authenticated`, returning true only for a caller with an admin row.
- `src/lib/auth/roles.ts` exporting `StaffRole`, `getRole()`, `isAdmin(role)`, and
  `requireAdmin()`. `requireAdmin()` redirects to `paths.home` for anyone who is not
  an admin. It is currently CALLED FROM NOWHERE — wiring it up is your job.
- `getRole()` fails closed: every unknown resolves to `analyst`, never `admin`.

LIVE DATABASE FACTS (read from production on 2026-08-02 — verify the shape in the
committed SQL, but do not re-query the database yourself):

- `public.clients` has exactly two policies, both for `{authenticated}`:
  `arcbase read clients` (SELECT, `qual = true`) and `arcbase add clients`
  (INSERT, `with_check = true`). ⚠️ THE POLICY NAMES CONTAIN SPACES — every DDL
  statement referencing them MUST double-quote the name.
- `public.clients` has NO migration in this repo; it was created out-of-band. You
  are altering an existing policy, never creating or dropping the table.
- `public.staff_roles` currently holds ONE row: `rflprdnt@gmail.com | admin`.

REPO FACTS YOU MUST USE (verify each):

1. EVERY SCHEMA CHANGE IS TWO FILES: a paste script `supabase/<name>.sql` and a CLI
   twin `supabase/migrations/<timestamp>_<name>.sql`, held identical on executable
   SQL by `supabase/sql-sync.test.ts` via its `PAIRS` array. Read that test.
2. The three functions you must guard live in `supabase/report-links.sql`:
   `issue_report_link` (~L233-269), `rotate_report_link` (~L274-308),
   `revoke_report_link` (~L317-334). Its migration twin is
   `supabase/migrations/20260725120000_report_links.sql`.
3. ⚠️ THE SAME FILE ALSO CONTAINS `resolve_report_link` AND `report_link_read`.
   DO NOT GUARD THOSE. They are the ANONYMOUS client-facing path behind
   `/r/[token]` — the Client holding a URL and an Access Code is NOT a staff user
   and has no role at all (ADR 0011). Adding an admin check to either one breaks
   the public report for every client. This is the single most dangerous mistake
   available in this slice.
4. Server Actions to guard:
   - `src/app/(app)/clients/[id]/report-link-actions.ts` — `createReportLinkAction`,
     `rotateReportLinkAction`, `revokeReportLinkAction`.
   - `src/app/(app)/clients/actions.ts` — `createClientAction`.
5. UI call sites:
   - `src/app/(app)/clients/page.tsx:42` renders `<AddClientDialog />`
     (`src/components/dashboard/client/add-client-dialog.tsx`, `"use client"`, no props).
   - `src/app/(app)/clients/[id]/page.tsx:191` renders
     `<ReportLinkCard clientId={client.id} status={reportLink} />`
     (`src/components/dashboard/client/report-link-card.tsx`, `"use client"`, which
     also exports the presentational `ReportLinkCardView` — already extracted and
     tested by `report-link-card.test.tsx` via a shared `baseProps` object).
   Both pages are Server Components and can call `getRole()` directly.

SCOPE

MODIFY — SQL (three separate concerns, all through the twin convention):

(a) `supabase/report-links.sql` AND `supabase/migrations/20260725120000_report_links.sql`
    — EDIT IN PLACE. Add the admin guard to the three functions named in fact 2.

    ⚠️ WHY IN PLACE RATHER THAN A NEW FILE, AND THIS IS NOT NEGOTIABLE. A new file
    containing `create or replace function public.issue_report_link…` would leave
    `report-links.sql` holding a STALE, UNGUARDED definition of the same function.
    Applied in the wrong order on a fresh project, the stale file wins and SILENTLY
    REMOVES THE GUARD — a security regression no test in this repo would catch.
    Editing in place keeps exactly one definition per function, always current, and
    makes apply order irrelevant. Record that reasoning in a comment.

    Preserve each body BYTE-FOR-BYTE and insert only:

        if not public.is_admin() then
          raise exception 'admin role required' using errcode = '42501';
        end if;

    Place it as the first statement of the function body. These are `plpgsql`
    functions — confirm that before assuming where the body starts.

(b) NEW pair: `supabase/staff-roles-enforce.sql` +
    `supabase/migrations/20260802130000_staff_roles_enforce.sql`, registered in
    `PAIRS`. Contents: the `clients` INSERT policy alter, and nothing else.

        alter policy "arcbase add clients" on public.clients
          with check (public.is_admin());

    Leave `"arcbase read clients"` UNTOUCHED — analysts read everything.

(c) `supabase/staff-roles.sql` AND `supabase/migrations/20260802120000_staff_roles.sql`
    — EDIT IN PLACE: change the seed's email list from `'bryan@arcbound.com'` to
    `'rflprdnt@gmail.com'`. The committed value currently matches NO account, so a
    fresh clone applying it would create a database with zero admins. Change it in
    BOTH files or `sql-sync.test.ts` turns red.

MODIFY — app:
- `src/app/(app)/clients/[id]/report-link-actions.ts` — `await requireAdmin()` as the
  first statement of all three actions.
- `src/app/(app)/clients/actions.ts` — same, in `createClientAction`.
- `src/app/(app)/clients/page.tsx` — read the role; render `<AddClientDialog />` only
  for an admin. The whole affordance disappears; no disabled shell, no tooltip.
- `src/app/(app)/clients/[id]/page.tsx` — pass the admin flag into `<ReportLinkCard>`.
- `src/components/dashboard/client/report-link-card.tsx` — `ReportLinkCard` and
  `ReportLinkCardView` take a REQUIRED `isAdmin: boolean` prop (required, NOT
  defaulted, so TypeScript forces every call site to state its answer). When false:
  render the status exactly as today and render NONE of the issue/rotate/revoke
  controls.

MODIFY — tests: `report-link-actions.test.ts`, `report-link-card.test.tsx`, plus new
coverage per below.

DO NOT TOUCH: `src/middleware.ts`, `src/lib/route-access.ts`, `src/lib/auth/*`
(S1 is done), `resolve_report_link`, `report_link_read`, `src/app/r/[token]/*`,
the print report, the Outreach path, ingestion, or any analytics service. S3's roles
screen is NOT in this slice. If you believe one is needed, STOP AND FLAG.

APPROACH

1. Report real git state first (`git status --short`, `git branch --show-current`,
   `git log --oneline -3`). S1's files are already there, uncommitted — they are NOT
   yours; build additively. Surface, never rewrite, any commit you did not make.
2. Capture the `pnpm test` baseline count BEFORE writing anything.
3. SQL first. After editing the report-links twins, PROVE the bodies did not drift:
   run a diff of the old and new function definitions and paste it in your report.
   The ONLY difference may be the inserted guard block. This is an acceptance
   criterion, not a suggestion.
4. Then the Server Action guards, RED-first. `requireAdmin()` redirects rather than
   returning an error state — that is deliberate and consistent with S1's contract;
   do not invent a new error shape.
5. Then the UI. For `report-link-card.test.tsx`, add `isAdmin: true` to the existing
   shared `baseProps` so current tests keep asserting what they already assert, and
   add NEW tests passing `isAdmin={false}`.
6. Mutation-verify the two assertions that matter most: (i) delete a
   `requireAdmin()` call and confirm a test goes red; (ii) make the analyst branch
   render the controls and confirm a test goes red. Restore afterwards.

ACCEPTANCE CRITERIA

- All three of `issue_report_link`, `rotate_report_link`, `revoke_report_link` raise
  on a non-admin caller; their bodies are otherwise byte-identical to before, proven
  by the diff you paste.
- `resolve_report_link` and `report_link_read` are COMPLETELY UNCHANGED. State this
  explicitly in your report.
- `"arcbase add clients"` has `with_check = public.is_admin()`; `"arcbase read
  clients"` is unchanged.
- Both seed files name `rflprdnt@gmail.com`; `sql-sync.test.ts` passes for all pairs.
- All four Server Actions refuse a non-admin BEFORE performing any work — assert the
  service function was never called, not merely that the action returned.
- A test proves an analyst viewing a Client with an active Report Link STILL SEES
  the link's status, and does NOT see the issue/rotate/revoke controls. Both halves
  in the same test, because the point is that reading survives.
- `isAdmin` is a required prop with no default on both card components.
- Gate green; test count strictly up; no existing assertion weakened or deleted.

VERIFICATION

Run and paste the real output:

    pnpm lint && pnpm type:check && pnpm test && pnpm build

Verification is the automated gate plus unit/component tests ONLY. DO NOT use
Claude-in-Chrome, a dev server, or any live-browser runtime walk.

⚠️ Be precise about what you have and have not shown. The live project contains
exactly ONE account, and it is the admin — so the analyst path CANNOT be
demonstrated against real data by anyone. Your tests are the only evidence. Do not
write "verified" where "covered by tests" is what is true.

GUARDRAILS

- DO NOT APPLY THE SQL. No `supabase db push`, no database connection, no execution.
  Staff paste the scripts into the Supabase SQL editor. Authoring the files is where
  your job ends.
- LEAVE ALL WORK UNCOMMITTED on `feat--implement-RBAC`. Do not commit, push, branch,
  tag, or open a PR. Never commit to `main`.
- DO NOT run `graphify update`. The graph is rebuilt once at the end of the
  workstream; running it now floods a diff the user reviews by hand.
- If you cannot satisfy an acceptance criterion, DO NOT silently drop it. Finish
  everything else and report exactly what is undone and why.

REPORT BACK

1. Git state at start and end.
2. `git diff --stat` plus new files.
3. Baseline and final test counts.
4. Full gate output.
5. THE FUNCTION-BODY DIFF proving only the guard was added to the three functions.
6. Explicit confirmation that `resolve_report_link` and `report_link_read` are
   untouched.
7. What the mutation checks broke, and that you restored them.
8. FLAGS: anything in this brief that turned out wrong about the repo, anything you
   decided that it did not settle, and anything S3 must know.
```

---

## Feedback & revisions log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-02 | Emitted. Not yet run by an executer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-08-02 | **Code landed, planner-verified.** Re-checked independently: no commits, branch `feat--implement-RBAC` at `7d222f1`; `pnpm test` → **98 files / 1,495 tests, exit 0** (baseline 97 / 1,480); the guard appears exactly **3×** in each report-links twin; `alter policy "arcbase add clients"` present with `"arcbase read clients"` explicitly untouched; both S1 seed twins now read `rflprdnt@gmail.com`; `await requireAdmin()` is the first statement and sits **outside** the `try` in all three report-link actions and in `createClientAction`.                                                                                                                                                                                                                   |
| 2026-08-02 | **Brief gap the executer caught, and it mattered.** All three report-link actions wrap their body in `try { … } catch { return errorState(err) }`. `requireAdmin()` denies by calling `redirect()`, which denies **by throwing** — so placing the guard inside that `try` would have swallowed `NEXT_REDIRECT`, converted a denial into a generic error state, and left the user unredirected. The brief did not mention it. Guard placed before the `try`, with a per-action test asserting the throw escapes. **S3 must apply the same rule to any guarded action that catches broadly.**                                                                                                                                                                              |
| 2026-08-02 | **Executer flag partly mistaken (recorded for accuracy).** The report says the brief named `issueReportLinkAction`; it did not — the brief names `createReportLinkAction`. No impact: the correct action was guarded either way.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-02 | **Documentation defect found.** `supabase/INGEST-WRITE-APPLY.md:38-43` documents `clients_select_authenticated` / `clients_insert_authenticated` on `public.clients`. **Production actually has `arcbase read clients` / `arcbase add clients`** (read from `pg_policies`, 2026-08-02). The runbook is stale relative to the live database. The live names were used. The runbook should be corrected so the next person reading it is not misled.                                                                                                                                                                                                                                                                                                                       |
| 2026-08-02 | ⚠️ **APPLY STATUS UNRESOLVED.** The executer reports "SQL was not applied — no db push, no DB connection." A trailing block in the same message claims the database side is "fully applied and verified" with a `pg_proc` guard table. These are contradictory and the second was not produced by this planner. **Not recorded as applied.** Awaiting the user's confirmation.                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-02 | ✅ **RESOLVED — the contradiction was two actors, not a conflict.** The executer did not apply the SQL; the **user applied it afterwards**. Both statements were true about different parties.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-02 | 🟢 **APPLIED AND LIVE-VERIFIED against production.** Two `pg_catalog` reads confirm it: `pg_policies` → `arcbase add clients` has `with_check = is_admin()`, `arcbase read clients` has `with_check = NULL` (untouched, so analysts still read every Client). `pg_proc` → `issue_report_link` **true**, `rotate_report_link` **true**, `revoke_report_link` **true**, `report_link_read` **false**, `resolve_report_link` **false**. The anonymous `/r/<token>` path is intact — the failure the brief named as the most dangerous in this slice did not occur. Note for future checks: the Supabase SQL editor renders only the **last** statement's result set, so multi-statement verification silently hides earlier output; run verification queries one at a time. |
