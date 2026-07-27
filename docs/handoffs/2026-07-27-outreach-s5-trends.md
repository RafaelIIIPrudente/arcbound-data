# Handoff — Outreach System S5: trends

- **Type:** Executer handoff (feature slice, S5 of the Outreach System workstream)
- **Date:** 2026-07-27
- **Branch:** `feat-outreach-system-dashboard`
- **Status:** Ready to run. Depends on **S1** (seams) and **S3** (analytics).
  Run **after S4a** — both touch the Outreach page.
- **Brief:** [spec §S5](../specs/2026-07-27-outreach-system-dashboard.md) +
  [ADR 0012](../adr/0012-outreach-system-per-client-snapshots.md).

## Decision & rationale

Two halves, and only one of them is new work:

1. **Requests sent over time** is already computed. S3's `buildOutreachAnalytics`
   produces `sentOverTime`, `undatedSent`, `unreadableSentValues` and
   `sentDateRange`; the disclosure block already reports the exclusions. S5 only
   has to draw it — with empty months filled, because a month with no sends is a
   genuine zero when the range is known, and collapsing it would compress the
   time axis into a lie.
2. **Snapshot-over-snapshot movement** is new, and its crux is that movement is
   movement **in the sheet**, not activity in the world. A re-upload from a
   shrunk source shows negative movement that means rows were removed, not that
   anyone un-replied. The panel must be able to say that.

Recomputing both snapshots' funnels from raw rows (rather than storing counts at
ingest) keeps ADR 0009's rule intact: a revised reading fixes history
retroactively instead of freezing yesterday's arithmetic.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class TypeScript engineer who is careful with time series and
careful with deltas. You know that a gap in a monthly series is data, that a
negative delta has more than one possible cause, and that "we cannot compare yet"
is a sentence a screen is allowed to say. You read before you write; ⚠️ comments
in this repo are binding; you write failing tests first and prove they fail for
the right reason; you never widen scope silently; you report with real command
output.

GOAL
Add two trend panels to the Outreach client tab: requests sent over time, and
what moved between this Client's two most recent Outreach Snapshots.

CONTEXT — read FIRST (do not restate; follow):
- `docs/specs/2026-07-27-outreach-system-dashboard.md` — §"Global Constraints",
  §"Source data", §"Slice S5".
- `docs/adr/0012-outreach-system-per-client-snapshots.md` and ADR 0009.
- S1/S3/S4 ARE BUILT AND IN THE TREE. Read for ACTUAL signatures:
    src/services/outreach.ts            — latestSnapshot(clientId) (three states,
                                          `truncated` + `total`);
                                          listOutreachUploads(clientId) → headers
                                          newest-first, or NULL on failure OR
                                          truncation
    src/services/outreach-analytics.ts  — buildOutreachAnalytics(prospects)
    src/services/types.ts               — OutreachAnalytics, OutreachUpload
    src/app/(app)/clients/[id]/outreach/page.tsx — the page you extend
- ⚠️ HALF THIS SLICE IS ALREADY COMPUTED. `OutreachAnalytics` ALREADY carries
  `sentOverTime` (monthly `YYYY-MM` buckets), `undatedSent`,
  `unreadableSentValues` and `sentDateRange`, and
  `src/components/dashboard/outreach/outreach-disclosure.tsx` ALREADY reports the
  exclusions. Do NOT recompute any of it and do NOT duplicate the disclosure —
  read those files first and render what exists.
- PRECEDENTS: `src/components/dashboard/outreach/outreach-breakdown-chart.tsx`
  for the house chart shell; `src/components/dashboard/analytics/` for the
  recharts + `ChartContainer`/`ChartConfig` idiom and the "measurement, not
  recommendation" comment discipline.

STEPS — TDD throughout (RED first; prove each test fails for the right reason):

1. Fill the gaps in the sent series — a small pure helper (+ test), placed beside
   the analytics rather than inside a component.
   ⚠️ `sentOverTime` CONTAINS ONLY MONTHS THAT HAVE ROWS. Rendered as-is, a
   January bar sits directly beside a March bar and the chart silently claims
   February did not exist. Fill every month between the first and last bucket
   with `count: 0`.
   ⚠️ THIS ZERO IS A REAL ZERO AND THAT IS WHY IT IS ALLOWED. Everywhere else on
   this page an absent value renders as a gap, never 0 — but here the date range
   is known, so "no requests were sent in February" is an observation, not a
   missing measurement. Say so in a comment; this is the one place the rule
   inverts, and a reader needs to know it was deliberate.
   ⚠️ `date_sent` HOLDS ONE ROW AT `2020-12-04` against an otherwise-2026 range.
   S3 already decided: it is INCLUDED and `sentDateRange` publishes it. Do NOT
   re-filter it here — but filling every month from 2020-12 to 2026-07 produces
   ~68 buckets, most of them empty. Handle that honestly: either show the full
   span, or show a compressed axis that STATES the gap in words. Silently
   trimming the early months is the one option not available. Say which you chose
   and why in REPORT BACK.

2. Movement — `outreachMovement(current, previous)` in
   `src/services/outreach-analytics.ts` (+ test). PURE. Takes two
   `OutreachAnalytics` and returns per-funnel-step `{ label, source, current,
   previous, delta }` plus the prospect-count delta.
   ⚠️ NO RATES, PERCENTAGES, "GROWTH", OR SCORES. A delta is a difference of two
   counts. "+12 replies" is a fact; "+31% reply growth" is a verdict this sample
   cannot support, and the no-score discipline binding the rest of this page
   binds deltas too.
   ⚠️ A NEGATIVE DELTA IS NOT A REGRESSION AND MUST NOT BE PRESENTED AS ONE.
   Snapshots are full re-uploads of a sheet somebody edits: rows get removed,
   renamed, or re-scoped. A drop can mean the source shrank rather than that
   anyone un-replied. Neither cause is knowable from here, so the panel states
   the change and its two possible readings; it does not colour it as bad, arrow
   it downward as failure, or explain it.
   ⚠️ THE STEP DEFINITIONS MUST MATCH ACROSS BOTH SNAPSHOTS. Both sides come from
   `buildOutreachAnalytics`, so they do by construction — add a test that pins
   `source` equality per step, so a future edit to one side cannot silently
   compare two different questions.

3. Read the previous snapshot — extend `src/services/outreach.ts` MINIMALLY with
   a function that returns a NAMED snapshot's prospects by upload id, mirroring
   `latestSnapshot`'s three-state discipline and its paging.
   ⚠️ RECOMPUTE FROM RAW ROWS. Do NOT add stored per-snapshot counts to the
   database. ADR 0009: raw values are never rewritten and interpretation happens
   at read time, so a corrected reading fixes every past snapshot at once.
   Freezing counts at ingest would leave old snapshots asserting arithmetic the
   app no longer believes.
   ⚠️ FOUR OUTCOMES, KEPT APART:
     • `listOutreachUploads` returned null → the history COULD NOT BE READ.
     • exactly one snapshot → "nothing to compare yet; upload again to see
       movement". NOT a zeroed panel, NOT an error.
     • the previous snapshot's rows could not be read → say that, and still show
       the current figures.
     • two readable snapshots → the movement panel.
   The one-snapshot case is the common one today and the easiest to get wrong.

4. Components — `src/components/dashboard/outreach/`:
   • A sent-over-time chart following the house pattern. Title it as a
     measurement. Do not annotate peaks or infer cadence.
   • A movement panel showing each step's previous → current and the delta, each
     labelled with the source column exactly as the funnel is, plus the two dates
     being compared and a plain sentence that a change can come from the sheet
     changing.
   • The states from step 3, rendered distinctly.

5. Wire into `src/app/(app)/clients/[id]/outreach/page.tsx`, between the
   breakdowns and `OutreachDisclosure`. Do NOT duplicate any disclosure the
   existing block already makes.

ACCEPTANCE
- The sent chart shows every month in range, empty months included as real zeros.
- The `2020-12-04` row is neither dropped nor hidden; the chosen span treatment is
  stated on screen.
- Movement compares two snapshots recomputed from raw rows, with per-step source
  labels matching the funnel's.
- One snapshot renders "nothing to compare yet", never zeros; a failed history
  read and a failed previous-snapshot read each read differently again.
- A negative delta is stated, not judged — no red/green verdict styling, no
  "declined" language.
- No rate, percentage, score, rank, or benchmark anywhere.
- No new stored counts; no schema change; no `db push`.
- Test count strictly up; no existing assertion weakened; every new test RED-first
  and mutation-verified.

VERIFICATION (the whole gate — nothing else)
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output pasted.
- Mutation table (real runs): (a) drop the gap-filling → the missing-month test
  fails; (b) render the one-snapshot case as zeros → the four-states test fails;
  (c) compute a percentage delta → the no-rates test fails; (d) compare a step
  against a differently-sourced step → the source-equality test fails.
- NO Claude-in-Chrome / dev-server walk.

GUARDRAILS
- READ THE ACTUAL GIT STATE AT START and report it. Stay on
  `feat-outreach-system-dashboard`; never commit to `main`; SURFACE (never
  self-heal) any unexpected commit. LEAVE ALL WORK UNCOMMITTED.
- ⚠️ Build ADDITIVELY on uncommitted S4/S4a work: do NOT revert, stash, reset, or
  reimplement it, and do NOT touch the prospect table, its columns, or the pills.
- Do NOT change `outreach-vocab.ts`, `parse-outreach.ts`, or any SQL. The only
  permitted change to `src/services/outreach.ts` is the additive read in step 3.
- ⚠️ STILL STAFF-ONLY. No trend component may be reused by a print view, the
  public `/r/[token]` route, or anything a Client can reach — that is S6, and it
  aggregates inside the SECURITY DEFINER function.
- Do NOT build the Report Link aggregate (S6).
- If a change needs a file outside SCOPE, STOP and FLAG.

SCOPE — create/modify ONLY: `src/services/outreach-analytics.ts` (+ test);
`src/services/outreach.ts` (+ test) — the additive read only;
`src/services/types.ts`; `src/components/dashboard/outreach/*` (+ tests) — new
files only; `src/app/(app)/clients/[id]/outreach/page.tsx`.

REPORT BACK
- Git state at start; files changed; final `git status --porcelain`.
- How you treated the ~68-month span the 2020 outlier creates, and why.
- The four read states as implemented, and which one today's data hits.
- Whether the movement panel reads as neutral for a negative delta — quote the
  copy.
- Full gate output + the mutation table (real runs); test count before/after.
- FLAGS: anything you stopped short of; whether two snapshots is enough to make
  this panel worth its space, or whether it needs three.
```

## Feedback & revisions

- **2026-07-27 — v1 (authored).** Renumbered from S4 when the prospect table was
  un-deferred. Two planner findings baked in: half the slice is ALREADY computed
  by S3 (`sentOverTime` and friends) so the executer must render rather than
  recompute; and the monthly series contains only months that have rows, so
  drawing it unfilled would silently claim the missing months did not exist —
  the one place on this page where rendering a real `0` is correct rather than a
  coercion. Also pins that a NEGATIVE delta is not a regression: snapshots are
  full re-uploads of an edited sheet, so a drop may mean the source shrank.

- **2026-07-27 — v2 (executer reported; planner verified).** Built, green,
  uncommitted on `feat-outreach-system-dashboard` at HEAD `64900b5`. Planner
  re-ran the gate on the combined tree after the concurrent S6 session settled:
  lint clean · type-check clean · **90 files / 1,289 tests passed** · build green.

  **The ~68-month span — resolved as a STATED compression, not a trim.**
  `fillSentMonths` materialises every month; `sentTrend` then collapses runs of
  **three or more** consecutive empty months into one point labelled
  `"61 months, none sent (Jan 2021 – Jan 2026)"`. Runs of one or two stay as real
  zero bars — the "February did not vanish" case the brief was built around
  survives intact. The break is stated on the axis, in the text-equivalent list,
  and under the chart. Critically, a collapsed gap carries `count: null`, never
  `0`: it is _many months compressed_, not one bucket that measured zero. This is
  the right resolution — the brief ruled out silent trimming, and 61 blank bars
  would have buried the six months that carry this Client's actual outreach.

  **A FIFTH read state the brief did not anticipate, added by the executer and
  accepted:** `history-unavailable · single · previous-unavailable · partial-read ·
ok`. A truncated read on either side makes its counts FLOORS, and a floor
  subtracted from a total renders as `−435 requests sent` — indistinguishable on
  screen from a real collapse. The brief specified four states; this is the four
  plus the one that only appears once you try to subtract two possibly-incomplete
  reads. Today's data hits `single`.

  **A second correctness catch, also outside the brief:** the previous snapshot is
  located _relative to the snapshot on screen_, not as `uploads[1]`. The history
  and the snapshot are separate reads, so a concurrent upload between them would
  otherwise make the panel compare the displayed snapshot against itself and print
  a column of zeros.

  **Negative-delta copy (verified neutral):** the drop renders as `-5` and nothing
  more, closing with — _"Every upload replaces the whole export, so a change here
  can come from the outreach itself or from the sheet — rows removed, renamed or
  re-scoped between exports move these counts too. ArcBase cannot tell which, and
  does not guess."_ Tests grep rendered text for verdict words and rendered classes
  for verdict colours **in both directions**, and ban `▲▼↑↓`.

  **A weak test the executer found and strengthened under mutation (d):** the
  source-equality test originally asserted only that each step's `source` matched
  both funnels — but `source` is carried from the current snapshot, so a slipped
  zip still passed. It now looks each figure up by `source` on its own side. This
  is exactly what mutation testing is for, and it was caught because the brief
  named the mutation rather than leaving it to judgement.

  **⚠️ Process note — two sessions shared one worktree.** S5 and S6 ran
  concurrently in the same checkout: S6 appended to `outreach-analytics.test.ts`
  while S5 was editing it, and two `next build` processes collided on
  `.next/standalone` / `routes-manifest.json`. Neither session reverted the
  other's work and the combined tree is green, but the two reports each describe a
  racing tree and neither could speak for the whole. **Concurrent executers on one
  worktree should be avoided** — use separate worktrees, or sequence the slices.

  **Stopped short (accepted):** no multi-snapshot sparkline (needs N snapshots and
  a new read); no per-prospect diff (there is no row key — 1,419 distinct LinkedIn
  URLs across 1,435 rows — so only aggregate movement is answerable). The
  executer's own judgement that the movement panel earns its space from the THIRD
  snapshot onward, while the prospect-count row pays for itself immediately, is
  worth revisiting once Clients have three uploads.
  _(Append dated entries as further feedback arrives.)_

- **2026-07-27 — v2: executer run COMPLETE and green.** Gate: lint clean,
  type-check clean, **1289 tests** (1217 → +72, of which **+56 are S5**: 25 in
  `outreach-analytics.test.ts`, 7 in `outreach.test.ts`, 10 in
  `outreach-sent-chart.test.tsx`, 14 in `outreach-movement.test.tsx`), build exit
  0, route `/clients/[id]/outreach` at 7.13 kB / 327 kB First Load. All four
  mutations caught. Working tree left uncommitted; HEAD unchanged at `64900b5`.
  - **The ~68-month span: COMPRESSED AXIS, not full span.** `fillSentMonths`
    materialises every month between the endpoints; `sentTrend` then collapses
    any run of **three or more** empty months into ONE point labelled
    `"61 months, none sent (Jan 2021 – Jan 2026)"`. Runs of one or two stay as
    real zero bars — exactly the "February did not vanish" case the fill exists
    for. Rationale: drawn in full, 61 blank bars bury the six months that carry
    this Client's actual outreach; trimming them is the option the brief rules
    out. The break is stated on the axis, in the text-equivalent list, and in a
    sentence under the chart ("…so the axis is not to scale across it — nothing
    has been filtered out").
  - **A collapsed gap carries `count: null`, never `0`.** A gap is many months
    compressed, not one bucket that measured zero; `0` would draw a single bar
    where sixty-one months are hiding. This is the ONE place the four-state rule
    inverts (an empty month IS a real zero, because the date range is known), and
    that inversion is documented at `fillSentMonths` so nobody "fixes" it back.
  - **⚠️ A FIFTH STATE, ADDED BEYOND THE BRIEF'S FOUR: `partial-read`.** A
    truncated read on EITHER side makes its counts floors, and a floor subtracted
    from a total manufactures movement — a previous snapshot short by 435 rows
    renders as "−435 requests sent", indistinguishable on screen from a real
    collapse. No deltas are shown at all in that case. Today's data hits
    **`single`** (one snapshot per Client).
  - **⚠️ THE PREVIOUS SNAPSHOT IS FOUND RELATIVE TO THE ONE ON SCREEN**, not as
    `uploads[1]`. The history and the snapshot are two separate reads; if an
    upload lands between them, `uploads[1]` IS the displayed snapshot and the
    panel would compare it against itself and print zeros. `readMovement`
    locates the displayed upload id in the list and takes its successor; a
    failure to find it reports `history-unavailable` rather than guessing.
  - **The source-equality test was strengthened after mutation (d) exposed it as
    weak.** As first written it asserted only that each step's `source` matched
    both funnels — but `source` is carried through from the CURRENT snapshot, so
    a zip that slipped by one still passed it (the mis-pairing was caught by the
    delta tests and the throw instead). It now looks each figure up BY SOURCE on
    its own side, and fails under (d) as the brief specified.
  - **Negative delta, verbatim copy:** the drop renders as `-5` and nothing more.
    The panel's closing sentence is _"Every upload replaces the whole export, so
    a change here can come from the outreach itself or from the sheet — rows
    removed, renamed or re-scoped between exports move these counts too. ArcBase
    cannot tell which, and does not guess."_ Tests grep the rendered text for
    verdict words and the rendered classes for verdict colours **in both
    directions** — a rise painted green is the same claim as a drop painted red —
    and ban ▲▼↑↓ outright.
  - **⚠️ S6 WAS BEING BUILT CONCURRENTLY IN THE SAME WORKTREE** by another
    session (files timestamped 20:02–20:04, mid-slice). It appended a
    cross-language SQL guard suite into `src/services/outreach-analytics.test.ts`
    and a back-reference comment into `outreach-analytics.ts` — both inside S5's
    scope. Surfaced, not reverted, not self-healed: one of its tests sat RED in
    my file for part of the run (it wanted the back-reference comment) and the
    other session supplied it. A concurrent `pnpm build` also collided on
    `.next/standalone`; a clean rebuild passed. **Two sessions writing one
    worktree is the risk worth naming** — my own test file was appended to while
    I was editing it.
  - **FLAG — is two snapshots enough to justify this panel?** For the four funnel
    steps, marginally: with one comparison there is no way to tell a real
    movement from an editing artefact, which is precisely why the copy refuses to
    read one. It earns its space from the THIRD snapshot on, when a repeated
    direction starts to mean something. The prospect-count row is worth it
    immediately — it is the number that explains most deltas. Recommend keeping
    it as built and revisiting after Clients have three uploads.
  - **Stopped short of, deliberately:** no sparkline or multi-snapshot series
    (that needs N snapshots and a new read); no per-prospect diff (the source has
    no row key — 1,419 distinct LinkedIn URLs across 1,435 rows — so only
    aggregate movement is answerable); no S6 work of any kind.
