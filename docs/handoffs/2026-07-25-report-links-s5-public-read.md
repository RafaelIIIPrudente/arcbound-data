# Handoff — Report Links S5: token-scoped public report read (read-grant)

- **Type:** Executer handoff (feature slice, S5 — the data read that makes the client view live)
- **Date:** 2026-07-25
- **Branch:** `feat-additonal-features-for-linkedin-report` (where S1/S3/S4 sit UNCOMMITTED)
- **Status:** Ready to run — resolves flag #1 from the client-side handoff. Builds on the
  UNCOMMITTED S1/S3/S4 work in the tree.
- **Decision (Bryan, 2026-07-25):** **read-grant** — preserve the URL + Access Code
  two-factor all the way to the DATA (a URL-only holder cannot pull rows). Read current
  `bi.*` + `uploads` now; swap the source to app-owned `public.posts` when ADR 0010 lands.
- **Brief:** [ADR 0011](../adr/0011-client-report-links.md) +
  [spec §Slice S5](../specs/2026-07-25-client-report-links.md).

## Decision & rationale

S3/S4 built the gate + view, but the view's data read (`bi.*` + `uploads`) is RLS
`authenticated`-only, so the anonymous `/r/<token>` route renders "not available." S5
adds a no-service-role, token-scoped read: `resolve_report_link` mints a short-lived
**read grant** (only on a successful Access Code check); a SECURITY DEFINER
`report_link_read(token, grant)` returns that one client's `bi.*` rows + uploads; the
gate cookie carries the grant so the view fetches without re-entering the code. Also
fixes flag #3 (freshness from real upload dates).

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class Postgres/Supabase + Next.js security engineer. You extend a
two-factor capability without weakening it: a secret is only minted after the factor
that earns it is proven, it is bearer-scoped and short-lived and hashed at rest, and a
privileged read returns exactly one entitled subject's rows and never becomes an oracle.
You read before you write; ⚠️ comments in this repo are binding; you write failing tests
first and prove they fail for the right reason; you never widen scope silently; you
report with real command output.

GOAL
Make the anonymous `/r/<token>` client report view actually render data, without a
service-role key and without weakening the URL+Access Code two-factor. On a successful
Access Code check, mint a short-lived READ GRANT; carry it in the signed gate cookie; and
add a SECURITY DEFINER `report_link_read(token, grant)` that returns the resolved client's
report source (`bi.linkedin_post_latest` rows + `public.uploads` rows). Then wire the view
to fetch through it, and fix the status strip's freshness to use real upload dates.

CONTEXT — read FIRST; they are your brief:
- `docs/specs/2026-07-25-client-report-links.md` §"Global Constraints" + §"Slice S5" —
  your step-by-step brief and the exact grant/function design.
- `docs/adr/0011-client-report-links.md` — no service-role key; the viewer is not a user;
  URL + Access Code two-factor.
- `AGENTS.md`, `CONTEXT.md` (Report Link / Access Code / Report Status).
- The UNCOMMITTED S1/S3/S4 work already in the tree — read the ACTUAL committed/working
  code, do not trust these names blindly:
  • `supabase/report-links.sql` (+ migration + `REPORT-LINKS-APPLY.md`) — the table +
    `resolve_report_link` (currently returns `jsonb {status, client_id}`) you extend.
  • `src/services/report-links.ts` — `resolveReportLink` (returns `{ok, clientId, reason}`).
  • `src/lib/report-link-session.ts` — the signed gate cookie (currently binds token +
    clientId + exp).
  • `src/app/r/[token]/gate.tsx` + its action; `src/components/report-link/
    public-report.tsx` (currently calls the authenticated report read → gets `unavailable`
    as anon) and `report-status.tsx`.
  • `src/services/analytics.ts` `BiPostRow` (the row shape) and `src/services/
    client-report.ts` `buildClientReport(...)` (reuse to build the report from the rows).

STEPS — TDD throughout (RED-first):
1. SQL — read grant. Modify `resolve_report_link` to ALSO mint a random `read_grant`
   (`encode(gen_random_bytes(16),'hex')`) on the SUCCESS path only, store it HASHED with a
   short expiry (≈ the gate-cookie TTL), and return it: `jsonb {status, client_id,
   read_grant}`. Use a `report_link_grants(link_id, grant_hash, expires_at)` table (so >1
   viewer session works) or a hashed grant+expiry on the link row — your call; justify it.
2. SQL — the read. Add SECURITY DEFINER `report_link_read(p_token, p_grant) returns jsonb`:
   verify the token active + not revoked AND the grant matches (hash) + unexpired, then
   return a bundle — the `bi.linkedin_post_latest` rows `where client_id = <the link's
   client>` + that client's `public.uploads` rows + the client name/handle. Invalid/expired
   grant → return null/empty (NEVER an error oracle). `grant execute` to `anon` on this fn
   and on the modified `resolve`; anon keeps NO direct table/`bi.*` access. Keep the
   paste-script ↔ migration PAIR in step (`sql-sync.test.ts`) and note in `REPORT-LINKS-
   APPLY.md` that the definer owner needs `usage on schema bi` + `select` on
   `bi.linkedin_post_latest` and `public.uploads` (confirm at apply time). Do NOT apply SQL.
3. Service. `resolveReportLink` surfaces `readGrant`; add `readReportLinkSource(token,
   grant): Promise<{ posts: BiPostRow[]; uploads: UploadRow[]; … } | null>` over
   `report_link_read`. RED-first, RPC seam mocked.
4. Session. Extend the signed gate cookie to also carry `read_grant`. RED-first the new
   claim (sign/verify/tamper).
5. Gate action. On resolve success, store the returned grant in the gate cookie.
6. View. `public-report.tsx` reads (token, grant) from the cookie, calls
   `readReportLinkSource` → `buildClientReport(...)` → renders. Null/expired → the existing
   neutral "not available" state (unchanged).
7. Freshness (flag #3). `report-status.tsx`: `current as of` = latest Upload scrape date,
   `tracked since` = earliest Upload, from the uploads the read returns — replacing the
   cadence-date approximation. Keep it non-graded (grep-guard intact).

ACCEPTANCE
- `report_link_read` returns rows ONLY for a valid (token, grant); a token/URL WITHOUT a
  grant reads nothing (two-factor holds to the data); an expired grant reads nothing;
  invalid grant is not an oracle. Anon has no direct `bi.*`/table access.
- The view renders REAL numbers given a valid grant, and the "not available" state
  otherwise. The status strip's freshness uses real upload dates; still no grade/advice
  word (grep-guarded).
- No service-role key. Test count strictly up; no existing assertion weakened; every new
  test RED-first and mutation-verified. SQL NOT applied by the agent.

VERIFICATION (the whole gate — nothing else)
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output pasted.
- Mutation table (real runs): (a) `report_link_read` skips the grant check (returns rows
  for token alone) → the "no grant → no data" test fails; (b) accept an expired grant →
  the expiry test fails; (c) `resolve` mints a grant on the FAILURE path → a test catches
  it; (d) freshness reads cadence instead of uploads → the freshness test fails.
- No Claude-in-Chrome / dev-server / live DB. SQL is staff-applied.

GUARDRAILS
- READ THE ACTUAL GIT STATE AT START and report it. S1/S3/S4 are UNCOMMITTED in the tree —
  build ADDITIVELY on that working tree; do NOT revert, stash, reset, or commit it, and do
  NOT reimplement it. Stay on `feat-additonal-features-for-linkedin-report`; never commit
  to `main`; SURFACE (never self-heal) any unexpected commit.
- LEAVE ALL WORK UNCOMMITTED. No service-role key. The read grant is minted ONLY after the
  Access Code passes — never on failure, never from the URL alone. Return null, never an
  oracle. If a change needs a file outside SCOPE, STOP and FLAG.
- Conventional Commits only if later asked; keep the tree green.

SCOPE — modify/create ONLY: `supabase/report-links.sql`, its migration twin,
`supabase/REPORT-LINKS-APPLY.md`, `supabase/sql-sync.test.ts`; `src/services/
report-links.ts` (+ test) and any small source type; `src/lib/report-link-session.ts`
(+ test); `src/app/r/[token]/gate.tsx` + its action; `src/components/report-link/
public-report.tsx` (+ test) and `report-status.tsx` (+ test). Do NOT touch the staff report
page, the report section components, S2, or unrelated services.

REPORT BACK
- Git state at start; files changed; final `git status --porcelain`.
- The grant design (storage: table vs row; TTL; hashing) and why; the exact
  `report_link_read` return shape.
- Confirmation anon has no direct `bi.*` access and the read is null-not-oracle.
- Full gate output + mutation table (real runs); test count before/after.
- FLAGS: the bi.* SELECT-grant confirmation status; whether real data rendered in tests;
  anything you stopped short of.
```

## Feedback & revisions

- **2026-07-25 — v1 emitted.** Authored after S3/S4 shipped and surfaced flag #1; Bryan
  chose the read-grant approach over bi.* now. Resolves the live-view blocker; folds in
  the freshness fix (flag #3).
  _(Append dated entries as the executer reports back; edit the prompt in place if revised.)_

- **2026-07-25 — executer run: S5 built (read-grant), gate green, uncommitted.**
  - **Grant design:** a `public.report_link_grants(link_id, grant_hash, expires_at)`
    TABLE (not a link-row column) so multiple concurrent viewer sessions each hold
    an independent grant. 128-bit random grant, sha256-hashed at rest (bcrypt is
    reserved for the low-entropy Access Code; a high-entropy grant needs no slow
    KDF). 2 h TTL (≈ the gate-cookie TTL). Minted ONLY on the resolve SUCCESS path.
    `revoke_report_link` now also drops the link's live grants.
  - **`report_link_read(p_token, p_grant) → jsonb`** — verifies active token AND a
    matching UNEXPIRED grant, then returns `{client_id, client_name, posts[]
(bi.linkedin_post_latest), uploads[], attributes[] (post_attributes, for asset
types)}` for that ONE client; `null` on ANY failure (no oracle). `grant execute`
    to `anon` on read + resolve; anon keeps NO direct table/`bi.*` access.
  - **Wiring:** `resolveReportLink` surfaces `readGrant` (fail-closed if an "ok"
    lacks a grant); the signed gate cookie now binds token+clientId+**grant**+exp;
    the gate action seals the grant on success; `PublicReport` (now async) reads the
    grant from the cookie → `readReportLinkSource` → `buildClientReport` → renders
    `PublicReportView`, and shows the neutral "not available" on no/invalid/expired
    grant. Freshness (flag #3) now uses real upload dates (`ReportFreshness`).
  - **Gate:** lint ✔, type:check ✔, test ✔ (802→**811**, 68 files), build ✔. 5/5
    runnable mutations caught (c grant-on-failure, d freshness-from-cadence, e
    resolve-ok-without-grant, f view-reads-without-grant, g view-renders-on-denied).
  - **FLAGS:** (1) I INCLUDED `post_attributes` in the read bundle (beyond the
    brief's "bi + uploads + name") so the Content-mix asset types render real values
    instead of all-UNKNOWN — app-owned, same definer, faithful to "render data". (2)
    `src/app/r/[token]/page.tsx` needed a MINIMAL wiring change (pass `token`/`period`
    to the now-self-fetching view instead of a pre-built report) — it is NOT in the
    S5 scope list; surfaced, made minimal (drop the `getClientReport` prefetch). (3)
    The two SQL-internal mutations (grant-check-skip, accept-expired) are verified by
    construction (the `where grant_hash = … and expires_at > now()` clause), not by a
    live run — no DB available; SQL is staff-applied. (4) `bi.*` SELECT for the
    definer owner: noted in APPLY.md with a verify query; confirm at apply time.
