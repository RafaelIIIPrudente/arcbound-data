# Context

The shared vocabulary for this repository. This file is a glossary and nothing
else — no implementation details, no decisions. Decisions live in `docs/adr/`.

## Glossary

- **Web App Template** — the reusable starter this repository _is_. A fresh
  clone is the seed of a new product, not a product itself. Anything named or
  branded "Web App Template" / "Acme" is a placeholder meant to be renamed.

- **Reference Feature** — the one fully-worked example feature (**Customers**)
  that demonstrates every canonical pattern end to end: routing, the Service
  Seam, Server Actions, validation, a data table, and tests. New features are
  built by copying it.

- **Service Seam** — the boundary between the UI and its data source. Screens
  read and write through it and never touch a data source directly. It returns
  mock data by default; making the app real means changing the seam, not the
  screens.

- **Auth Strategy** — the pluggable authentication-provider abstraction. The
  template wires exactly one strategy (**Supabase**); the abstraction exists so
  another can be added without rewriting callers.

- **Organization** (a.k.a. **Tenant**) — the top-level account that owns data.
  Users reach data only through a Membership in an Organization; every
  tenant-scoped row belongs to exactly one Organization.

- **Membership** — the link between a User and an Organization. It carries the
  User's Org Role in that Organization. A User may hold Memberships in many
  Organizations.

- **Active Organization** — the Organization a signed-in User is currently
  acting within, selected via the workspace switcher and persisted server-side.
  It scopes what data the User sees.

- **Org Role** — a User's role _within a specific Organization_ (`owner`,
  `admin`, `member`), stored on the Membership. Governs access to that
  Organization's data and settings.

- **Platform Role** — a global role (`superadmin`) for the operator's own staff,
  stored in the User's auth `app_metadata`. It transcends Organizations and
  grants system-management access. Distinct from Org Role.

- **Role** — an umbrella term: in this app a Role is either an Org Role
  (per-Organization) or a Platform Role (global). A User's effective access is
  the union of their Active Organization's Org Role and any Platform Role.

- **Guard** — a mechanism that permits or denies access based on the current
  User's Role. A _route Guard_ protects a URL; a _component Guard_ protects a
  region of a screen.

- **Superadmin** — the sole Platform Role: an operator-staff User with
  unrestricted, cross-Organization access, including system-management screens
  ordinary Users never see.

- **Dashboard Shell** — the authenticated application frame (sidebar, top bar,
  theme toggle, user menu) that hosts feature screens.

- **Marketing Landing** — the public, unauthenticated entry page shown to
  visitors who are not signed in.
