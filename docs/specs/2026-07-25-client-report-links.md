# Client Report Links Implementation Plan

> **For agentic workers:** each slice below (S1–S4) becomes its own executer
> `/handoff`. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is the
> shared brief the per-slice handoffs point at — read your slice in full before
> writing.

**Goal:** Let a Client view their own live LinkedIn report + status through a
revocable, passcode-gated **Report Link** — no ArcBase account, no role tier.

**Architecture:** A new `public.report_links` table + SECURITY DEFINER functions
(issue / rotate / revoke / resolve) own the capability and its lockout accounting.
Staff Create/Rotate/Revoke the one active link per Client from the client detail
page. A new public route `/r/<token>` gates on an out-of-band **Access Code**, sets
a short-lived signed cookie, then renders the existing report _sections_ (already
single-Client) in a public wrapper plus a **Report Status** strip. Reads on the
public path go through the definer `resolve_report_link` — no service-role key.

**Tech stack:** Next.js 15 App Router (RSC + server actions), Supabase (auth +
Postgres + pgcrypto), TypeScript strict, Vitest + Testing Library. See
[`AGENTS.md`](../../AGENTS.md) for every stack rule and
[ADR 0011](../adr/0011-client-report-links.md) for the decision.

## Global Constraints

- **Narrows [ADR 0007](../adr/0007-arcbase-single-tenant.md); the viewer is NOT a
  user.** No `ClientUser` entity, no role tier, no change to the staff auth gate.
  The Report Link is a separate public read path only.
- **Vocabulary is fixed** (see [`CONTEXT.md`](../../CONTEXT.md)): **Report Link**
  (the capability record / URL), **Access Code** (its out-of-band passcode),
  **Report Status** (the freshness + non-graded activity strip). Route: `/r/<token>`.
- **URL token stored as-is; Access Code stored ONLY as a hash** (`pgcrypto crypt` +
  `gen_salt('bf')`). The code is shown to staff once, at Create/Rotate; it is never
  re-displayable. The token (128-bit, `encode(gen_random_bytes(16),'hex')`) stays
  re-copyable.
- **One active Report Link per Client** — partial unique index on `client_id where
revoked_at is null`.
- **No service-role key.** Every privileged/public read is a SECURITY DEFINER
  function. **SECURITY DEFINER SQL is applied by staff, not the agent** — the
  executer writes the SQL pair + `REPORT-LINKS-APPLY.md`, and stops there.
- **SQL is a PAIR** kept in step by `supabase/sql-sync.test.ts`: a paste script
  `supabase/report-links.sql` + a CLI migration
  `supabase/migrations/<ts>_report_links.sql`, added to that test's `PAIRS` array.
- **No score, no grade, no ranking, no cross-Client data** on the client view — the
  four-state / honesty discipline the rest of the branch enforces
  (`estimated_post_date`-only dating, "of N" denominators, no "best/optimal").
- **No new analytics DB read** for the report or status — reuse `buildClientReport`
  and the rows/uploads it already fetches.
- **`/r/<token>` is `noindex` + `no-referrer`**, standard CSP (middleware already
  applies it), rate-limited + lockout on the Access Code gate.
- **Verification is the automated gate + hermetic unit/component tests ONLY**
  (`pnpm lint && pnpm type:check && pnpm test && pnpm build`). No Claude-in-Chrome,
  no dev-server/browser walk. **Leave all work UNCOMMITTED; the user commits.**

## File-Structure Map

| File                                                            | Responsibility                                | Slice |
| --------------------------------------------------------------- | --------------------------------------------- | ----- |
| `supabase/report-links.sql`                                     | Paste script: table, RLS, definer fns         | S1    |
| `supabase/migrations/<ts>_report_links.sql`                     | CLI migration twin of the above               | S1    |
| `supabase/REPORT-LINKS-APPLY.md`                                | Staff apply instructions                      | S1    |
| `supabase/sql-sync.test.ts`                                     | Add the new pair to `PAIRS`                   | S1    |
| `src/services/report-links.ts`                                  | Service seam: issue/rotate/revoke/get/resolve | S1    |
| `src/services/report-links.test.ts`                             | Service tests (mock the RPC seam)             | S1    |
| `src/services/types.ts`                                         | `ReportLink` / `ReportLinkStatus` types       | S1    |
| `src/paths.ts`                                                  | `paths.reportLink(token)` + base `/r`         | S1/S3 |
| `src/components/dashboard/client/report-link-card.tsx` (+ test) | Staff Create/Rotate/Revoke card               | S2    |
| `src/app/(app)/clients/[id]/…`                                  | Mount the card on client detail               | S2    |
| `src/lib/route-access.ts`                                       | Add `/r` to `PUBLIC_ROUTES`                   | S3    |
| `src/app/r/[token]/page.tsx`                                    | Public gate + report shell                    | S3/S4 |
| `src/app/r/[token]/gate.tsx` (+ action, + test)                 | Access Code gate + lockout                    | S3    |
| `src/lib/report-link-session.ts` (+ test)                       | Signed short-lived gate cookie                | S3    |
| `src/components/report-link/public-report.tsx` (+ test)         | Public wrapper over report sections           | S4    |
| `src/components/report-link/report-status.tsx` (+ test)         | Report Status strip                           | S4    |

Exact paths are the executer's call where a directory choice is reasonable; the
responsibilities and interfaces below are fixed.

## Interfaces (the contract every slice shares)

```ts
// src/services/types.ts
export interface ReportLinkStatus {
  clientId: string;
  url: string; // full /r/<token> URL (token re-copyable)
  createdAt: string;
  lastAccessedAt: string | null;
  active: boolean; // revoked_at is null
}
// issue/rotate return the raw code ONCE alongside the url:
export interface IssuedReportLink {
  url: string;
  accessCode: string;
}

// src/services/report-links.ts
export function issueReportLink(clientId: string): Promise<IssuedReportLink>;
export function rotateReportLink(clientId: string): Promise<IssuedReportLink>;
export function revokeReportLink(clientId: string): Promise<void>;
export function getReportLink(clientId: string): Promise<ReportLinkStatus | null>;
export function resolveReportLink(
  token: string,
  code: string,
): Promise<{ ok: true; clientId: string } | { ok: false; reason: "invalid" | "locked" }>;
```

```sql
-- public.report_links (S1)
create table if not exists public.report_links (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id),
  token             text not null unique,          -- 128-bit hex, stored as-is
  access_code_hash  text not null,                 -- crypt(code, gen_salt('bf'))
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id),
  revoked_at        timestamptz,
  last_accessed_at  timestamptz,
  failed_attempts   int not null default 0,
  locked_until      timestamptz
);
create unique index if not exists report_links_one_active_per_client
  on public.report_links (client_id) where revoked_at is null;
-- RLS: authenticated may SELECT; NO insert/update/delete (mutations via definer fns).
-- Functions (SECURITY DEFINER): issue_report_link(p_client_id) -> (token, access_code);
--   rotate_report_link(p_client_id) -> (token, access_code);
--   revoke_report_link(p_client_id) -> void;
--   resolve_report_link(p_token, p_code) -> uuid  (null on invalid/locked; updates
--     failed_attempts/locked_until/last_accessed_at; lockout e.g. 5 fails -> 15 min).
```

---

## Slice S1 — Report Links data model + functions + service seam

**Files:** the SQL pair + APPLY.md + `sql-sync.test.ts`; `report-links.ts` (+ test);
`types.ts`; `paths.ts` token helper.

**Interfaces produced:** the `report_links` table, the four definer functions, and
the five `report-links.ts` service functions above. S2 and S3 consume these.

- [ ] Write the SQL paste script `supabase/report-links.sql`: table, partial unique
      index, RLS (`authenticated` select only), and the four SECURITY DEFINER functions
      (token = `encode(gen_random_bytes(16),'hex')`; code = an 8-char unambiguous
      alphabet generated in SQL; `access_code_hash = crypt(code, gen_salt('bf'))`;
      `resolve` verifies with `crypt(p_code, access_code_hash) = access_code_hash`,
      resets/【increments】`failed_attempts`, sets `locked_until` past a threshold, stamps
      `last_accessed_at`). Make it safe to re-run (`if not exists`, `create or replace`).
- [ ] Copy it verbatim into a CLI migration `supabase/migrations/<ts>_report_links.sql`
      and add the pair to `PAIRS` in `supabase/sql-sync.test.ts`; run that test — it must
      pass (SQL-equal, comments stripped).
- [ ] Write `supabase/REPORT-LINKS-APPLY.md` (mirror `INGEST-WRITE-APPLY.md`): staff
      apply this SQL; the agent does not.
- [ ] Add `ReportLinkStatus` / `IssuedReportLink` to `types.ts`; add
      `paths.reportLink(token)` (and the `/r` base) to `paths.ts`.
- [ ] TDD `report-links.ts`: RED-first tests over a mocked Supabase/RPC seam (follow
      the existing service-test mock pattern) for each of issue/rotate/revoke/get/resolve
      — including `resolve` returning `{ok:false, reason:"invalid"}` and `"locked"`. The
      service functions call `supabase.rpc(...)`; `getReportLink` selects metadata only
      (NEVER `access_code_hash`).
- [ ] Gate green; SQL NOT applied by the agent; work uncommitted.

## Slice S2 — Staff management UI (Create / Rotate / Revoke)

**Depends on:** S1's service functions.
**Files:** `report-link-card.tsx` (+ test); mount on client detail; server actions.

- [ ] A "Report Link" card on the client detail page showing link state from
      `getReportLink(clientId)`: when none/revoked → a **Create client link** button;
      when active → the copyable URL, `created`/`last accessed`, and **Rotate** / **Revoke**.
- [ ] Server actions wrapping `issueReportLink` / `rotateReportLink` /
      `revokeReportLink`. On Create/Rotate, surface the **Access Code ONCE** (a "copy it
      now — it won't be shown again" affordance); never re-render the code afterward.
- [ ] TDD the card: shows Create when no active link; shows URL + Rotate/Revoke when
      active; renders the returned Access Code exactly once after Create/Rotate; a test
      asserts the code is not present on a plain re-render of an active link.
- [ ] Gate green; uncommitted.

## Slice S3 — Public route + Access Code gate + rate-limit

**Depends on:** S1's `resolveReportLink`.
**Files:** `route-access.ts` (add `/r`); `src/app/r/[token]/page.tsx`; `gate.tsx`
(+ action); `src/lib/report-link-session.ts` (+ test).

- [ ] Add the `/r` base to `PUBLIC_ROUTES` in `route-access.ts`; extend its test so
      `/r/<token>` is public and every other non-login route stays gated.
- [ ] `report-link-session.ts`: mint + verify a short-lived (≈2 h), signed, httpOnly
      gate cookie scoped to one token (HMAC over `{token, exp}` with a server secret from
      `env`). TDD sign/verify/expiry/tamper.
- [ ] `/r/[token]/page.tsx`: if a valid gate cookie for this token exists → render the
      report view (S4); else render `gate.tsx`. Emit `noindex` + `Referrer-Policy:
no-referrer` for the route.
- [ ] `gate.tsx` + its server action: on submit call `resolveReportLink(token, code)`;
      `ok` → set the gate cookie, redirect to the view; `invalid` → generic error (never
      reveal which of URL/code was wrong); `locked` → a "try again later" message. Add a
      belt-and-suspenders app-layer attempt limit in addition to the DB lockout.
- [ ] TDD the action/gate: wrong code → error + no cookie; correct code → cookie set;
      locked → lockout message. (Pure logic tested directly; the RPC seam mocked.)
- [ ] Gate green; uncommitted.

## Slice S4 — Client report view + Report Status strip

**Depends on:** S3's gated shell (stub the gate in tests).
**Files:** `public-report.tsx` (+ test); `report-status.tsx` (+ test); wire into
`/r/[token]/page.tsx`.

- [ ] `public-report.tsx`: given a resolved `clientId`, call the existing
      `buildClientReport` (NO new analytics read) and render the report **sections**
      (Key performance, Engagement trends incl. the fixed weekday chart, Posting cadence,
      Content mix, Content composition) inside a public wrapper that OMITS staff chrome
      (`ClientTabs`, the staff back-link, the staff print button) and softens the
      truncation banner (omit or reword to plain client language). Keep the period picker.
- [ ] `report-status.tsx` — the **Report Status** strip: freshness (`current as of`
      = latest Upload's scrape/capture date; `tracked since` = earliest Upload) + a plain
      **non-graded** activity/trend line (from `cadence`: last-post age, posts in last 30
      days; impressions trend _direction_ vs the prior period). Reuse figures already on
      the report; assert NO "best/optimal/score/grade" wording (grep guard).
- [ ] TDD both: the wrapper renders the sections and NOT `ClientTabs`/staff chrome;
      the status strip renders freshness + activity and contains no grade/score/advice
      word; the empty/low-N states render honestly.
- [ ] Gate green; uncommitted.

## Self-Review

- **Spec coverage:** every decision from the grilling (access model, liveness,
  "status", security posture, management model, naming) maps to a slice: access
  model + read path → S1/S3; liveness → S4 (live `buildClientReport`); status → S4;
  security (URL+code, hash, lockout) → S1/S3; management → S2; naming → CONTEXT.md +
  types/paths in S1. ✔
- **No placeholders:** interfaces, DDL, function names, and cookie design are concrete
  above; each slice's steps carry the actual behaviour to build. ✔
- **Type consistency:** `ReportLinkStatus` / `IssuedReportLink` / the five service
  fns / the four SQL functions are named identically in the Interfaces block and in
  every slice that references them. ✔
- **Open follow-ups (out of scope, flagged not built):** optional link expiry;
  multiple named links per Client; a client-appropriate PDF download; audit log of
  accesses beyond `last_accessed_at`. Each is additive and deferred.
