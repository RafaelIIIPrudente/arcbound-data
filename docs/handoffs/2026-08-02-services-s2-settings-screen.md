# Handoff — Arcbound Services S2: the Settings → Services admin screen

**Date:** 2026-08-02
**Branch:** `feat--implement-RBAC`
**Shaping doc:** [`docs/decisions/2026-08-02-arcbound-services-registry.md`](../decisions/2026-08-02-arcbound-services-registry.md)
**Predecessor:** [S1 — data model](2026-08-02-services-s1-data-model.md) 🟢 landed, ⚠️ **SQL not yet applied**.
**Slice:** S2 of five.
**Status:** 🟡 emitted, not yet run.

**Planner correction carried into this brief.** The shaping doc's D2 mockup rendered
a no-pipeline Service as `— no pipeline`. That contradicts this repo's own
convention — an em dash means _couldn't read_, a known absence is stated in words.
The label is **"No data pipeline"**. The doc's preview is left as the historical
record of what was chosen; this is the corrected rendering.

---

## The prompt as issued

```
ROLE

You are a world-class TypeScript/React engineer with a specialism in destructive
admin UI. Your defining trait: you make the consequence of a control visible
BEFORE it is used, and you scale friction to blast radius. You know that a
confirmation dialog on every action trains people to click through confirmation
dialogs, so you spend that friction only where something irreversible or
far-reaching happens, and you spend it by naming real numbers rather than saying
"are you sure?".

Working style, binding:
- READ BEFORE WRITE. Verify every fact below; if one is wrong, STOP and report it.
- ⚠️ comments in this codebase are BINDING CONSTRAINTS. Never delete or weaken one.
  If your change makes one FALSE, UPDATE it to the new truth — never delete it to
  avoid the contradiction, and never shrink the change to keep the old text true.
- RED-first (superpowers:test-driven-development).
- DO NOT WIDEN SCOPE. If a change needs a file outside Scope, STOP and FLAG.
- Report honestly with real command output.

GOAL

Build `/settings/services`: the admin screen where Arcbound's services are
created, renamed, reordered, archived, restored, and — only when nothing
references them — deleted. Admin-only, a sibling of `/settings/roles`.

CONTEXT

The repo IS ArcBase: an internal, auth-gated, single-tenant Next.js app. Read
`AGENTS.md` and `CONTEXT.md` first, then
`docs/adr/0015-arcbound-services-registry.md`.

S1 built the data model and landed it inert: `public.services`,
`public.client_services`, six `SECURITY DEFINER` RPCs each guarded by
`public.is_admin()`, and the seam module `src/services/arcbound-services.ts`.
Nothing reads it yet. This slice is the first consumer, and it is admin-only.

The governing rule from ADR 0015, which decides most of the UI:

    VISIBILITY IS DATA. CAPABILITY IS CODE.

A Service's `handler` names an ingestion pipeline that exists in code
(`linkedin_post_metrics`, `outreach_prospects`) or is NULL. NULL is a real,
deliberate state — a listed offering with no pipeline — not an error and not a
missing value.

REPO FACTS YOU MUST USE (verify each):

1. ⚠️ **S1'S SQL HAS NOT BEEN APPLIED TO THE DATABASE.** Until a human pastes
   `supabase/arcbound-services.sql` into the Supabase SQL editor, every RPC this
   screen calls will fail against the live project. Your tests mock the seam, so
   the gate will be green regardless. DO NOT let a green gate imply this screen
   works, and SAY SO in your report.
2. `src/app/(app)/settings/roles/page.tsx` is your structural precedent: metadata,
   `await requireAdmin()` as the FIRST statement, then the read, then a
   presentational component. Copy its shape and its comment discipline.
3. ⚠️ `src/app/(app)/settings/roles/actions.ts` documents the guard-placement trap
   in a ⚠️ block: `requireAdmin()` denies by calling `redirect()`, WHICH DENIES BY
   THROWING. A guard inside a `try { … } catch` is swallowed, and the denial
   renders as a message reading "NEXT_REDIRECT" instead of redirecting. Every
   action you write puts `await requireAdmin()` first and OUTSIDE the try.
4. ⚠️ `src/services/staff.ts` carries the invariant-duplication rule: "THIS MODULE
   KNOWS NOTHING ABOUT THE LAST-ADMIN RULE, AND MUST NOT LEARN." The same applies
   here to `can_delete` — see Scope.
5. ⚠️ `resolvePageTitle` in `src/components/dashboard/layout/nav-config.ts`
   (~L85-92) carries a ⚠️ warning that `paths.settings.roles` must be tested
   BEFORE the generic `paths.settings.profile` rule, because `/settings/roles`
   startsWith `/settings` and "a branch placed after it never runs — dead code
   that looks alive." The file says it has flagged this three times. Your
   `/settings/services` branch has the same problem and needs the same placement.
6. `src/components/dashboard/layout/nav-config.ts` (~L39) comments that
   "`/settings/roles` (ADR 0013) is reached from inside this screen, not from its
   own nav item — it is admin-only, and the nav is not." That is about to be true
   of TWO screens. Update it; do not add a nav item.
7. `/settings` is in the sidebar (RBAC S4), so a link placed there IS reachable by
   clicking. Verified — do not re-litigate it, but do not add a sidebar item either.
8. `src/components/dashboard/settings/staff-roles-table.tsx` is the precedent for
   the connected/presentational split that keeps forms unit-testable. Follow it.

SCOPE

MODIFY — `src/paths.ts`: add `settings.services: "/settings/services"`, commented
like `settings.roles` (its own route, admin-only, and WHY it is not a tab).

CREATE — `src/app/(app)/settings/services/page.tsx` + test.
  `await requireAdmin()` first, then `listServicesAdmin()`.
  ⚠️ THE GUARD RUNS BEFORE THE READ, for the reason `roles/page.tsx` states: the
  RPC is admin-gated in SQL and must not be invoked on a denied caller's behalf.

CREATE — `src/app/(app)/settings/services/actions.ts` + test.
  `createServiceAction`, `updateServiceAction`, `setServiceStatusAction`,
  `deleteServiceAction`. `zod`-validated, `requireAdmin()` first and outside every
  `try` (fact 3), `revalidatePath(paths.settings.services)` on success.
  ⚠️ Database refusals reach the screen VERBATIM, exactly as `setStaffRoleAction`
  carries the last-admin message. Do not rewrite them into friendlier text — the
  database is the authority and its wording is the honest wording.

CREATE — `src/components/dashboard/settings/services-table.tsx` + test.

  ROW rendering:
    • name, description
    • handler label: `linkedin_post_metrics` → "Post Metrics";
      `outreach_prospects` → "Prospects"; NULL → "No data pipeline"
      ⚠️ NOT AN EM DASH. In this repo an em dash means "could not be read"; a
      known, deliberate absence is stated in words. A Service with no handler is a
      FACT ON RECORD, not an unreadable value. Comment this where the label is
      built, because the next person will want to shorten it to "—".
    • status, and `client_count` · `upload_count` from the RPC

  CREATE form: name (required), slug (required, lowercase-kebab), description
  (optional), handler select offering the two pipelines plus "No data pipeline".
    ⚠️ A HANDLER ALREADY CLAIMED BY ANOTHER SERVICE MUST BE DISABLED IN THE SELECT,
    WITH THE REASON — and the server MUST STILL REJECT IT. A disabled `<option>`
    is a hint, never a guard; the partial unique index is the guard. A `23505`
    coming back from either the slug or the handler must surface as a FIELD-LEVEL
    message naming which one collided, not a generic failure.

  ARCHIVE / RESTORE, with friction proportional to blast radius:
    • Archiving a NO-HANDLER Service: a plain confirm. Nothing breaks.
    • Archiving a CODE-BACKED Service: a typed confirmation that must match the
      Service NAME exactly, above a sentence naming the REAL counts from that row
      — e.g. "This removes the LinkedIn upload path for all 9 clients and hides
      Posts and LinkedIn Report on every client page. Existing data is untouched."
      ⚠️ THE NUMBERS COME FROM THE ROW, NEVER FROM A HARD-CODED STRING. A sentence
      that says "all clients" when it means six is the kind of lie that survives
      review because it reads fine.
      ⚠️ DO NOT PUT THE TYPED CHALLENGE ON EVERY ARCHIVE. Friction applied
      uniformly is friction ignored; people learn to type the name reflexively and
      the challenge stops carrying information.

  DELETE:
    ⚠️ ENABLED **ONLY** BY `can_delete` FROM THE RPC. DO NOT RECOMPUTE IT IN
    TYPESCRIPT — not from `client_count === 0`, not from anything else. The rule
    lives in `delete_service`'s body; this screen reports what it said. A second
    copy drifts from the first, and the copy users see is the one that drifts
    first (fact 4). When `can_delete` is false, the control is disabled and
    explains what references it, using the row's own counts.

  EMPTY vs UNAVAILABLE — ⚠️ TWO DIFFERENT STATES THAT MUST NOT COLLAPSE:
    • the read SUCCEEDED and returned no rows → "No services yet."
    • the read FAILED → "The service registry could not be read." plus the error.
    An unreadable registry rendered as an empty one invites an admin to create
    duplicates of services that already exist. S4 depends on this same distinction
    for its `/upload` fallback, so establish it correctly here.

MODIFY — `src/app/(app)/settings/page.tsx` + test: add an admin-only **Services**
link beside the existing admin-only **Staff roles** link. Do NOT guard the page
(its ⚠️ block explains why: analysts manage their own profile and password there).

MODIFY — `src/components/dashboard/layout/nav-config.ts` + test: add the
`/settings/services` branch to `resolvePageTitle` BEFORE the generic settings rule
(fact 5), and update the ~L39 comment now that two screens live inside Settings
(fact 6). Do NOT add a nav item.

DO NOT TOUCH: any SQL (S1's twins are final for this workstream —
if you believe a function is wrong, STOP AND FLAG rather than editing it),
`/upload` or anything under `src/components/dashboard/ingest/`, `client-tabs.tsx`,
any client page, `src/middleware.ts`, `src/lib/auth/*`, `staff_roles`, the
report-link functions, or the `bi.*` views.

APPROACH

1. Report real git state. HEAD is `ed817fb`; S1's work is uncommitted and is NOT
   yours. Surface, never rewrite, any commit you did not make.
2. Capture the `pnpm test` baseline count first (S1 finished at 107 files / 1,625).
3. paths → page → actions → table → settings link → nav-config.
4. Mutation-verify and report what went red:
   • Delete `requireAdmin()` from one action — a test must fail.
   • Derive the Delete control from `client_count === 0` instead of `can_delete` —
     a test must fail. (If it does NOT, your test is asserting the wrong thing:
     write one where the two disagree.)
   • Move the `/settings/services` branch AFTER the generic settings rule — a
     `resolvePageTitle` test must fail.
   • Render the "read failed" state with the same copy as "no rows" — a test must
     fail.

ACCEPTANCE CRITERIA

- `/settings/services` is admin-only, guarded before the read, and linked from
  `/settings` for admins only.
- `/settings` remains UNGUARDED and an analyst can still reach their own profile.
- The Delete control is driven solely by `can_delete`; no TypeScript re-derives it.
- A code-backed Service requires a typed name match to archive, with counts read
  from the row; a no-pipeline Service does not.
- "No services yet" and "registry could not be read" render differently, tested.
- A NULL handler renders as "No data pipeline" — no em dash anywhere in that path.
- `resolvePageTitle` returns a Services title, proven by a test that fails if the
  branch is moved after the generic rule.
- Gate green; test count strictly up; no existing assertion weakened or deleted.

VERIFICATION

Run and paste real output:

    pnpm lint && pnpm type:check && pnpm test && pnpm build

Verification is the automated gate plus unit/component tests ONLY. DO NOT use
Claude-in-Chrome, a dev server, or any live-browser runtime walk.

⚠️ **THE SCREEN CANNOT WORK UNTIL S1'S SQL IS APPLIED** (fact 1). Your tests mock
the seam and will pass either way. State this plainly in your report.

GUARDRAILS

- DO NOT APPLY OR EDIT SQL. No `db push`, no CLI, no database connection.
- LEAVE ALL WORK UNCOMMITTED. No commit, push, branch, tag, or PR. Never commit
  to `main`.
- DO NOT run `graphify update`.
- If you cannot satisfy an acceptance criterion, DO NOT silently drop it. Finish
  everything else and report exactly what is undone and why.

REPORT BACK

1. Git state at start and end.
2. `git diff --stat` plus new files.
3. Baseline and final test counts.
4. Full gate output.
5. The archive-confirmation copy for a code-backed Service, verbatim, so it can be
   checked that the numbers come from the row.
6. The exact line where the Delete control decides to be enabled, so the absence
   of a duplicated invariant can be checked by eye.
7. What the four mutation checks broke, and that you restored them.
8. FLAGS: anything in this brief wrong about the repo, anything you decided that
   it did not settle, and an explicit statement that the screen is unverified
   against a real database.
```

---

## Feedback & revisions log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-02 | Emitted. Not yet run by an executer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-02 | 🟢 **LANDED, planner-verified.** `pnpm test` → **110 files / 1,667 tests, exit 0** (baseline 107 / 1,625). Re-checked by hand: `services-table.tsx:71` is `const canDelete = service.canDelete;` with every other `clientCount` use being display copy; `resolvePageTitle`'s services branch sits above the generic `/settings` rule; `pipelineLabel` returns "No data pipeline" with the ⚠️ intact. The only em dash in JSX is the `— ADD A SERVICE` eyebrow, matching the `— MENU` / `— INGESTION` design language, not a data value. |
| 2026-08-02 | **The executer's catch placement is better than the brief specified and should be the pattern for S4.** `listServicesAdmin()` throws by design, which would reach the error boundary and blank the page — destroying the empty-vs-unreadable distinction the slice exists to draw. The page catches it _after_ `requireAdmin()`, never around it, with a ⚠️ explaining that a guard inside the try would render a denied analyst a page instead of redirecting them.                                                                    |
| 2026-08-02 | Three executer calls kept: the typed-name confirmation is **client-side only** (friction is anti-accident, not anti-attack; `is_admin()` is the boundary and archiving is reversible — a server-side copy would be a second implementation of a UI rule); `HANDLER_LABELS` is a `Record<ServiceHandler, string>`, **exhaustive by construction**, so adding a handler without a label is a type error; the ⚠️ ordering comment now reads "FOURTH time" and generalises to _every_ future nested settings route.                         |
| 2026-08-02 | ⚠️ **Second executer in this repo to report the brief "arriving garbled"** (RBAC S3 reported the same). Not verifiable from the planner side; everything in Scope was delivered both times, so nothing was lost. Recorded as a transport observation, not a defect.                                                                                                                                                                                                                                                                     |
