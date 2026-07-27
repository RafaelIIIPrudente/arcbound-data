# Handoff — Connection Count: trim the derived per-1K figures to a raw count

- **Type:** Executer handoff (revision pass on the Connection Count slice)
- **Date:** 2026-07-27
- **Branch:** `feat-outreach-system-dashboard` (⚠️ NOT the branch named in the
  original handoff — that one was merged into `main` via PR #14, `25ec072`)
- **Status:** Ready to run. Follows the built-but-uncommitted Connection Count
  slice ([handoff](2026-07-27-linkedin-connection-count.md)).
- **Shaping:** [decision doc](../decisions/2026-07-27-multi-service-dashboard-and-connection-count.md).

## Decision & rationale

The first pass mirrored Follower Count's **derived per-1K figures** for
connections, because followers reach the client Report only as the denominator of
a ratio. Bryan ruled that too much: **connections is a raw count everywhere, and
no per-1K connections figure exists on any surface.**

Because `perThousandConnections` was the ONLY path by which connections reached
the client Report and the public Report Link, simply deleting it would have made
connections staff-only. Bryan's ruling: **replace it with a plain raw
"Connections" count figure**, so connections stays present client-facing without
the invented math. Followers keep their per-1K figure; the asymmetry is
intentional and accepted.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class TypeScript/React engineer doing a SUBTRACTIVE revision: you
remove a derived metric cleanly, without weakening the honesty guarantees around
it, and you never let a point-in-time count masquerade as an all-time average. You
read before you write; ⚠️ comments in this repo are binding; you write failing
tests first; you never widen scope silently; you report with real command output.

GOAL
Remove the derived "per 1,000 connections" figures everywhere, and re-present
connections in the client Report + public Report Link as a RAW connection COUNT.
Connections must remain visible on every surface it currently appears on — only
its FORM changes (ratio → raw count), and only in the report; the comparison table
simply loses its derived column.

CONTEXT — read FIRST:
- AGENTS.md, CONTEXT.md (the "Connections" term: optional at capture; a missing
  value is a GAP, never 0).
- `docs/handoffs/2026-07-27-linkedin-connection-count.md` — the slice this
  revises. It is BUILT and UNCOMMITTED in the tree; the gate is green (72 files /
  899 tests).
- ⚠️ BRANCH: you are on `feat-outreach-system-dashboard`. The original handoff
  named `feat-additonal-features-for-linkedin-report`; that was merged into main
  (PR #14, 25ec072). STAY on the current branch. Commit NOTHING.
- Follower Count keeps its per-1K figure. Do NOT touch follower logic, copy, or
  numbers. The follower/connection asymmetry is INTENTIONAL — do not "restore
  symmetry."

STEPS — TDD throughout (RED first):
1. Comparison table — DELETE the derived column, KEEP the raw one.
   • `src/services/analytics.ts`: remove `interactionsPer1KConnections` (it
     appears ~3x — the per-client compute ~line 506, the medians ~line 518, and
     the empty/degraded shape ~line 542) and its type field. KEEP the raw
     `connections` field and its median.
   • `src/components/dashboard/analytics/client-comparison.tsx`: remove the
     `interactionsPer1KConnections` metric entry (~line 158), its member of the
     column-key union (~line 82), and its median cell (~line 341). KEEP the
     `metric("connections", "Connections", …)` column. The table returns to 6
     columns.
   • ⚠️ The ⚠️ comment above the connection pair ("THE CONNECTION PAIR SITS AFTER
     THE FOLLOWER PAIR…") describes a pair that no longer exists — rewrite or
     remove it. Do not leave a comment that lies.
   • KEEP the separate `connectionsUnavailable` notice/flag, but re-word it: it
     must now describe only the Connections column degrading (not "Connections
     and Per 1K"). Verify its test still asserts the real sentence.
2. Client Report — ratio → RAW COUNT.
   • `src/services/types.ts` (~line 713): replace the `perThousandConnections:
     ReportFigure` field with a raw-count field (suggested name: `connections`).
     REWRITE its ⚠️ doc comment: it currently justifies a ratio and says "never
     derived from the follower count" — keep that last guarantee, drop the
     per-1K framing.
   • `src/services/client-report.ts` (~line 503): replace the
     `perThousandConnections` construction with the raw count. The value is the
     `connections` already destructured from `BuildOptions` (~line 305) — do NOT
     recompute it and do NOT pass it through `perThousandOf`.
     ⚠️ `approximate: true` was correct for the ratio; it is WRONG for a raw
     count. A captured count is exact. Drop the approximation mark.
     ⚠️ HONESTY: `connections` is sourced (~line 630) from
     `uploads.find(u => u.connectionsCount != null)` — the newest upload that
     CARRIES a count, which may be OLDER than the latest scrape. The label must
     not imply "right now" more than the data supports. Prefer a plain
     "Connections" label; if you add any "as of" qualifier, it must reflect that
     upload's date, not the report period.
     `value: null` remains the ORDINARY case (optional at capture, no backfill)
     and must still render as an em dash.
   • `src/components/dashboard/report/key-performance.tsx` (~lines 99, 149):
     ⚠️ THE SUBTLE PART. The raw count currently would render through
     `AverageLine`, which appends "· all time" and an `ApproxMark`. A
     point-in-time count is NOT an all-time average and NOT approximate — that
     rendering would be a lie. Render the connection count so it carries neither
     the "· all time" suffix nor the approximation mark. Keep `perThousandFollowers`
     on `AverageLine` exactly as it is.
     ⚠️ PRESERVE the existing guarantee in the comment there: the connection line
     is ALWAYS PRESENT even when it is an em dash, so a reader can tell "we don't
     measure this" from "this report happens not to show it." Write a test that
     fails if the line is hidden when the value is null.
3. Public Report Link — `src/components/report-link/public-report.tsx` already
   computes the raw `connections` (~line 76 `latestCount(...)`), so the value is
   plumbed. Verify the client-facing view still SHOWS a connections figure after
   the change, and that an absent count renders as a gap. Fix the fixtures in
   `public-report.test.tsx` and `report-status.test.tsx` (they carry a
   `perThousandConnections` shape at ~line 54).
4. Sweep: `grep -rn "perThousandConnections\|interactionsPer1KConnections\|Per 1K connections\|per 1,000 connections" src` must return NOTHING when you are done
   (including test fixtures and comments).

ACCEPTANCE
- No per-1K/per-1,000 connections figure exists anywhere (grep in step 4 is empty).
- The comparison table shows a raw Connections column and is back to 6 columns;
  the `connectionsUnavailable` notice still exists and its wording matches reality.
- The client Report AND the public Report Link each show a RAW connections count;
  it is NOT marked approximate and NOT labelled "all time"; an absent count is an
  em dash and the line is still rendered.
- Follower Count — including `perThousandFollowers` and every follower number,
  chart, and sentence — is byte-for-byte unchanged in behaviour.
- Test count may legitimately go DOWN (a metric was removed). No REMAINING
  assertion weakened, and every honesty test (gap ≠ 0, no follower substitution,
  line always present) still passes.

VERIFICATION (the whole gate — nothing else)
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output pasted.
- Mutation table (real runs): (a) mark the raw connection count `approximate: true`
  → an "is not marked approximate" test fails; (b) hide the connection line when
  the value is null → the "always present" test fails; (c) coerce a missing
  connections to 0 in the report → the gap test fails.
- NO Claude-in-Chrome / dev-server walk.

GUARDRAILS
- READ THE ACTUAL GIT STATE AT START and report it. Stay on
  `feat-outreach-system-dashboard`; never commit to `main`; SURFACE (never
  self-heal) any unexpected commit. LEAVE ALL WORK UNCOMMITTED.
- Do NOT touch the SQL, the migration, the `uploads.connections_count` column, the
  capture form, Upload History, or the trend chart — the raw count plumbing is
  correct and stays. This pass is presentation-layer only (plus the analytics
  compute for the removed column).
- Do NOT alter Follower Count logic or copy. Do NOT restore symmetry.
- If a change needs a file outside this scope, STOP and FLAG.

SCOPE — modify ONLY: `src/services/analytics.ts` (+test),
`src/components/dashboard/analytics/client-comparison.tsx` (+test),
`src/services/types.ts`, `src/services/client-report.ts` (+test),
`src/components/dashboard/report/key-performance.tsx` (+test),
`src/components/report-link/public-report.tsx` (+test),
`src/components/report-link/report-status.test.tsx`,
`src/components/dashboard/report/print/print-report.test.tsx` (fixtures only).

REPORT BACK
- Git state at start; files changed; final `git status --porcelain`.
- The step-4 grep output (must be empty).
- How the raw connection count is rendered WITHOUT the "all time" suffix and
  WITHOUT the approximation mark, and the test that proves the line is still
  present when the value is null.
- Full gate output + mutation table (real runs); test count before/after (a
  DECREASE is expected and fine — say why).
- FLAGS: anything you stopped short of; whether the report reads well with a raw
  count sitting beside a follower AVERAGE (they are different kinds of figure —
  say if that looks wrong on the page).
```

## Feedback & revisions

- **2026-07-27 — v1 (authored).** After the first pass shipped derived per-1K
  connections figures, Bryan ruled: raw count only, no derived ratios. Because
  `perThousandConnections` was connections' ONLY route into the client-facing
  report, the trim is paired with re-presenting it as a raw count so connections
  stays client-visible. Carries the two traps the planner verified in the code:
  the raw count must NOT reuse `AverageLine` ("· all time" + approximation mark),
  and its source upload may be older than the latest scrape.
  _(Append dated entries as the executer reports back.)_
