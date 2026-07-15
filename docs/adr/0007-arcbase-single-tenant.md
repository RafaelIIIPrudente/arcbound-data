# 7. ArcBase is single-tenant: retire the multi-tenant machinery

Date: 2026-07-16

## Status

Accepted. Supersedes [ADR 0005](0005-multi-tenancy.md) (multi-tenancy) for this
product and narrows the general-B2B-SaaS-starter framing of that ADR: this clone
is being specialized into the **ArcBase** product, not kept as a reusable
template.

## Context

The repository began as a general B2B SaaS starter whose defining feature was
multi-tenant data isolation (Organizations, Memberships, an Active Organization,
per-tenant Org Roles, and RLS scoped by `organization_id` — ADR 0005). ArcBase,
by contrast, is an **internal Arcbound tool**: authenticated staff only, no public
access, no notion of separate customer accounts, and a design with no workspace
switcher. In ArcBase, "Clients" are the LinkedIn profiles being tracked — the
subjects of the data, not tenants that own partitions of it.

Carrying the tenancy machinery would add onboarding, a workspace switcher,
invitations, and per-tenant role authorization that the SRS never asks for, and
would complicate every screen and query for no product benefit.

## Decision

ArcBase is **single-tenant**. All authenticated Arcbound staff share one dataset.

- Remove Organizations, Memberships, invitations, the Active-Organization cookie,
  the workspace switcher, and per-Organization Org Roles. Remove the derived
  template features that existed only to demonstrate them (`team` members /
  permissions, `role-settings`).
- Authorization collapses to **authenticated vs. not**: middleware guards every
  route except the login page. There are no in-app role tiers in v1.
- **RLS remains the data boundary**, but the policy is simply "an authenticated
  user may read and insert": `clients` and `uploads` allow `select` + `insert`
  and have **no** update/delete policies (enforcing immutability at the database);
  `posts` allow `insert` + `update` (for the ingestion upsert) and no delete.
- Staff accounts are provisioned by an Engineer/Admin in Supabase; there is no
  self-serve signup.

Alternatives considered: keep a single hard-coded "Arcbound" Organization and
scope rows by `organization_id` (rejected — retains switcher/invite/onboarding
surface the SRS excludes, for a future-multi-agency scenario the SRS explicitly
scopes out); keep full multi-tenancy (rejected — Clients are subjects, not
tenants; there is no second tenant).

## Consequences

- Large deletions across the template: the `init_multitenancy` migration and its
  tables, the org-scoped authz helpers, the switcher, and the `team`/`role`
  screens are removed rather than adapted.
- If Arcbound ever resells ArcBase to other agencies, multi-tenancy must be
  reintroduced; ADR 0005 remains on record as the pattern to restore.
- The Service Seam ([ADR 0003](0003-mock-first-service-seam.md)) and Supabase auth
  ([ADR 0002](0002-supabase-only-auth.md)) are retained unchanged; only the
  tenancy layer is removed.
