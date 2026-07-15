# 5. Multi-tenancy: organizations, memberships, and RLS

Date: 2026-07-15

## Status

Accepted. Amends [ADR 0003](0003-mock-first-service-seam.md) (mock-first,
frontend-only) and builds on [ADR 0002](0002-supabase-only-auth.md)
(Supabase-only auth). ADR 0003's seam pattern is retained; its "everything is
mock" stance is relaxed for one real vertical slice.

## Context

The template is being optimized as a **general B2B SaaS starter**. The single
thing a SaaS starter cannot fake is **multi-tenant data with row-level
isolation** — the part teams most often get wrong when rolling their own. ADR
0003 kept all data mock behind the Service Seam; that leaves tenancy, RLS, and
per-tenant authorization undemonstrated.

## Decision

Introduce a real, RLS-backed multi-tenant data path and wire **one** vertical
slice (the Customers Reference Feature) to it. Everything else stays mock behind
the Service Seam.

- **Tenancy model.** `organizations` and `memberships` (a User↔Organization
  many-to-many). A User may belong to many Organizations; an **Active
  Organization** is tracked server-side (a signed/HTTP-only cookie the server
  reads) and chosen via a workspace switcher. Tenant-scoped rows carry an
  `organization_id`.

- **Roles (two tiers).** **Org Role** (`owner` | `admin` | `member`) lives on
  the Membership and governs access within an Organization. A global **Platform
  Role** (`superadmin`) lives in the User's `app_metadata` for operator staff
  and transcends Organizations. Org authorization resolves from the Active
  Organization's Membership; platform authorization from `app_metadata`.

- **Isolation via RLS, not app code.** Postgres RLS is the hard boundary: read
  policies restrict rows to Organizations the caller is a member of; write
  policies additionally check the caller's Org Role. The Active-Organization
  cookie only _selects among the caller's own_ Organizations — it is never the
  security boundary, so a forged cookie cannot cross tenants.

- **Types.** Database types are generated (`supabase gen types`) and consumed by
  the seam; org-scoped services call real Supabase queries through the existing
  Service Seam interface.

Alternatives considered: a JWT custom-claim carrying `org_id` (more RLS-native
but requires a Supabase auth hook + token refresh on switch) — documented as the
upgrade path, not the default; app-layer-only tenancy with the service-role key
(rejected — one bug leaks across tenants).

## Consequences

- The template now requires a Supabase project (local via CLI or hosted) to run
  the Customers slice for real; other features still run fully mock.
- RLS policies become part of the spec and must be tested against a real
  Postgres (local Supabase), not just unit-mocked.
- The prior global-role RBAC (ADR 0002 era, `app_metadata.role` for everyone) is
  superseded for tenant data by per-Organization Org Roles; `app_metadata` now
  holds only the Platform Role.
- Adding a second real feature is a documented, repeatable pattern (copy the
  Customers slice); the mock seam remains the default for un-wired features.
