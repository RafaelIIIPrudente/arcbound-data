# 11. Client-facing report access via passcode-gated Report Links

Date: 2026-07-25

## Status

Accepted. **Narrows [ADR 0007](0007-arcbase-single-tenant.md)** (single-tenant,
authenticated-staff-only). ADR 0007 stands; this ADR carves one deliberate,
bounded exception into it — a read-only, passcode-gated capability — without
introducing a second class of authenticated user.

## Context

ArcBase produces a per-Client LinkedIn report (`/clients/[id]/report`) that only
authenticated Arcbound staff can see. Clients — the people whose profiles are
tracked — have no way to view their own reporting or the current state of their
data. ADR 0007 made ArcBase single-tenant and staff-only on purpose: no public
access, no role tiers, and RLS collapsed to "an authenticated user may read and
insert." The glossary is equally deliberate: a **Client** is a _tracked subject_,
"never the browser/server sense."

Letting a client view their report therefore pushes directly on ADR 0007. Three
access models were weighed (grilling session, 2026-07-25):

- **Exported PDF only** — staff send a static PDF. Preserves ADR 0007 fully, but
  nothing is live, there is no "status", and it is stale the moment it is sent.
- **Client login accounts** — real Supabase accounts per client, row-scoped RLS,
  staff-vs-client role tiers, a second app shell. A _full reversal_ of ADR 0007:
  a new user class, provisioning/invites, role-scoped RLS on every query, account
  lifecycle. Heaviest and most security-sensitive.
- **Tokenized read-only link** _(chosen)_ — a per-Client secret URL that renders
  the live report with no account and no role tier.

The data in question is the Client's _own_ public LinkedIn post metrics — not
sensitive PII — which justifies a possession-plus-passcode capability over full
authentication.

## Decision

ArcBase gains a **Report Link**: a revocable, read-only, passcode-gated URL that
grants a Client's own viewer access to that one Client's **live** report, without
an ArcBase account.

- **Not a user.** A Report Link is a _capability bound to one Client_, not an
  identity. The viewer is never an authenticated Supabase user; there is no
  `ClientUser` entity, no role tier, and no change to the staff auth gate. ADR
  0007's "authenticated vs. not" stays intact for the app; the Report Link is a
  narrow, separate public read path.
- **Live, not snapshot.** The link renders the current report every visit
  (`buildClientReport` over live rows). No `report_snapshots` store; "status"
  means _current state_.
- **Two factors: URL + Access Code.** Possession of the opaque URL is not enough;
  a viewer must also supply an out-of-band **Access Code**. The URL token is a
  128-bit secret stored as-is (re-viewable by staff, useless alone); the Access
  Code is stored **only as a hash** (`pgcrypto crypt`/`gen_salt('bf')`) and is
  shown to staff once, at issue. The gate is **rate-limited with lockout**, since
  a leaked URL plus a short code would otherwise be brute-forceable.
- **One active link per Client.** Enforced by a partial unique index on
  `client_id where revoked_at is null`. Staff **Create / Rotate / Revoke** from
  the client detail page; Rotate reissues (old URL + code die), Revoke kills it.
- **Privileged reads via SECURITY DEFINER, no service-role key.** The public path
  never authenticates, so RLS cannot admit it. A `resolve_report_link(token,
code)` SECURITY DEFINER function performs the token+code check, lockout
  accounting, and returns the `client_id`; issue/rotate/revoke are likewise
  definer functions. No Supabase service-role key is introduced (consistent with
  [ADR 0010](0010-arcbase-owns-analytics-end-to-end.md)). The SQL is applied by
  staff, not the agent.
- **Read-only, single-Client payload.** The viewer sees the existing report
  _sections_ (already single-Client and leak-free) inside a public wrapper that
  strips staff chrome (the client tabs, the back-link, the staff print button) and
  softens internal diagnostics (the truncation banner), plus a **Report Status**
  strip: freshness (last Scrape date, tracked-since) and a plain, **non-graded**
  activity/trend line. No score, no grade, no cross-Client data.

## Consequences

- **ADR 0007 is narrowed, not overturned.** Staff remain the only _authenticated_
  users and still share one dataset; the Report Link is an additive, revocable,
  read-only capability. If clients ever need real accounts (history, messaging,
  multiple contacts), the login-accounts model — and its ADR-0007 reversal — is
  the future step; the Report Link's read-only view is reusable underneath it.
- **New public route.** `/r/<token>` joins the `PUBLIC_ROUTES` allowlist in
  `route-access.ts` (the only non-login public app route). It is served
  `noindex` / `no-referrer` and carries the standard CSP.
- **New table + functions, applied by staff.** `public.report_links` (token,
  `access_code_hash`, lifecycle + lockout columns) with authenticated-`select`
  RLS and no direct insert/update/delete (mutations go through the definer
  functions). Delivered as the usual paste-script + migration pair kept in step by
  `sql-sync.test.ts`, with a `REPORT-LINKS-APPLY.md`.
- **Access Code cannot be re-displayed.** Because it is hashed, staff see it once
  at Create/Rotate; to change it they Rotate. The URL, being stored, stays
  re-copyable.
- **Brute-force surface exists and is mitigated, not eliminated.** Rate-limit +
  lockout in `resolve_report_link` (and a belt-and-suspenders app-layer limit on
  the route) bound it; a determined attacker still needs both the 128-bit URL and
  the code.
- **A viewer session is minimal.** Passing the Access Code sets a short-lived,
  signed, httpOnly gate cookie for that token — not a Supabase session — so the
  viewer is not re-prompted on each page nav.
