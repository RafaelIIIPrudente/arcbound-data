# 13. Staff Roles: Admin and Data Analyst

Date: 2026-08-02

## Status

Accepted. **Amends [ADR 0007](0007-arcbase-single-tenant.md)** (single-tenant,
authenticated-staff-only). ADR 0007 said plainly: "Authorization collapses to
**authenticated vs. not** … There are no in-app role tiers in v1." That sentence
is now false, and this ADR is the record of retiring it.

This is the second narrowing of ADR 0007, and it follows the shape of the first.
[ADR 0011](0011-client-report-links.md) carved out a read-only, passcode-gated
capability for a non-user; this one introduces privilege tiers **among** the
authenticated staff. In both cases the rest of ADR 0007 stands unchanged.

**A Staff Role is not a tenant.** ADR 0007's single-tenant decision is untouched:
all staff still share **one dataset**, there are no Organizations, no
`organization_id`, and no data partitions. This ADR adds a **privilege tier** —
who may perform which governance action — not a second copy of the data. If
Arcbound ever resells ArcBase to other agencies, that is still the ADR 0005
restoration, and this ADR does not bring it any closer.

## Context

ArcBase has exactly one authorization question today: is there a session?
`routeAccess(pathname, isAuthed)` answers it, `src/middleware.ts` enforces it, and
every authenticated staff member can therefore do everything — register a Client,
issue and revoke a Client's Report Link, upload data, read every screen.

Three things have accumulated since ADR 0007 that make one tier too coarse:

- **Registering a Client is a commitment, not a data entry.** A Client is the
  identity every downstream row attributes to. A typo'd or duplicated Client
  silently splits a person's history across two records, and nothing in the app
  merges them back.
- **Report Links leave the building** ([ADR 0011](0011-client-report-links.md)).
  Issuing or rotating one mints a credential that a person outside Arcbound then
  holds. Revoking one cuts off a client mid-engagement. That is a governance
  action, and it currently sits behind the same gate as viewing a chart.
- **The day-to-day job is narrower than the permission set.** The
  Data Input Specialist described in `CONTEXT.md` runs the weekly upload. Uploading
  and reading is the whole role; the ability to also revoke a client's access is
  latent risk with no corresponding benefit.

The distinction being drawn is between **reading and contributing data** (the
frequent, reversible, low-stakes work) and **governing the account** (the rare,
outward-facing, hard-to-reverse work).

### Where the role is stored

Three locations were considered. The requirement that decides it: a staff member
must not be able to change their own tier.

- **`auth.users.user_metadata`** _(rejected)_ — the obvious place, and the wrong
  one: it is **writable by the user it describes**. Any signed-in staff member can
  call `auth.updateUser({ data: { role: "admin" } })` from the browser console and
  promote themselves. A privilege stored where its subject can edit it is not a
  privilege boundary; it is a preference. (`AGENTS.md` already says never to trust
  client metadata — this is the same rule, applied to the metadata's own writer.)
- **A custom JWT claim** _(rejected)_ — genuinely attractive, because RLS could
  read the tier straight from the token with no extra query. But writing a custom
  claim requires a **service-role key** or an Auth Hook running with elevated
  rights, and this repo deliberately has neither: `src/env.server.ts` holds exactly
  one server secret, and [ADR 0011](0011-client-report-links.md) established
  `SECURITY DEFINER` functions as the way to do privileged work _without_
  introducing one. A claim is also **stale until the token refreshes**, so a
  revoked admin would keep their powers for the life of their access token — the
  wrong failure direction for a revocation.
- **An app-owned table, `public.staff_roles`** _(chosen)_ — the subject cannot
  write it, revocation is immediate, and it costs one indexed primary-key lookup
  per render, memoised per request.

## Decision

ArcBase gains a **Staff Role**: a privilege tier on each authenticated staff
account, with two values — **Admin** and **Data Analyst**.

- **`public.staff_roles`** maps `user_id` → `role`, constrained by a `CHECK` to
  `'admin' | 'analyst'`. A `CHECK` rather than a Postgres enum, so a third tier is
  a one-line change rather than a type migration.
- **Absence of a row means `analyst`.** Least privilege as the default: a newly
  provisioned staff account is never accidentally an admin, and no forgotten
  backfill can turn into a privilege grant. The same migration **seeds the known
  admin(s)**, so there is never a window in which ArcBase has zero admins — which,
  once S2 enforces, would lock every governance action out of the product with no
  in-app way back in.
- **Own-row read only.** The single RLS policy is
  `for select to authenticated using (user_id = auth.uid())`. A staff member can
  read their own tier and nothing else; the roster is not exposed to
  `authenticated` at large. The policy deliberately does **not** consult
  `is_admin()`: a policy on a table that calls a helper reading that same table is
  the classic self-referential-policy footgun (Postgres `42P17`), and the own-row
  predicate cannot recurse however the helper is later redefined.
- **No write policies at all.** Rows are written by the seed and, from S3, by
  `SECURITY DEFINER` functions whose owner bypasses RLS. There is no route through
  the app by which an analyst can write their own tier.
- **`public.is_admin()`** — `stable`, `security definer`, `set search_path =
public` — is the helper that S2's policies and S3's functions consult for tables
  _other_ than `staff_roles`. No service-role key is introduced, consistent with
  ADR 0011 and [ADR 0010](0010-arcbase-owns-analytics-end-to-end.md).
- **`getRole()` fails closed.** The typed read path
  (`src/lib/auth/roles.ts`) resolves to `analyst` — never `admin` — for _every_
  way of not knowing: a query error, a thrown exception, a missing row, or a value
  the `CHECK` should have made impossible. It never throws, because a layout calls
  it and a throw would blank the shell rather than degrade one affordance. It is
  memoised with React `cache()`, which is **request**-scoped; a cross-request store
  would serve the first admin's tier to every later visitor, which is privilege
  escalation rather than a stale cache. A source guard in `roles.test.ts` enforces
  this, because nothing else would catch it.
- **In auth-disabled dev the role is `admin`**, so the app stays fully browsable
  without a Supabase project. Safe by construction: `authDisabled` is
  `!isSupabaseConfigured && NODE_ENV !== "production"` and is therefore false in
  every production build.

### The split

- **Admin** — everything a Data Analyst can do, plus the governance surface:
  registering a Client, issuing / rotating / revoking a Report Link, and assigning
  Staff Roles.
- **Data Analyst** — uploads data and reads everything. The default tier.

Both tiers read **all** data for **all** Clients. This is a privilege split, not a
visibility split; ADR 0007's shared dataset is intact.

## Consequences

- **Registering a Client becomes admin-only, and that has a real cost.** A Data
  Analyst who receives a scrape for a Client that does not exist yet **cannot
  proceed** — they must wait for an admin to register it. This is accepted
  deliberately: a wrong or duplicate Client corrupts the attribution of every row
  that follows and there is no merge tool, whereas a delayed upload is merely a
  delay. It is the single most likely source of day-to-day friction from this ADR,
  and the first thing to revisit if it proves worse than expected.
- **S3 will add a staff-enumeration capability that does not exist today.** An
  admin screen for assigning roles must list staff accounts, and `auth.users` is
  not readable by `authenticated`. That means a new `SECURITY DEFINER` function
  returning staff identities — a genuinely new read surface, admin-gated, that the
  app currently has no equivalent of. It is a cost, not a free consequence.
- **The boundary is not enforced by this slice.** S1 delivers the table, the SQL
  helper, the typed read path, and this record — and changes **no behaviour**.
  `requireAdmin()` exists and is tested but is deliberately uncalled. Until S2
  wires it in, the ADR describes an intent, not a live boundary; the affordances
  are all still visible to everyone.
- **A hidden button is not a boundary.** Whatever S2 hides in the UI must also be
  refused server-side, in the Server Action and in RLS. The UI tier is an
  affordance; `is_admin()` and the action-level check are the boundary.
- **The seed list is operational state in version control.** The admin email list
  lives in the SQL pair and must be edited in **both** files, or `sql-sync.test.ts`
  fails. Adding the first admin on a fresh database is a SQL-editor action, not an
  in-app one.
- **Two roles, not a permission system.** There is no per-capability grant matrix.
  If a third tier or a finer split is ever needed, the `CHECK` constraint takes a
  new value in one line — but a general permission model would be a new ADR, not an
  extension of this one.
