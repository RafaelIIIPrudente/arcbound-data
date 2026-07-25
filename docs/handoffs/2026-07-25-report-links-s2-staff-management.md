# Handoff — Report Links S2: staff management UI (Create / Rotate / Revoke)

- **Type:** Executer handoff (feature slice, S2 of 4)
- **Date:** 2026-07-25
- **Branch:** the Report Links feature branch created in S1
- **Status:** Run AFTER S1 lands — needs S1's `report-links.ts` service functions. Verify
  against S1's ACTUALLY-committed signatures at write time.
- **Brief:** [spec §Slice S2](../specs/2026-07-25-client-report-links.md) + [ADR 0011](../adr/0011-client-report-links.md).

## Decision & rationale

A "Report Link" card on the client detail page: Create the one active link, copy its
URL, see the Access Code ONCE, and Rotate/Revoke. Server actions wrap the S1 service.
The Access Code is hashed at rest, so it is surfaced exactly once and never re-rendered.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class Next.js (App Router) + React + TypeScript engineer who treats a
one-time secret as one-time: you surface it exactly when it is generated, make it easy
to copy, and never re-render it afterward. You read before you write; ⚠️ comments bind;
RED-first; no silent scope widening; real command output.

GOAL
Implement Slice S2: a staff-facing "Report Link" card on the client detail page to
Create / Rotate / Revoke a Client's single Report Link, via server actions over the S1
service seam.

CONTEXT — read FIRST:
- `docs/specs/2026-07-25-client-report-links.md` §"Global Constraints" + §"Slice S2" —
  your step brief.
- `docs/adr/0011-client-report-links.md` — the decision (Report Link is a capability,
  not a user; Access Code shown once).
- `AGENTS.md`, `CONTEXT.md` (vocabulary).
- `src/services/report-links.ts` AS ACTUALLY COMMITTED by S1 — use its real
  `issueReportLink` / `rotateReportLink` / `revokeReportLink` / `getReportLink`
  signatures; if they differ from the spec, follow the committed code and FLAG the drift.
- The existing client detail page + its section/card components for the layout idiom
  and how server actions are wired there.

KEY REQUIREMENTS:
- Card reads state via `getReportLink(clientId)`: none/revoked → a **Create client
  link** button; active → the copyable URL, `created` + `last accessed`, and **Rotate**
  / **Revoke**.
- Server actions wrap issue/rotate/revoke. Create/Rotate return the raw Access Code —
  render it ONCE with a clear "copy now, it won't be shown again" affordance; a plain
  re-render of an active link must NOT contain the code.
- Revoke needs a confirm affordance (it kills the client's live link). Do NOT trigger a
  native `confirm()` dialog — use an inline confirm UI.
- No new service functions; no DB read outside the S1 seam.

SCOPE — create/modify ONLY: `src/components/dashboard/client/report-link-card.tsx`
(+ its test), the client detail page/segment that mounts it, and (if a server-actions
file is the local pattern) that actions file. Do NOT touch the S1 service/SQL, the
public route, middleware, or other client screens. If a change needs a file outside
this, STOP and FLAG.

APPROACH — skills: `test-driven-development` (component + action states RED-first);
`verification-before-completion`. Follow the spec's S2 checklist.

ACCEPTANCE
- Card shows Create when there is no active link; shows URL + Rotate/Revoke when active.
- The Access Code renders exactly once after Create/Rotate; a test asserts it is ABSENT
  on a normal render of an active link.
- Copy affordances for URL and code. Revoke uses inline (not native-dialog) confirm.
- Test count strictly up; no existing assertion weakened.

VERIFICATION
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output.
- Mutation table (real runs): (a) render the code on the active-link view → the
  "code absent on re-render" test fails; (b) drop the revoke confirm → its test fails.
- No Claude-in-Chrome / dev-server walk — assert through component markup + action logic.

GUARDRAILS
- READ THE GIT STATE AT START and report it; stay on the Report Links feature branch;
  never commit to `main`; SURFACE unexpected commits; build additively on S1.
- LEAVE ALL WORK UNCOMMITTED.
- Conventional Commits only if later asked; keep the tree green.

REPORT BACK
- Git state at start; files changed; final `git status --porcelain`.
- How the one-time Access Code is surfaced and proven absent on re-render.
- Gate output + mutation table; test count before/after.
- FLAGS: any drift from S1's committed signatures; anything you stopped short of.
```

## Feedback & revisions

- **2026-07-25 — v1 emitted.** Authored from the spec; to run after S1. Verify S1's
  committed service signatures before running.
  _(Append dated entries as feedback arrives; edit the prompt in place if revised.)_
