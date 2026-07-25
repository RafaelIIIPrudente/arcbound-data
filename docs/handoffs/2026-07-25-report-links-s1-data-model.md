# Handoff — Report Links S1: data model + functions + service seam

- **Type:** Executer handoff (feature slice, S1 of 4)
- **Date:** 2026-07-25
- **Branch:** off `main` (this is a new workstream — see Guardrails for branch note)
- **Status:** Ready to run — this is the UNBLOCKING slice (S2 and S3 depend on it).
- **Brief:** [ADR 0011](../adr/0011-client-report-links.md) +
  [spec §Slice S1](../specs/2026-07-25-client-report-links.md) — the spec is the
  step-by-step brief; read it in full.

## Decision & rationale

Build the `public.report_links` capability table + its four SECURITY DEFINER
functions (issue / rotate / revoke / resolve-with-lockout) and the
`src/services/report-links.ts` seam over them. Token stored as-is (re-copyable
URL); Access Code stored only as a bcrypt hash (shown once). One active link per
Client. No service-role key; the SQL is applied by staff, not the agent.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class TypeScript + Postgres/Supabase engineer who treats a capability
token as a security boundary: you store secrets the way passwords are stored, you fail
closed, and you never let a public read path see more than the one row it is entitled
to. You read before you write; ⚠️ comments in this repo are binding; you write failing
tests first and prove they fail for the right reason; you never widen scope silently;
you report with real command output.

GOAL
Implement Slice S1 of the Client Report Links workstream: the `public.report_links`
table, its four SECURITY DEFINER functions, and the `src/services/report-links.ts`
service seam over them. This is the data + capability foundation the staff UI (S2) and
the public gate (S3) build on.

CONTEXT — read these FIRST, they are your full brief:
- `docs/specs/2026-07-25-client-report-links.md` — §"Global Constraints",
  §"Interfaces", and §"Slice S1" are your step-by-step instructions and the exact
  table DDL, function list, and TS signatures. Follow them; do not restate them.
- `docs/adr/0011-client-report-links.md` — the decision and its security rationale.
- `AGENTS.md` (stack + architecture rules) and `CONTEXT.md` (the pinned vocabulary:
  Report Link, Access Code, Report Status).
- Precedent to mirror: `supabase/ingest-write.sql` + `supabase/INGEST-WRITE-APPLY.md`
  (SECURITY DEFINER function + staff-applied SQL + the paste-script/migration pair),
  `supabase/sql-sync.test.ts` (the `PAIRS` array), and an existing
  `src/services/*.ts` + `*.test.ts` for the mocked-Supabase service-test pattern.

KEY REQUIREMENTS (verify against the spec; do not trust from memory):
- Table `public.report_links` exactly as the spec's DDL block: `token` stored as-is
  (`encode(gen_random_bytes(16),'hex')`), `access_code_hash = crypt(code,
  gen_salt('bf'))` (pgcrypto), lifecycle + `failed_attempts`/`locked_until` columns,
  and the PARTIAL UNIQUE INDEX on `client_id where revoked_at is null` (one active
  link per Client).
- RLS: `authenticated` may SELECT only; NO insert/update/delete policy — all mutation
  goes through the definer functions.
- Four SECURITY DEFINER functions: `issue_report_link(p_client_id) -> (token,
  access_code)`; `rotate_report_link(p_client_id) -> (token, access_code)` (revoke
  active + issue, atomic); `revoke_report_link(p_client_id)`; `resolve_report_link(
  p_token, p_code) -> uuid` — verifies with `crypt(p_code, access_code_hash) =
  access_code_hash`, returns NULL when revoked / locked / mismatched, increments
  `failed_attempts` and sets `locked_until` past a threshold (e.g. 5 fails → 15 min),
  resets them + stamps `last_accessed_at` on success.
- Deliver the SQL as a PAIR: `supabase/report-links.sql` (paste script) +
  `supabase/migrations/<ts>_report_links.sql` (identical), added to the `PAIRS` array
  in `supabase/sql-sync.test.ts`; that test must pass. Plus `supabase/
  REPORT-LINKS-APPLY.md`. Make the script safe to re-run (`if not exists`, `create or
  replace function`).
- `src/services/report-links.ts` exposes the five functions in the spec's Interfaces
  block (`issueReportLink`, `rotateReportLink`, `revokeReportLink`, `getReportLink`,
  `resolveReportLink`), each calling `supabase.rpc(...)`. `getReportLink` selects
  METADATA ONLY and must NEVER select `access_code_hash`.
- Add `ReportLinkStatus` / `IssuedReportLink` to `src/services/types.ts` and a
  `paths.reportLink(token)` helper (+ `/r` base) to `src/paths.ts`.

SCOPE — create/modify ONLY: `supabase/report-links.sql`,
`supabase/migrations/<ts>_report_links.sql`, `supabase/REPORT-LINKS-APPLY.md`,
`supabase/sql-sync.test.ts`, `src/services/report-links.ts` (+ `.test.ts`),
`src/services/types.ts`, `src/paths.ts`. Do NOT touch middleware, routes, UI, or any
other service. Do NOT run/apply the SQL against a database. If a change seems to need a
file outside this list, STOP and FLAG.

APPROACH — skills: `test-driven-development` (the service seam is pure over a mocked
Supabase client — RED-first each function, including `resolve` returning invalid vs
locked); `verification-before-completion` before done. Follow the spec's S1 checklist
in order.

ACCEPTANCE
- `report-links.sql` and its migration twin are byte-equivalent per `sql-sync.test.ts`
  (which passes); `REPORT-LINKS-APPLY.md` documents staff application.
- The service functions exist with the spec's signatures; `getReportLink` never reads
  `access_code_hash`; `resolveReportLink` maps failure to `{ok:false, reason:"invalid"
  |"locked"}`. Each is RED-first, mutation-verified.
- Test count strictly up; no existing assertion weakened.

VERIFICATION (the whole gate — nothing else)
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output pasted.
- Mutation table (real runs): (a) `getReportLink` selecting `access_code_hash` → a
  test forbids it and fails; (b) `resolveReportLink` not distinguishing locked from
  invalid → its test fails; (c) omitting the partial-unique-index line → note how you
  proved one-active-per-client (a service/SQL-shape test or a documented manual check,
  since the DB isn't applied here).
- Do NOT use Claude-in-Chrome / a dev server / a live DB. The SQL is NOT applied by you.

GUARDRAILS
- READ THE ACTUAL GIT STATE AT START and report it. This is a NEW workstream — branch
  off `main` (never commit to `main`); if the current branch is the additional-features
  branch, create a fresh feature branch for this work and SAY so. Build additively;
  SURFACE (never self-heal) any unexpected commit.
- LEAVE ALL WORK UNCOMMITTED for the user to review/commit.
- No Supabase service-role key anywhere. Secrets: Access Code hashed only; token stored
  as-is is intentional (useless without the code).
- Conventional Commits vocabulary only if later asked to commit; keep the tree green.

REPORT BACK
- Git state at start (and the branch you used, with reasoning); files changed; final
  `git status --porcelain`.
- The exact function signatures and the lockout threshold you chose.
- Gate output + the mutation table (real runs); test count before/after.
- FLAGS: confirmation the SQL was NOT applied by you and is staff-applied; any place
  `public.clients` FK/columns differed from the spec's assumption; anything you stopped
  short of.
```

## Feedback & revisions

- **2026-07-25 — v1 emitted.** Authored from the grilling design + ADR 0011 + the
  spec. Runnable immediately; unblocks S2/S3.
  _(Append dated entries as the executer reports back; edit the prompt in place if revised.)_
