# Handoff — Report Links S4: client report view + Report Status strip

- **Type:** Executer handoff (feature slice, S4 of 4)
- **Date:** 2026-07-25
- **Branch:** the Report Links feature branch created in S1
- **Status:** Run AFTER S3 lands (the gated shell). Stub the gate in tests if needed.
- **Brief:** [spec §Slice S4](../specs/2026-07-25-client-report-links.md) + [ADR 0011](../adr/0011-client-report-links.md).

## Decision & rationale

Behind the gate, render the Client's LIVE report — reusing the existing report sections
(already single-Client, leak-free) inside a public wrapper that strips staff chrome and
softens internal diagnostics — topped by the **Report Status** strip (freshness +
non-graded activity/trend). No new analytics read; reuse `buildClientReport`.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class React + TypeScript engineer with the honesty discipline this repo
lives by: you describe state, never grade it; you show what the data supports and
disclose what it can't; and on a client-facing page you never leak staff-only chrome,
internal diagnostics, or another Client's data. You read before you write; ⚠️ comments
bind; RED-first for the pure/status logic; no silent scope widening; real command output.

GOAL
Implement Slice S4: the public client report VIEW rendered behind the S3 gate — the
existing report sections in a public wrapper + a Report Status strip — over the Client's
live data.

CONTEXT — read FIRST:
- `docs/specs/2026-07-25-client-report-links.md` §"Global Constraints" + §"Slice S4" —
  your step brief.
- `docs/adr/0011-client-report-links.md` — live (not snapshot); Report Status is
  descriptive, never a grade; read-only single-Client payload.
- `CONTEXT.md` — Report Status definition.
- `src/app/(app)/clients/[id]/report/page.tsx` — the staff report page: the SAME section
  components you reuse (Key performance, Engagement trends incl. the fixed weekday chart,
  Posting cadence, Content mix, Content composition) and the STAFF CHROME you must OMIT
  (`ClientTabs`, the staff back-link, the staff print button, and the raw
  `AnalyticsTruncated` banner).
- `src/services/client-report.ts` — `buildClientReport(...)`; reuse it, add NO analytics
  read. It already reads uploads (for freshness) and rows (for cadence/trend).
- `src/app/r/[token]/page.tsx` AS COMMITTED by S3 — where the resolved `clientId` comes
  from; wire this view in behind the gate.

KEY REQUIREMENTS:
- `public-report.tsx`: given a resolved `clientId`, call `buildClientReport` and render
  the report SECTIONS inside a wrapper that OMITS all staff chrome above; keep the period
  picker; the truncation state is either omitted or reworded into plain client language
  (no "read X of Y" dev-tell).
- `report-status.tsx` — the Report Status strip: freshness (`current as of` = latest
  Upload's scrape/capture date; `tracked since` = earliest Upload) + a plain NON-GRADED
  activity/trend line (from `cadence`: last-post age + posts in last 30 days; impressions
  trend DIRECTION vs the prior period). Reuse figures already computed; add no new read.
- FOUR-STATE honesty at low N: no data → an honest empty view; undated/low-N handled as
  the report already does. NO "best/optimal/score/grade/recommended" anywhere (grep guard
  in a test).

SCOPE — create/modify ONLY: `src/components/report-link/public-report.tsx` (+ test),
`src/components/report-link/report-status.tsx` (+ test), and the wiring inside
`src/app/r/[token]/page.tsx` to render the view behind the gate. Do NOT touch the S1
service/SQL, S2 staff UI, the S3 gate logic, the staff report page, or the report section
components themselves (reuse them unchanged). If a change needs a file outside this, STOP
and FLAG.

APPROACH — skills: `test-driven-development` (Report Status logic + wrapper composition
RED-first); `verification-before-completion`. Follow the spec's S4 checklist.

ACCEPTANCE
- The view renders the report sections and the Report Status strip; a test asserts
  `ClientTabs`/staff back-link/staff print button are ABSENT and no "read X of Y" banner
  shows.
- Report Status shows freshness + activity and contains NO grade/score/advice word
  (grep-guarded). Empty/low-N states render honestly.
- No new analytics DB read (reuses `buildClientReport`). Test count strictly up; no
  existing assertion weakened; the staff report page is unchanged.

VERIFICATION
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output.
- Mutation table (real runs): (a) render `ClientTabs` in the wrapper → the "no staff
  chrome" test fails; (b) add a grade/score word to the status strip → the grep-guard
  test fails; (c) date the status trend by `effectiveMs`/scrape instead of the report's
  basis → the dating test fails.
- No Claude-in-Chrome / dev-server walk — assert through component markup. The view is
  text + existing charts; reason about print/page behaviour, don't render a PDF.

GUARDRAILS
- READ THE GIT STATE AT START and report it; stay on the Report Links feature branch;
  never commit to `main`; SURFACE unexpected commits; build additively on S1–S3.
- LEAVE ALL WORK UNCOMMITTED. Never leak cross-Client data or staff chrome; never grade.
- Conventional Commits only if later asked; keep the tree green.

REPORT BACK
- Git state at start; files changed; final `git status --porcelain`.
- What the wrapper omits vs keeps; the exact Report Status wording (freshness + activity)
  and confirmation it contains no grade/advice term.
- Gate output + mutation table; test count before/after.
- FLAGS: how you handled truncation for clients; whether a client PDF download is wanted
  (deferred by the spec); anything you stopped short of.
```

## Feedback & revisions

- **2026-07-25 — v1 emitted.** Authored from the spec; to run after S3. Verify S3's
  committed gate/`clientId` wiring before running.
  _(Append dated entries as feedback arrives; edit the prompt in place if revised.)_
