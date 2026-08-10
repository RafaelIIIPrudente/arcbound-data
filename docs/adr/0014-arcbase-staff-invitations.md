# 14. Staff invitations via an Edge Function, so the service-role key never enters the app

Date: 2026-08-02

## Status

Accepted. Builds on [ADR 0013](0013-arcbase-staff-roles.md) (Staff Roles) and
**amends [ADR 0007](0007-arcbase-single-tenant.md) in mechanism only**: ADR 0007
said "staff accounts are provisioned by an Engineer/Admin in Supabase; there is no
self-serve signup." Provisioning now also happens in-app, initiated by an admin.
**There is still no self-serve signup** — nobody can create an account for
themselves, and every account still originates from an existing admin's action.
Only the tool changed, not the rule.

## Context

Adding a staff member required the Supabase dashboard: invite the user there, then
run SQL to give them a `staff_roles` row. ADR 0013 put role assignment in the app at
`/settings/roles`, which left the process half-migrated — an admin could change a
role but not create the person whose role they were changing.

Finishing it runs straight into a credential problem. `inviteUserByEmail` is a
**GoTrue admin operation**: it creates an `auth.users` row and sends a signed
invitation email.

- **It cannot be done in SQL.** It is not a table write. Inserting into `auth.users`
  directly would bypass GoTrue's own invariants and send no email, producing an
  account nobody can sign into. There is no `SECURITY DEFINER` function that can
  substitute, which is how [ADR 0011](0011-client-report-links.md) and ADR 0013
  avoided privileged credentials for everything up to now.
- **It cannot be done with the anon key.** The admin API requires the
  **service-role key**.

And the service-role key is not "a key with more permissions". It is a **total
bypass of every access-control decision in the database** — all RLS on all tables,
in every schema. That includes `public.outreach_prospects`, which holds third-party
prospect PII that [ADR 0012](0012-outreach-system-per-client-snapshots.md)
deliberately confines to staff. It would also bypass `is_admin()`, the Report Link
gate, and the last-admin invariant.

## Decision

The invitation runs in a **Supabase Edge Function**, `invite-staff`, and the
service-role key lives only in that function's injected runtime.

- **The key never enters this repository, the Next.js runtime, or Vercel.**
  `src/env.server.ts` still holds exactly one secret
  (`REPORT_LINK_SIGNING_SECRET`). Supabase injects `SUPABASE_URL`,
  `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` into the function; none is
  committed or managed by us. `grep -ri "service_role" src/` returns nothing.
  **A compromise of the web app is therefore not a compromise of the database.**
  That is the entire point of the design: the blast radius of a leaked Next
  environment stops at what the anon key plus RLS already allow.
- **Authorise from the caller, execute with the key — never conflated.** The
  function builds two clients, in a fixed order:
  1. an **anon-key client carrying the caller's `Authorization` header**, which
     calls `is_admin()`. This is the only thing that decides authorisation. A
     non-admin gets **403 before the service-role client is ever constructed**.
  2. a **service-role client**, created only after that check passes, used for
     exactly two operations: the invite and the `staff_roles` insert.

  A service-role client _cannot_ answer "is the caller an admin" — it has no
  session, so `auth.uid()` is null. Using it to authorise would authorise
  everything.

- **The redirect target is a secret, not an input.** The invitation link is built
  inside the function from `ARCBASE_SITE_URL`. A caller-supplied `redirectTo` would
  be an open redirect _with an emailed, correctly-signed link_ — the caller could
  have Supabase send a genuine invitation pointing at a host they control. There is
  no code path by which the request body can influence it.
- **Invite first, then write the role.** `staff_roles.user_id` references
  `auth.users(id)`, so the row cannot exist first. If the invite succeeds and the
  role write fails, the function returns `invited_without_role` — **a third
  outcome, neither success nor failure**. The account exists and the email cannot be
  un-sent, but with no role row the person defaults to **Data Analyst** (ADR 0013's
  least-privilege default) — the safe direction, and recoverable by assigning the
  role on the same screen. The UI renders this as an alert, never as a confirmation.
- **The roster shows `pending`.** `list_staff()` gained
  `pending = (u.email_confirmed_at is null)`, because an invited account appears in
  `auth.users` immediately and would otherwise be indistinguishable from an
  established one.

## Consequences

- **⚠️ ArcBase now has a service-role key where it previously had none, and that is
  a real increase in risk, not a neutral refactor.** Before this ADR, no credential
  anywhere in the system could bypass RLS. One now exists. It is confined to a
  single function behind a single admin-gated entry point, but "confined" is not
  "absent": a flaw in that function — a missed guard, a future edit that reads the
  redirect from the body, a dependency compromise in the Deno runtime — reaches
  every table in the database, including Outreach PII.
- **⚠️ A compromised admin session is now sufficient to create an admin, and it was
  not before.** Previously, creating a user required Supabase **dashboard** access
  and granting them admin required **SQL access** — both separate credentials with
  their own MFA, and a de facto second factor on the most dangerous action in the
  product. With ADR 0013's roles screen and this ADR's invite form, one hijacked
  admin session in the web app can now do both: invite an account and make it an
  admin, entirely in-app. **That second factor is gone.** It is the honest price of
  making staff administration self-service, and it should be revisited if ArcBase
  ever holds more sensitive data or grows past a handful of staff. Mitigations worth
  considering later: requiring re-authentication for role changes, or notifying all
  admins by email whenever an admin is created.
- **A new deploy-time dependency.** The feature is dead until the function is
  deployed, `ARCBASE_SITE_URL` is set, the updated SQL is applied, and the redirect
  URL is allow-listed in Supabase → Authentication → URL Configuration. Missing the
  last one makes the invitation email's link bounce — the invite appears to succeed
  and the person cannot get in.
- **`list_staff()` had to be dropped and recreated.** Adding `pending` changes the
  `returns table` signature, and `create or replace` cannot change a return type
  (Postgres `42P13`). The drop discards the function's grants, so the
  revoke/grant pair is re-run in the same script.
- **⚠️ The function is not covered by the test suite.** It is Deno; vitest does not
  run it. Everything Next-side is tested with `functions.invoke` mocked, but the
  403 path, the two-client separation, the invite-then-role ordering and the
  redirect construction are verified by review only. A green `pnpm test` says
  nothing about whether inviting works.
