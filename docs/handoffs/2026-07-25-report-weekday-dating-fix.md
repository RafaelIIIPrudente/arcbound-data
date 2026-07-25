# Handoff — Report weekday chart dating fix

- **Type:** Executer handoff (bugfix)
- **Date:** 2026-07-25
- **Branch:** `feat-additonal-features-for-linkedin-report`
- **Status:** Emitted — not yet run. ⚠️ **Blocked by a collision:** the uncommitted
  Content composition (B) work occupies the SAME 5 wiring files this fix edits
  (`types.ts`, `client-report.ts`, `client-report.test.ts`, `page.tsx`,
  `print-report.tsx`). Commit or set B aside FIRST, then re-baseline this fix's
  git-state guardrail (it currently claims "HEAD `19dbe14`, working tree clean",
  which is stale). See `docs/handoffs/2026-07-25-content-composition.md`.
- **Reference implementation:** the dashboard weekday chart, committed `19dbe14`
  (`src/services/analytics.ts` `buildDashboardAnalytics`;
  `src/components/dashboard/analytics/weekday-impressions-chart.tsx` + its test)
- **Retires:** the stale ⚠️ flag in `src/services/analytics.ts` (~L341-342) that
  says the report chart "still buckets on `effectiveMs` … flagged for a later,
  out-of-scope fix"
- **Related decisions:** the dating discipline (`estimated_post_date` vs
  `scraped_at`) that also governs Posting Cadence and the dashboard weekday chart

## Decision & rationale

The **client report's** "Average impressions by day of week posted" chart dated
posts by `effectiveMs`, which stands `scraped_at` in for a post whose publish date
was never resolved (hour-age posts). Because every post in one weekly scrape shares
a `scraped_at`, this piled undated posts onto a single **scrape** weekday and
fabricated a posting rhythm — turning "which weekday lands best" into "which weekday
we scraped." This is a correctness/honesty defect in **client-facing** output.

The dashboard's equivalent chart was already built correctly (dates by
`estimated_post_date` alone via `estMs`, excludes-and-counts undated posts, discloses
the exclusion, and shows an honest empty state). The fix makes the report chart —
on-screen **and** print/export — mirror that behaviour. No new database read; the
month/week impressions chart and `impressionsPostCount` are untouched.

Key files: defect in `src/services/client-report.ts` (~L379-387 weekday block, ~L508
/ ~L526 return); type `src/services/types.ts` `ClientReport.impressionsByWeekday`
(~L620, add `weekdayUndatedPosts`); components
`src/components/dashboard/report/impressions-by-weekday-chart.tsx` and the print
`ImpressionsByWeekday` in `src/components/dashboard/report/print/print-report.tsx`;
page wiring `src/app/(app)/clients/[id]/report/page.tsx` (~L143).

## The handoff prompt (as emitted)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class TypeScript/React engineer working in ArcBase, an internal, auth-gated, single-tenant Next.js analytics app for a LinkedIn reporting pipeline (external scraper → ArcBase → Supabase `bi.*` views → client-facing report). You hold one distinction as sacred: "which weekday the client PUBLISHED on" and "which weekday we SCRAPED on" are categorically different claims, and a windowing convenience (standing `scraped_at` in for a missing publish date) must NEVER masquerade as a publish-date assertion in a client-facing chart. You read before you write; ⚠️ comments in the code are binding; you write the failing test FIRST and prove it fails for the right reason; you never collapse the four data states (could-not-read / truncated / genuinely-zero / not-applicable); a genuine measured 0 is not "empty"; you do not widen scope silently; and you report honestly with real command output.

GOAL
Fix a client-facing honesty defect: the CLIENT REPORT's "Average impressions by day of week posted" chart currently dates posts by `effectiveMs` (which falls back to `scraped_at`), so hour-age posts — whose publish date the pipeline never resolved — get piled onto their SCRAPE weekday, fabricating a rhythm. The DASHBOARD's equivalent chart was already built correctly and is your exact reference. Make the report chart (on-screen AND print/export) date by `estimated_post_date` alone, exclude-and-COUNT undated posts, disclose that exclusion, and show an honest empty state — mirroring the dashboard chart's behaviour.

CONTEXT (verify every claim by reading the files before editing — do not trust these blindly)
- Read AGENTS.md (stack + architecture rules — follow, don't restate) and CONTEXT.md (domain: the four-state discipline; `estimated_post_date` vs `scraped_at`).
- ROOT CAUSE is already diagnosed — no rediscovery needed. The two dating helpers live in `src/services/analytics.ts`:
  • `estMs(row)` (exported, ~L115): the RESOLVED publish date or `null`. Returns `null` for hour-age posts. This is the ONLY honest weekday basis.
  • `effectiveMs(row)` (~L135): `estMs(row) ?? Date.parse(scraped_at)`. The WINDOWING key. Never a publish-date assertion.
- THE REFERENCE (already correct, already committed — DO NOT MODIFY, mirror it):
  • Service: `src/services/analytics.ts` `buildDashboardAnalytics`, weekday block ~L343-356 — dates by `estMs`, increments `weekdayUndatedPosts` when `estMs === null`, buckets the rest.
  • Type: `src/services/types.ts` `DashboardAnalytics` fields `impressionsByWeekday` + `weekdayUndatedPosts` (~L120-137) — copy the comment discipline.
  • Component: `src/components/dashboard/analytics/weekday-impressions-chart.tsx` `WeekdayImpressionsChart` — props `datedPosts`/`undatedPosts`, `hasChart = datedPosts > 0`, exclusion `<p role="note">`, empty-state that distinguishes "none datable" from "no posts at all".
  • Component test: `src/components/dashboard/analytics/weekday-impressions-chart.test.tsx` — mirror its cases for the new report-chart test (title-as-measurement + advice-word grep guard; states window + post count; discloses exclusion pluralised; ResizeObserver shim in `beforeAll`).
- THE DEFECT (what you are fixing):
  • `src/services/client-report.ts` weekday block (~L379-387) iterates `selectedPlaceable` and buckets by `new Date(ms)` where `ms` is `effectiveMs` — the bug. `selectedPlaceable` (from `selectPeriodPlaceable`) is the period's rows placeable by `effectiveMs`, so hour-age posts ARE present with `ms = scraped_at`. There is NO `weekdayUndatedPosts` field on the report today.
  • Report return object assembles `impressionsByWeekday` (~L508); `impressionsPostCount: selectedPlaceable.length` (~L526) is shared by BOTH the month/week impressions chart and the weekday chart.
  • `ClientReport` type field `impressionsByWeekday: { label: string; value: number }[]` (~L620) — no undated companion.
  • On-screen chart `src/components/dashboard/report/impressions-by-weekday-chart.tsx` `ImpressionsByWeekdayChart` — props `{ data, period, postCount }`; `isEmpty = data.every(d => d.value === 0)` (the same real-zero-collapse bug the dashboard fixed); uses `<ChartScope period postCount />`; no exclusion disclosure.
  • Print chart `src/components/dashboard/report/print/print-report.tsx` local `ImpressionsByWeekday` (~L194-243, same `isEmpty` bug) and its wiring (~L378-381).
  • Page wiring `src/app/(app)/clients/[id]/report/page.tsx` (~L143-147).
- STALE FLAG to retire: the ⚠️ parenthetical in `analytics.ts` (~L341-342) says the report chart "still buckets on `effectiveMs` and so has this defect — flagged for a later, out-of-scope fix." Once you fix it, update that sentence to state the report now applies the same `estMs`-only dating (do not delete the surrounding honesty comment).

SCOPE — create/modify ONLY these:
- MODIFY `src/services/client-report.ts`: import `estMs` from `@/services/analytics`; in the weekday block, date by `estMs(row)`, `continue` + increment a new `weekdayUndatedPosts` when it is `null`; add `weekdayUndatedPosts` to the returned object. Do NOT change how `selectedPlaceable`/`impressionsPostCount` are computed, and do NOT touch the month/week `impressionsSeries` block.
- MODIFY `src/services/types.ts`: add `weekdayUndatedPosts: number` to `ClientReport` beside `impressionsByWeekday`, with a ⚠️ comment mirroring the `DashboardAnalytics` one (estimated-date-only, undated excluded-and-counted, empty weekday is a genuine 0).
- MODIFY `src/services/analytics.ts`: update ONLY the stale parenthetical (~L341-342). No logic change.
- MODIFY `src/components/dashboard/report/impressions-by-weekday-chart.tsx`: replace `postCount` prop with `datedPosts` + `undatedPosts`; `hasChart = datedPosts > 0`; keep `<ChartScope period postCount={datedPosts} />`; add the exclusion `<p role="note">` and the two-way empty state exactly as the dashboard chart does. Keep the existing `<AreaChart>` block and the title text unchanged.
- MODIFY `src/components/dashboard/report/print/print-report.tsx`: same prop + `hasChart` + disclosure + empty-state fix in the local `ImpressionsByWeekday`, and update its wiring to pass `datedPosts={report.impressionsPostCount - report.weekdayUndatedPosts}` / `undatedPosts={report.weekdayUndatedPosts}`. Keep it print-safe (fixed-size `AreaChart`, no ResponsiveContainer; the disclosure is a plain `<p>`).
- MODIFY `src/app/(app)/clients/[id]/report/page.tsx`: change the `<ImpressionsByWeekdayChart>` wiring to `datedPosts={report.impressionsPostCount - report.weekdayUndatedPosts}` + `undatedPosts={report.weekdayUndatedPosts}` (remove the `postCount` prop). Leave the sibling month/week impressions chart's `postCount={report.impressionsPostCount}` UNTOUCHED.
- CREATE `src/components/dashboard/report/impressions-by-weekday-chart.test.tsx` (this component has NO test today): mirror the dashboard chart's test file.
- MODIFY `src/services/client-report.test.ts`: extend with the weekday-dating cases below, following the file's existing fixture/builder style (read it first).
Do NOT touch: the dashboard chart/service/type (the reference), cadence, the asset/format charts, data-quality, the comparison, ingestion, nav-config, `bi.*` views, or `components.json`. If a change seems to need a file outside this list, STOP and FLAG.

APPROACH (skills: `test-driven-development` for the new/extended tests; `verification-before-completion` before you call it done. Root cause is already pinned, so `systematic-debugging` is not needed.)
1. Read the reference trio and the defect files listed above so the mirror is exact.
2. Service, RED-first in `client-report.test.ts`:
   - A dated post (`estimated_post_date` on a known UTC weekday) buckets onto THAT weekday.
   - An hour-age post (`estimated_post_date: null`, `scraped_at` on a DIFFERENT known UTC weekday, windowed into the period) is NOT bucketed onto its scrape weekday and IS counted in `weekdayUndatedPosts`. This is the assertion that pins the bug — mutation-verify by temporarily reverting the service to `effectiveMs`/`ms` and confirming this test (and only the intended tests) fails.
   - A datable post with 0 impressions yields a genuine-0 weekday value (still present in the seven-entry series, not dropped).
   - `weekdayUndatedPosts` equals the count of in-period placeable rows with no resolved date.
   Then make them pass with the `estMs` loop + the new field.
3. Component, RED-first in the new test file: title is a MEASUREMENT (assert the exact title string) and NO advice word appears (`/\b(best|optimal|recommended?|top)\b/i` over `container.textContent`); the scope caption shows `datedPosts`; the exclusion sentence appears, pluralised (1 → "1 post … is not counted here", N → "N posts … are not counted here"); a datable 0-impression weekday still renders the chart (not the empty state); empty state reads "No posts with a resolved publish date in this period." when `undatedPosts > 0` and "No posts in this period." when it is 0. Include the `ResizeObserver` `beforeAll` shim. Then edit the component to pass.
4. Wire page + print to the new props; confirm the sibling impressions chart is unchanged.
5. Retire the stale `analytics.ts` flag.
6. Run the full gate and the mutation checks; write the report-back.

ACCEPTANCE CRITERIA
- The report weekday chart (on-screen AND print) buckets by `estimated_post_date` only; an undated (hour-age) in-period post is never placed on a weekday and is counted in `weekdayUndatedPosts`.
- The exclusion is disclosed on both surfaces, pluralised correctly; when all in-period posts are undated the empty state says "No posts with a resolved publish date in this period." (not the false "No posts in this period.").
- A datable 0-impression weekday still draws (real zero ≠ empty); the empty state triggers only when `datedPosts === 0`.
- No engagement-ranking or advice language anywhere in the card (no best/optimal/recommended/top); title stays "Average impressions by day of week posted".
- NO new database read; no change to `selectedPlaceable`/`impressionsPostCount`; the month/week impressions chart wiring is untouched.
- The stale `analytics.ts` parenthetical no longer claims the report chart has this defect.
- Test count strictly increases; no existing assertion weakened; every new test failed first for the right reason and each service/component mutation was caught.

VERIFICATION (this is the whole gate — nothing else)
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, all green, pasted as real output.
- Provide a small mutation table with REAL runs: (a) service `estMs`→`effectiveMs`/`ms` reintroduces the scrape-weekday bug → the hour-age test fails; (b) component `hasChart = datedPosts > 0`→`data.every(d=>d.value===0)` → the genuine-zero test fails; (c) drop the `undatedPosts` disclosure → the exclusion test fails. Revert each after confirming.
- Do NOT use Claude-in-Chrome or any live-browser/dev-server walk. The print section is text + a fixed-size chart, so print-safety is by construction; reason about page-break behaviour rather than rendering it.

GUARDRAILS
- READ THE ACTUAL GIT STATE AT START and report it. As of handoff the branch is `feat-additonal-features-for-linkedin-report`, HEAD `19dbe14`, working tree clean — whatever is already committed is NOT yours; build additively and SURFACE (never self-heal, never rebase) any commit you didn't make.
- LEAVE ALL WORK UNCOMMITTED for the user's review — do NOT commit, push, branch, or open a PR; never commit to `main`.
- Conventional Commits vocabulary only if the user later asks you to commit; keep the tree green.
- Preserve the four states; never coerce absence to a misleading value; genuine-zero ≠ couldn't-analyse.

REPORT BACK
- The git state you observed at start; the exact files changed and the final `git status --porcelain`.
- Full gate output and the mutation table (real runs).
- Before/after test count.
- FLAGS: (1) the report weekday caption may now show a slightly LOWER post count than the sibling month chart on clients with hour-age posts — this is INTENDED (the two charts average different subsets, matching the dashboard's independence); confirm you did not "reconcile" it. (2) Note whether the test fixtures/real data actually contain any hour-age (undated) posts to exercise the exclusion — the fix is correct regardless, but flag if the path is currently untested by real data. (3) Anything you had to touch outside SCOPE (should be nothing).
```

## Feedback & revisions

- **2026-07-25 — v1 emitted.** Initial handoff authored from ground-truth reads of
  the defect and the dashboard reference. Not yet run by an executer.
  _(Append dated entries here as feedback arrives or the executer reports back;
  edit the prompt above in place when a revision is needed.)_
