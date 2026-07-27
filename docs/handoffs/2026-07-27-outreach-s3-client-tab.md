# Handoff — Outreach System S3: the Outreach client tab (current state)

- **Type:** Executer handoff (feature slice, S3 of the Outreach System workstream)
- **Date:** 2026-07-27
- **Branch:** `feat-outreach-system-dashboard`
- **Status:** Ready to run. Depends on **S1** (the seam). Independent of S2 — no
  file overlap — but do not run both in the same working tree simultaneously.
- **Brief:** [spec §S3](../specs/2026-07-27-outreach-system-dashboard.md) +
  [ADR 0012](../adr/0012-outreach-system-per-client-snapshots.md).

## Decision & rationale

The dashboard itself: a fourth client tab showing the latest snapshot as KPIs, a
funnel, and three breakdowns, with read-time canonicalisation of the dirty source
vocabularies.

The honesty crux, resolved here: **`Stage` records the furthest point a Prospect
reached, so its counts are TERMINAL, not cumulative** — `Requested 1,216` means
_still at_ Requested, and stacking those values would fabricate a funnel. The
source happens to carry four columns that each define one funnel step
unambiguously, so the funnel is built from those instead, and the Stage breakdown
is presented as what it is: where prospects currently stand.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class TypeScript/React engineer and a careful reader of messy
source data. You know the difference between a number the data supports and one
it merely suggests, and you would rather show four honest figures than six
flattering ones. You never let an unrecognised value vanish into an "other"
bucket. You read before you write; ⚠️ comments in this repo are binding; you write
failing tests first and prove they fail for the right reason; you never widen
scope silently; you report with real command output.

GOAL
Add the Outreach tab to the client detail screen: KPIs, a funnel, and three
breakdowns built from the latest Outreach Snapshot, plus the read-time vocabulary
module they depend on.

CONTEXT — read FIRST (do not restate; follow):
- `docs/specs/2026-07-27-outreach-system-dashboard.md` — §"Global Constraints",
  §"Source data" (REAL observed values and fill rates — trust them), §"Interfaces",
  §"Slice S3".
- `docs/adr/0012-outreach-system-per-client-snapshots.md`.
- `AGENTS.md`, `CONTEXT.md` (terms: Outreach System, Prospect, Outreach Snapshot,
  Stage — note Stage is explicitly "the furthest point reached", distinct from
  Connection Status).
- S1 IS BUILT AND IN THE TREE. Read `src/services/outreach.ts` for the ACTUAL
  signature of `latestSnapshot(clientId)` before wiring. It returns THREE states —
  unavailable / empty / ok — and on ok it carries `truncated` + `total`.
  ⚠️ All three states must render distinctly, and the truncated flag MUST be
  surfaced. "Could not be read" is not "no prospects", and a partial snapshot that
  renders as if complete would understate every figure on this page.
- PRECEDENTS TO MIRROR:
  • `src/components/dashboard/analytics/weekday-impressions-chart.tsx` — the house
    chart pattern (recharts + `ChartContainer`/`ChartConfig` from
    `@/components/ui/chart`) AND the comment discipline: a chart titled as a
    measurement, never a recommendation, with excluded rows disclosed rather than
    hidden.
  • `src/components/dashboard/analytics/analytics-unavailable.tsx` — the
    could-not-read state.
  • `src/app/(app)/clients/[id]/report/page.tsx` — a nested per-client server route.
  • `src/components/dashboard/client/client-tabs.tsx` — the tab bar you extend.

STEPS — TDD throughout (RED first; prove each test fails for the right reason):

1. Vocabulary — `src/lib/outreach-vocab.ts` (+ test). PURE. Read the spec's
   observed value lists first; they are real.
   • `canonicalReply(raw)` → a bucket. Build it from an EXPLICIT map of known
     values. Strip a trailing ISO date before matching, so the 8 rows reading
     "Replied 2026-07-13" / "Replied 2026-07-14" / etc. match "Replied" and bucket
     as replied-unspecified rather than as 8 unique statuses.
     ⚠️ ANYTHING NOT IN THE MAP RETURNS "unrecognised" AND IS REPORTED VERBATIM.
     Do NOT guess at meanings. In particular "Not Interested" (1 row) does NOT
     start with "Replied" — do not silently classify it as negative; let it fall
     to unrecognised and be disclosed. Guessing here would quietly invent data.
     ⚠️ "Replied - Interested" is likewise NOT in the Positive/Neutral/Negative
     trio; map it explicitly if you decide it belongs, and say so in REPORT BACK —
     but never map it implicitly by prefix-matching "Positive".
   • `canonicalStage(raw)` → trimmed known stage, else unrecognised (disclosed the
     same way).
   • `parseCount(raw: string | null): number | null` — for `Follow-up Count`,
     which is STORED AS TEXT by design (ADR 0009). Unparseable → null, never 0 and
     never NaN, so an unreadable count is disclosed rather than counted as zero.
   • Tests: every observed value from the spec maps as intended; a date-suffixed
     "Replied …" buckets as replied-unspecified; an invented value returns
     unrecognised; `parseCount("0")` is 0 and `parseCount("")`/`parseCount("n/a")`
     is null.

2. Analytics — `src/services/outreach-analytics.ts` (+ test). PURE, no I/O; takes
   the snapshot's prospect rows and returns `OutreachAnalytics` (add the type to
   `src/services/types.ts`).

   ⚠️ THE FUNNEL DOES NOT COME FROM `Stage`. `Stage` is the FURTHEST point a
   prospect reached, so its counts are TERMINAL ("still at Requested" = 1,216),
   and stacking them would fabricate a funnel that the data does not describe.
   Build each funnel step from the column that defines it unambiguously:
     • Sent            = rows with a non-empty `date_sent`            (~1,230)
     • Connected       = rows where `connection_status` is "Connected" (~217)
     • Replied         = rows whose canonicalReply is not no-reply     (~39)
     • Meetings booked = rows with a non-empty `meeting_booked_date`   (~8)
   ⚠️ These definitions are NOT interchangeable with the Stage tallies — Stage
   "Replied" is 25 while reply-status-derived replies are ~39, because they answer
   different questions. Do not reconcile them, do not average them, and label each
   figure with the column it came from so a reader can tell them apart.

   Also produce: `totalProspects`; the three breakdowns (connection status, reply
   status via canonicalReply, stage via canonicalStage) each as label+count;
   `unrecognisedReplyValues` / `unrecognisedStageValues` as verbatim string lists;
   and `sentOverTime` bucketed from `date_sent` with `undatedSent` counted-but-
   excluded.
   ⚠️ NO RATES, PERCENTAGES, SCORES, RANKINGS, OR BENCHMARKS. Descriptive counts
   only. Meetings booked is ~8 of ~1,230 — any "conversion rate" here reads as a
   verdict the sample cannot support, and the same no-score discipline already
   applied to cadence and the cross-client comparison binds this page.
   ⚠️ `date_sent` holds one outlier at "2020-12-04" against an otherwise-2026
   range. Do NOT silently drop it; either include it honestly or exclude it with a
   stated, tested rule. Silent filtering is the one option not available.

3. Route + tab.
   • `src/paths.ts`: add `clients.outreach(id) => /clients/${id}/outreach`.
   • `src/app/(app)/clients/[id]/outreach/page.tsx` — server component; read
     `latestSnapshot(client.id)` and render. Add a `loading.tsx` matching the
     sibling routes.
   • `client-tabs.tsx`: append `{ href: paths.clients.outreach(clientId), label:
     "Outreach" }`. ⚠️ Its `isActive` is an EXACT pathname match and the file
     warns that no href may be a prefix of another — verify the new path satisfies
     that and that no existing tab lights up on it.
   • `nav-config.ts` `resolvePageTitle`: add the outreach case. ⚠️ ORDERING TRAP —
     the generic `startsWith(paths.clients.list + "/")` rule returns "Client
     detail" and will SWALLOW the new route unless the outreach case is matched
     BEFORE it, exactly as the `/report` case already is. Add a test.

4. Components — `src/components/dashboard/outreach/`:
   • A KPI row (total prospects, sent, connected, replied, meetings booked), each
     labelled with the source column per step 2.
   • A funnel view — plain counts with the step definition visible; NOT a
     conversion-rate chart.
   • Three breakdown charts following the house chart pattern.
   • A disclosure block listing any unrecognised reply/stage values VERBATIM, plus
     the counted-but-excluded undated `date_sent` rows.
   • States: could-not-read (unavailable) ≠ no-snapshot-yet ≠ snapshot-with-zero-
     prospects. Render all three distinctly, and show the truncation notice when
     `truncated` is set.

ACCEPTANCE
- The Outreach tab appears as the 4th client tab and its route renders.
- The funnel is derived from date_sent / connection_status / reply status /
  meeting_booked_date — NOT from Stage — and each figure names its source column.
- Stage is presented as current standing, not as funnel stages.
- Unrecognised reply and stage values appear verbatim on screen; none is bucketed
  into "other" or dropped.
- No rate, percentage, score, rank, or benchmark appears anywhere.
- All three read states render distinctly; truncation is disclosed.
- Test count strictly up; no existing assertion weakened; every new test RED-first
  and mutation-verified.

VERIFICATION (the whole gate — nothing else)
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output pasted.
- Mutation table (real runs): (a) derive the funnel from Stage counts → the
  funnel-source test fails; (b) bucket an unrecognised reply value into
  no-reply → the disclosure test fails; (c) map a missing `follow_up_count` to 0 →
  the parseCount test fails; (d) render the unavailable state as "0 prospects" →
  the three-states test fails.
- NO Claude-in-Chrome / dev-server walk — assert through pure functions and
  component markup only.

GUARDRAILS
- READ THE ACTUAL GIT STATE AT START and report it. Stay on
  `feat-outreach-system-dashboard`; never commit to `main`; SURFACE (never
  self-heal) any unexpected commit. LEAVE ALL WORK UNCOMMITTED.
- ⚠️ Build ADDITIVELY on uncommitted S1 (and possibly S2) work: do NOT revert,
  stash, reset, or reimplement it. Do NOT touch the LinkedIn report, dashboard,
  ingest path, `/upload`, or the nav item list.
- Do NOT modify `parse-outreach.ts`, `src/services/outreach.ts`, or the SQL — S3
  is read-side only. Do NOT run `db push`.
- Do NOT build trends/snapshot-comparison (S4) or the Report Link aggregate (S5).
- ⚠️ NOTHING on this page may leave the staff surface: this data contains
  third-party prospect PII. Do not add it to any report, print view, or public
  component.
- If a change needs a file outside SCOPE, STOP and FLAG.

SCOPE — create/modify ONLY: `src/lib/outreach-vocab.ts` (+ test);
`src/services/outreach-analytics.ts` (+ test); `src/services/types.ts`;
`src/paths.ts`; `src/app/(app)/clients/[id]/outreach/page.tsx` + `loading.tsx`;
`src/components/dashboard/outreach/*` (+ tests);
`src/components/dashboard/client/client-tabs.tsx` (+ test);
`src/components/dashboard/layout/nav-config.ts` (+ test).

REPORT BACK
- Git state at start; files changed; final `git status --porcelain`.
- Your canonicalReply map in full, and specifically how you treated
  "Replied - Interested" and "Not Interested" — with the reasoning.
- The four funnel definitions as implemented, and the test proving the funnel is
  NOT derived from Stage.
- How the "2020-12-04" outlier is handled, and the test pinning that rule.
- Which unrecognised values a real-shaped fixture surfaces.
- Full gate output + the mutation table (real runs); test count before/after.
- FLAGS: anything you stopped short of; whether the funnel and the Stage breakdown
  sitting on one page reads as contradictory (they use different definitions by
  design — say if the page fails to make that legible).
```

## Feedback & revisions

- **2026-07-27 — v1 (authored).** Resolves the slice's honesty crux up front:
  `Stage` counts are terminal, so the funnel is built from the four unambiguous
  columns instead, with each figure naming its source. Carries the S1 executer's
  three-state + truncation design into the read side, and forbids guessing at
  unmapped vocabulary values ("Not Interested", "Replied - Interested").
  _(Append dated entries as the executer reports back.)_

- **2026-07-27 — v2: interim executer report (code-complete, review still
  running). Gate green: 1118 tests (from 1036), build exit 0, route registered.**

  **⚠️ ONE CONFIRMED DEFECT, found by the planner reading the tree — the very
  failure this handoff was written to prevent.** The **Connections accepted**
  funnel step is derived from **`Stage`**, not from `connection_status`:
  `src/services/outreach-analytics.ts:93-97` computes `canonicalStage(p.stage)`,
  takes its index in `OUTREACH_STAGES`, and counts `index >= 1` ("at Connected or
  further along"). Meanwhile the step declares `source: "Connection Status"` and
  `rule: "Connection Status reads Connected"`, and the ⚠️ comment directly above
  the code asserts it matches the column value — so the page renders a provenance
  that is false, which is worse than an unlabelled wrong number.
  - **It is wrong on today's real data, not just in principle.** Measured on the
    1,435-row export: `Connection Status = "Connected"` → **217**;
    stage-index ≥ 1 → **219**. The two differing rows are `Pending` /
    `Meeting Booked`. The Connection Status _breakdown chart_ on the same page
    tallies `connectionStatus` correctly and shows **217**, so the page will
    display 219 and 217 side by side, both attributed to Connection Status.
  - **Why the tests missed it:** `outreach-analytics.test.ts:99` ("counts
    CONNECTED from Connection Status, not from the Stage named Connected") is
    NON-DISCRIMINATING — its four fixtures return 3 under both rules, and its
    `not.toBe` guard compares against Stage-_equals_-Connected (1), which the
    stage-_index_ rule also satisfies. It is the same fixture flaw the executer
    swept out of the Sent and Meetings tests, left in place here.
  - **Second-order risk:** an unrecognised stage returns index −1, so a genuinely
    connected prospect at an unfamiliar stage silently drops out of the count —
    the exact silent loss `canonicalStage`/`isKnownStage` was designed to prevent.
  - **Fix:** count `p.connectionStatus` matching "Connected" case-insensitively,
    and rebuild the fixture so the two rules cannot coincide (e.g. a
    `Connected`/`Requested` row and a `Pending`/`Meeting Booked` row).

  **Three executer judgement calls — all accepted:**
  1. **`canonicalStage` keeps an unknown stage under its own name** (with a new
     `isKnownStage` carrying the signal) instead of returning the literal string
     "unrecognised", contrary to this handoff's step-1 wording. Correct: for a
     stage the label IS the value, so a shared "unrecognised" label would merge
     "Nurturing" and "Warm Lead" into one bar with summed counts — the bucketing
     this handoff's own ACCEPTANCE criteria forbid. The executer resolved a
     contradiction between the handoff's step text and its acceptance criteria in
     favour of the criteria. **The handoff was imprecise; the code is right.**
  2. **Replied = not `no-reply` AND not `not-recorded`.** Tighter than the stated
     "not no-reply". Invisible today (Reply Status is 100% filled — verified), but
     it stops blank cells counting as replies on any future export, at the
     narrowest, most-scrutinised end of the funnel. Accepted.
  3. **The spec's "8 rows carrying a date" was wrong** — 8 distinct values across
     11 rows. Verified against the source file and **corrected at source** in
     [the spec](../specs/2026-07-27-outreach-system-dashboard.md). The funnel is
     unaffected (1,435 − 1,396 = 39 either way).

  **Housekeeping:** a stray `src/services/__probe_blank.test.ts` appeared in
  `git status` mid-review and was gone minutes later — mutation-probe debris the
  executer cleaned up. Re-check it is absent before committing.
