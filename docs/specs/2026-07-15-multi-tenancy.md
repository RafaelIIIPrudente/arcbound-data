# Spec: Multi-tenant foundation (organizations, memberships, RLS)

Status: ready-for-agent · Source of truth: this spec + [ADR 0005](../adr/0005-multi-tenancy.md) + [CONTEXT.md](../../CONTEXT.md)

## Problem Statement

Someone cloning this template to build a B2B SaaS gets authentication, a
dashboard shell, and a typed data layer — but no multi-tenant foundation. They
still have to design Organizations, Memberships, per-tenant roles, an "active
workspace" concept, and — hardest of all — row-level data isolation. RLS is easy
to get subtly wrong, and one mistake leaks one customer's data to another. Today
the template can't demonstrate any of this: all data is mock and every User
carries the same global role everywhere.

## Solution

Ship a real, RLS-backed multi-tenant slice, and wire one Reference Feature
(Customers) to it end-to-end as the copy-me pattern.

A signed-in User belongs to one or more **Organizations** through
**Memberships**. They act within one **Active Organization** at a time, chosen
from a workspace switcher in the Dashboard Shell, and see only that
Organization's data. Within an Organization a User has an **Org Role**
(`owner` / `admin` / `member`) that governs what they can do; owners and admins
manage members and invitations. The SaaS operator's own staff hold a global
**Platform Role** (`superadmin`) that transcends Organizations for support and
system management. Tenant isolation is enforced by Postgres **RLS**, not
application code, so a forged or stale Active-Organization cookie cannot cross
tenants. Every other feature stays mock behind the Service Seam.

## User Stories

1. As a new User, I want an Organization created for me the first time I sign in, so that I have a workspace to work in immediately.
2. As a new User, I want to name my Organization during onboarding, so that it reflects my company.
3. As a signed-in User, I want to see which Organization I'm currently acting in, so that I know whose data I'm viewing.
4. As a User in multiple Organizations, I want a workspace switcher in the shell, so that I can move between Organizations.
5. As a User, I want my Active Organization to persist across page loads and refreshes, so that I don't have to re-select it every time.
6. As a User, I want switching Organizations to re-scope every screen (Customers, members, settings), so that I never see one Organization's data while "in" another.
7. As a User, I want to create an additional Organization, so that I can run a separate workspace.
8. As the creator of an Organization, I want to be its `owner` automatically, so that I have full control from the start.
9. As an Org Owner, I want to invite a person by email to my Organization, so that my teammates can join.
10. As an Org Owner/Admin, I want to choose the Org Role when inviting, so that new members get appropriate access.
11. As an invited person, I want to accept an invitation and land in that Organization, so that I can start collaborating.
12. As an invited person who already has an account, I want accepting an invite to add a Membership, so that I can belong to multiple Organizations.
13. As an Org Owner/Admin, I want to see all members of my Active Organization with their Org Roles, so that I can manage the team.
14. As an Org Owner/Admin, I want to change a member's Org Role, so that I can promote or demote them.
15. As an Org Owner/Admin, I want to remove a member, so that former teammates lose access.
16. As an Org Owner, I want to be prevented from removing or demoting the last owner, so that an Organization is never left ownerless.
17. As an Org Member, I want to view Customers in my Active Organization, so that I can do my work.
18. As an Org Member with insufficient Org Role, I want write actions I'm not allowed (per the role model) to be blocked, so that permissions are real.
19. As an Org Admin/Owner, I want to create, edit, and delete Customers scoped to my Active Organization, so that data stays within the tenant.
20. As a User, I want to never be able to read or write another Organization's Customers even by manipulating IDs, URLs, or the Active-Organization cookie, so that tenant data is safe.
21. As a User with no Membership in any Organization, I want a clear "create or join an organization" state rather than a broken dashboard, so that I'm not stuck.
22. As a User whose Active-Organization cookie points at an Organization I've been removed from, I want to be safely fallen back to another Membership (or the empty state), so that I don't see a stale or forbidden workspace.
23. As a Superadmin (platform staff), I want cross-Organization access to system-management screens, so that I can support customers.
24. As a Superadmin, I want my platform access to be independent of any Org Role, so that I don't need to be a member of every Organization.
25. As a signed-in User, I want an accurate, real member list and role in Organization settings (replacing the old mock "team" screens), so that what I see reflects the database.
26. As a Developer using the template, I want the Customers slice to show the exact pattern (schema + RLS + generated types + org-scoped service + Server Actions), so that I can copy it to build my own tenant-scoped feature.
27. As a Developer, I want the multi-tenant setup to run locally against the Supabase CLI, so that I can develop without a hosted project.
28. As a Developer, I want RLS policy behavior covered by tests, so that a future change that weakens isolation fails CI.
29. As a Developer, I want the mock Service Seam to remain the default for un-wired features, so that I can prototype UI without a backend.
30. As a User in the auth-disabled local mode (no Supabase), I want the tenant features to degrade gracefully (clear "needs Supabase" state), so that the app still runs for UI work.

## Implementation Decisions

- **Schema (new, real Supabase tables).** Decision-encoding shape:
  - `organizations`: `id` (uuid pk), `name`, `created_at`.
  - `memberships`: `id` (uuid pk), `organization_id` (fk → organizations),
    `user_id` (fk → auth.users), `role` (enum `org_role`), `created_at`;
    unique on (`organization_id`, `user_id`).
  - `org_role` enum: `owner | admin | member`.
  - `invitations`: `id`, `organization_id`, `email`, `role`, `token`, `status`,
    `created_at` (for the email-invite flow).
  - Tenant-scoped feature tables (starting with `customers`) gain
    `organization_id` (fk, not null).
- **RLS is the isolation boundary.** Every tenant table has RLS enabled.
  Read policy: row's `organization_id` is one the caller has a Membership in.
  Write policy: same membership check **plus** the caller's Org Role on that
  Organization is sufficient for the action (e.g. create/update/delete require
  `admin` or `owner` for management data; Customers write policy per the role
  model). Membership/organization tables have their own policies (a User sees
  Organizations they belong to; only `owner`/`admin` mutate memberships).
- **Active Organization is server-resolved, never trusted as the boundary.**
  Stored in an HTTP-only cookie (name: `active_org`). A server helper resolves
  the active Organization from the cookie, validating it against the caller's
  Memberships and falling back to their first Membership (or the empty state)
  when the cookie is missing/invalid/removed. It only _selects among the
  caller's own_ Organizations; RLS still blocks non-member Organizations.
- **Authorization helpers (new seam, highest point).** Server-side:
  `getActiveOrg()` (active Organization + the caller's Membership/Org Role),
  `requireOrgRole(...roles)` (redirect/deny below a threshold),
  `isPlatformSuperadmin()` (reads `app_metadata`). Pure predicates
  (`hasOrgRole(role, ...allowed)`) are unit-testable and are the primary logic
  seam. The existing `authz.ts`/`authz.server.ts` are extended, not duplicated.
- **Types generated, seam interface unchanged.** `supabase gen types` produces
  DB types; the Customers service functions keep their signatures (per ADR 0003)
  but their bodies call real Supabase queries scoped to the Active Organization.
- **Server Actions enforce authorization in-action.** Tenant mutations resolve
  the Active Organization and check Org Role server-side (defense in depth over
  RLS), addressing the audit finding that the reference mutations had no
  in-action authz.
- **Onboarding.** On first authenticated load with zero Memberships, the User is
  routed to a create-Organization step; creating one makes them `owner` and sets
  it active.
- **Workspace switcher** is added to the Dashboard Shell (the shell currently has
  none). Switching sets the `active_org` cookie and revalidates.
- **The mock `team` feature is subsumed.** Team member screens are replaced by
  real Organization member management (list/invite/change-role/remove) reading
  Memberships; the mock `roles`/`permissions` matrices are removed or re-pointed.
- **Sequenced delivery (one executor pass each):** T1 schema+RLS migration +
  generated types; T2 active-org cookie + authz helpers + two-tier refactor;
  T3 switcher + create-org + onboarding; T4 Customers re-pointed to real
  org-scoped CRUD; T5 member management + invites; T6 tests + docs.

## Testing Decisions

Good tests assert **external behavior** (what an actor observes), never
implementation details. Three seams, fewest and highest:

1. **Pure tenancy/authz logic — Vitest unit.** `hasOrgRole` and the active-org
   selection/fallback logic (given cookie + memberships → chosen org). Prior
   art: `src/lib/authz.test.ts`, `src/services/customers.test.ts`.
2. **Service-seam integration against local Supabase (`supabase start`).** The
   single most valuable seam: exercise the org-scoped Customers service and the
   membership/invite services through the real RLS-enforced code path. The
   defining assertions are **negative**: a member of Org A cannot read or write
   Org B's Customers (by id, by forged `active_org`, or by direct query), and a
   `member` cannot perform an `admin`-gated write. Prior art: none yet — this is
   the new integration seam; introduce it at the service layer, not per-file.
3. **E2E — Playwright.** Happy-path smoke: sign in → create/switch Organization →
   see only that Organization's Customers → invite/remove a member as owner.
   Prior art: `e2e/auth-smoke.spec.ts` (extend the same harness; honors
   `PLAYWRIGHT_PORT`).

RLS policies must be tested against real Postgres (seam 2), not unit-mocked —
mocking the DB would test nothing about isolation.

## Out of Scope

- JWT-custom-claim active org (documented in ADR 0005 as the upgrade path).
- Stripe billing, i18n, SSO/SAML, Organization deletion/ownership transfer.
- The supporting backlog Tiers 1–3 (typed env, `loading.tsx`, OAuth, Supabase
  Storage, security headers/CSP, Sentry + health endpoint, SEO
  sitemap/robots/manifest/OG, CI coverage+axe+CodeQL) — each is its own companion
  spec, sequenced around this one; not built here.
- Tier 4 items (editorconfig/nvmrc/devcontainer, changesets) — deferred as
  documented TODOs.

## Further Notes

- This spec assumes the in-flight **audit remediation** (auth-disabled-mode
  fail-open, `nextId` collision, callback hardening, `error.tsx`/`loading.tsx`,
  a11y) lands first; the tenancy slice is sequenced after those passes.
- Typed/validated env (backlog Tier 1) should land before or with T1, since it
  structurally removes the `process.env.X!` non-null-assertion class that caused
  the fail-open.
- Delivery is planner → executer: each of T1–T6 is handed off as one
  self-contained executer prompt, most-foundational first, re-grounding the
  source between passes.
- Isolation guarantee to preserve across every pass: **the Active-Organization
  cookie is a selector, never a security boundary — RLS is.**
