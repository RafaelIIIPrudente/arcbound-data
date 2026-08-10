# Handoff — RBAC S5: invite staff from the roles screen

**Date:** 2026-08-02
**Branch:** `feat--implement-RBAC`
**Shaping doc:** [`docs/decisions/2026-08-02-rbac-admin-and-data-analyst.md`](../decisions/2026-08-02-rbac-admin-and-data-analyst.md)
**Predecessors:** S1 · S2 · S3 · S4 — all landed, all SQL applied and live-verified.
**Status:** 🟡 emitted, not yet run.

**Why this exists.** ArcBase has no signup by design (ADR 0007). Onboarding means
opening the Supabase dashboard. The user asked for an in-app invite.

**The constraint that shaped it.** Inviting requires `auth.admin.inviteUserByEmail`,
which needs the **service-role key** — a credential that bypasses ALL RLS on ALL
tables, including `outreach_prospects` (third-party PII, walled off by ADR 0012).
ArcBase currently holds **zero** such keys. There is no SQL alternative: invites are
a GoTrue operation that creates the user _and_ sends the email; hand-inserting into
`auth.users` does neither properly.

**User's calls (2026-08-02):**

- **Edge Function holds the key**, in Supabase's own secrets — never in the repo,
  the Next runtime, or Vercel. If ArcBase leaks, the key does not.
- **The admin picks the role while inviting** (one step, not invite-then-promote).

**Planner calls, stated not asked:** pending invites appear in the roster marked
pending (absence is a distinct fact — the LEFT JOIN reasoning); this gets **ADR
0014** (new deployment surface + secret custody is exactly the decision that looks
arbitrary later without its reasoning).

---

## The prompt as issued

```
ROLE

You are a world-class TypeScript/React engineer and Supabase platform practitioner.
Your defining trait for this task: you reason about credential blast radius. You know
that a service-role key is not "a key with more permissions" but a total bypass of
every access-control decision in the database, and that where it lives determines
what a compromise costs. You put it in exactly one place, you never let a caller
influence what it does beyond a validated allowlist, and you never let it authorise
anything — authorisation is always decided from the CALLER's identity, never the
key's.

Working style, binding:
- READ BEFORE WRITE. Verify every fact below; if one is wrong, STOP and report it.
- ⚠️ comments in this codebase are BINDING CONSTRAINTS. Do not delete or weaken one.
- RED-first (superpowers:test-driven-development) for everything testable.
- DO NOT WIDEN SCOPE. If a change needs a file outside Scope, STOP and FLAG.
- Report honestly with real command output, and be explicit about what CANNOT be
  tested here.

GOAL

Let an admin invite a new staff member from `/settings/roles` — email plus role —
without the service-role key ever entering this repository, the Next.js runtime, or
Vercel. The invited person receives a Supabase email, sets their own password, and
appears in the roster as pending until they accept.

CONTEXT

The repo IS ArcBase: an internal, auth-gated, single-tenant Next.js app. Read
`AGENTS.md` and `CONTEXT.md` first. The RBAC workstream (ADR 0013) is complete and
applied: `admin` / `analyst` Staff Roles enforced in the UI, in Server Actions, and
in the database.

Existing pieces you will build on:
- `public.is_admin()` — `stable`, `security definer`, granted to `authenticated`,
  true only for a caller with an admin row in `public.staff_roles`.
- `public.list_staff()` — `security definer`, admin-guarded, LEFT JOINs `auth.users`
  so unassigned accounts stay visible. Returns
  `user_id, email, role, assigned, created_at, updated_at`.
- `public.set_staff_role(uuid, text)` — admin-guarded, advisory-locked, refuses to
  remove the last admin.
- `src/lib/auth/roles.ts` — `getRole()`, `isAdmin()`, `requireAdmin()`.
- `src/services/staff.ts` — `listStaff()`, `setStaffRole()`.
- `/settings/roles` — admin-only page; `/settings` is nav item six.
- `src/app/auth/callback/route.ts` — exchanges a PKCE `code` for a session and
  honours a `?next=` parameter.

REPO FACTS YOU MUST USE (verify each):

1. **There are NO edge functions in this repo yet** (`supabase/functions/` does not
   exist). You are creating that surface. It sits OUTSIDE the twin-SQL convention —
   `supabase/sql-sync.test.ts` does not apply to it.
2. `src/env.server.ts` holds exactly ONE secret, `REPORT_LINK_SIGNING_SECRET`.
   ⚠️ **DO NOT ADD A SERVICE-ROLE KEY TO IT.** That is the entire point of this
   design. If you find yourself adding one, STOP and FLAG.
3. EVERY SCHEMA CHANGE IS TWO FILES held identical on executable SQL by
   `supabase/sql-sync.test.ts` via `PAIRS`. Latest timestamp is `20260802140000`.
4. Supabase Edge Functions receive `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` as **automatically injected** secrets. You do not
   manage or commit them.
5. `supabase-js`'s `functions.invoke()` attaches the caller's session JWT
   automatically — that is what makes caller-identity authorisation possible.
6. S2's Server Action pattern: `requireAdmin()` denies by calling `redirect()`, which
   denies BY THROWING, so it must sit OUTSIDE any `try { … } catch`. See the ⚠️ block
   in `src/app/(app)/clients/[id]/report-link-actions.ts`.

SCOPE

CREATE — the edge function `supabase/functions/invite-staff/index.ts` (Deno):

⚠️ **AUTHORISE FROM THE CALLER, EXECUTE WITH THE KEY. NEVER CONFLATE THEM.**
Two clients, in this order:

  1. An **anon-key client carrying the caller's `Authorization` header**. Call
     `is_admin()` with it. If it is not true, return **403 and stop**. This is the
     only thing that decides authorisation. A service-role client would have
     `auth.uid() = null`, so it cannot answer "is the caller an admin" at all.
  2. Only then, a **service-role client**, used for exactly two operations:
     `auth.admin.inviteUserByEmail(...)` and the `staff_roles` insert.

Body: `{ email: string, role: 'admin' | 'analyst' }`. Validate both server-side —
reject a malformed email and any role outside the two values.

⚠️ **THE REDIRECT TARGET MUST NOT COME FROM THE REQUEST BODY.** A caller-supplied
`redirectTo` is an open-redirect that would send an invite email pointing wherever
the caller likes. Read the site origin from a function secret (e.g.
`ARCBASE_SITE_URL`) and build
`${ARCBASE_SITE_URL}/auth/callback?next=/auth/update-password` inside the function.
Document that the secret must be set at deploy time.

⚠️ **ORDER: INVITE FIRST, THEN WRITE THE ROLE.** `staff_roles.user_id` has a foreign
key to `auth.users(id)`, so writing the role first fails. `inviteUserByEmail` returns
the new user id — use it. If the invite succeeds but the role write fails, the user
exists with NO role row and is therefore an **analyst** (D4's default) — the safe
direction, recoverable by promoting them on the same screen. Return a response that
says so plainly rather than reporting blanket success.

MODIFY — SQL, `supabase/staff-roles-admin.sql` AND
`supabase/migrations/20260802140000_staff_roles_admin.sql`, **edited in place**:

Add `pending boolean` to `list_staff()`'s `returns table`, computed as
`u.email_confirmed_at is null`. An invited-but-unaccepted account exists in
`auth.users` immediately; without this the admin invites someone and watches them
vanish until acceptance.

⚠️ EDIT IN PLACE, DO NOT ADD A NEW FILE DEFINING `list_staff` AGAIN — S2 established
this: a second `create or replace` of the same function elsewhere leaves a stale
definition that silently wins if applied in the wrong order. One definition per
function, always current. Record that reasoning in a comment.

MODIFY — app:
- `src/services/staff.ts` + test — add `inviteStaff(email, role)` calling
  `supabase.functions.invoke("invite-staff", …)`. Surface the edge function's
  partial-success case as a distinct result, not as an error and not as success.
- `src/app/(app)/settings/roles/actions.ts` + test — `inviteStaffAction`, `zod`
  validated, `requireAdmin()` OUTSIDE any `try` (fact 6).
- `src/components/dashboard/settings/staff-roles-table.tsx` + test — render the
  `pending` state in the roster, and add the invite form (email + role select).
  Follow the existing connected/presentational split so the form is unit-testable.
- `src/services/types.ts` (or wherever `StaffRow` lives) — add `pending`.

CREATE — `docs/adr/0014-arcbase-staff-invitations.md`. It must record:
- WHY the service-role key lives in an Edge Function and not in `env.server.ts`:
  it bypasses ALL RLS on ALL tables including Outreach PII (ADR 0012), so a leak of
  the Next app must not be a leak of the database.
- WHY there is no SQL alternative (GoTrue operation, not a table write).
- The **honest cost**: ArcBase gains a service-role key somewhere it did not have
  one, and an in-app invite plus the roles screen means one compromised admin session
  can now create a user AND make them an admin — which previously also required
  Supabase dashboard access, a de facto second factor. Say this plainly.
- That it AMENDS ADR 0007's "there is no self-serve signup" only in mechanism —
  invitation is still admin-initiated; there is still no self-serve signup.

DO NOT TOUCH: `src/middleware.ts`, `src/lib/route-access.ts`, `src/lib/auth/*`,
`set_staff_role`, `is_admin`, the report-link functions, `/r/[token]`, the `clients`
policies, ingestion, Outreach, or any analytics service.

APPROACH

1. Report real git state. S4 is uncommitted and is NOT yours; S1–S3 are committed
   (`f379882`, `50f65c8`). Surface, never rewrite, any commit you did not make.
2. Capture the `pnpm test` baseline count first.
3. Edge function, then SQL, then service, then action, then UI, then the ADR.
4. Mutation-verify and report what went red:
   - Delete `requireAdmin()` from the action — a test must fail.
   - Make `inviteStaff` report success on the partial-failure path — a test must fail.

ACCEPTANCE CRITERIA

- `grep -ri "service_role" src/` returns NOTHING. The key exists only in the edge
  function's runtime, injected by Supabase. State the grep result in your report.
- The edge function decides authorisation from the CALLER's JWT via `is_admin()`,
  and returns 403 before touching the service-role client for a non-admin.
- The redirect URL is built from a function secret, never from the request body.
- Invite happens BEFORE the role write, and a failed role write is reported as a
  partial success naming the consequence (they are an analyst), not as success and
  not as a blanket error.
- `list_staff()` returns `pending`, and the roster visibly distinguishes pending from
  accepted. Tested.
- `requireAdmin()` is outside every `try` in the new action, with a test asserting the
  denial throws rather than returning an error state.
- ADR 0014 exists and states the honest cost, including the lost second factor.
- Gate green; test count strictly up; no existing assertion weakened or deleted.

VERIFICATION

Run and paste real output:

    pnpm lint && pnpm type:check && pnpm test && pnpm build

Verification is the automated gate plus unit/component tests ONLY. DO NOT use
Claude-in-Chrome, a dev server, or any live-browser runtime walk.

⚠️ **THE EDGE FUNCTION CANNOT BE TESTED BY THIS SUITE.** It is Deno, and vitest does
not run it. Everything Next-side is testable with `functions.invoke` mocked, and you
should test it thoroughly — but the function's own logic, including the 403 path and
the two-client separation, is unverified by the gate. SAY SO EXPLICITLY in your
report. Do not let a green gate imply the invite path works.

GUARDRAILS

- DO NOT DEPLOY. No `supabase functions deploy`, no `db push`, no database
  connection. The user deploys and applies.
- In your report, give the user the EXACT deploy steps they must run: deploying the
  function, setting `ARCBASE_SITE_URL`, applying the edited SQL, and allow-listing
  the redirect URL in Supabase → Authentication → URL Configuration (without which
  the invite email's link bounces).
- LEAVE ALL WORK UNCOMMITTED on `feat--implement-RBAC`. No commit, push, branch, tag,
  or PR. Never commit to `main`.
- DO NOT run `graphify update`.
- If you cannot satisfy an acceptance criterion, DO NOT silently drop it. Finish
  everything else and report exactly what is undone and why.

REPORT BACK

1. Git state at start and end.
2. `git diff --stat` plus new files.
3. Baseline and final test counts.
4. Full gate output.
5. The `grep -ri "service_role" src/` result.
6. The edge function's authorisation block, verbatim, so the caller-vs-key separation
   can be checked by eye.
7. What the mutation checks broke, and that you restored them.
8. The exact deploy/apply steps the user must run.
9. FLAGS: anything in this brief wrong about the repo, anything you decided that it
   did not settle, and anything that is unverified by the gate.
```

---

## Feedback & revisions log

| Date       | Change                               |
| ---------- | ------------------------------------ |
| 2026-08-02 | Emitted. Not yet run by an executer. |
