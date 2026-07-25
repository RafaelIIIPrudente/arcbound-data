# Handoff — Dashboard Posts KPI + weekday chart + has-data gate (A/B/C)

- **Type:** Executer handoff (feature slice, combined A+B+C)
- **Date:** 2026-07-25
- **Branch:** `feat-additonal-features-for-linkedin-report`
- **Status:** Run / landed — committed `19dbe14` (`WeekdayImpressionsChart` + analytics). This chart is now the honesty REFERENCE the report-weekday fix mirrors.
- **Retro-captured:** authored before the every-prompt-is-a-doc rule; backfilled 2026-07-25.
- **Related:** produced the reference implementation for `docs/handoffs/2026-07-25-report-weekday-dating-fix.md`; the report's weekday divergence flagged here is what that fix resolves.

## Decision & rationale

Three bounded dashboard (`/`) changes, no new DB read: (A) a "Posts" publishing-
volume KPI via the existing `toKpi("Posts", current.length, prior.length)` idiom,
first in the KPI row (KpiCards renders it with no component change); (B) an "Average
impressions by day of week posted" chart, bucketed by `estimated_post_date` weekday
ONLY (undated posts excluded-and-disclosed, never bucketed by `scraped_at`), titled
as a MEASUREMENT not a recommendation (no best/optimal/top); (C) a one-line fix of
the stale `hasData` gate from `recentPosts.length` (vestigial after the table
removal) to `totalPosts > 0`. Combined into one handoff because A/B/C edit the same
four files.

## Planner note (sent with the handoff)

> Both grounded. Key facts locked: `toKpi(label, current, prior)` is the KPI idiom (Posts = `toKpi("Posts", current.length, prior.length)`, and since `KpiCards` renders the `kpis` array, the page needs no change for it); the report's weekday chart **averages** impressions (`mean` over 7 buckets) via `SeriesPoint[]`; and the honest weekday must come from the **estimated post date**, excluding undated posts — never the `scraped_at` fallback, which would pile every undated post onto the one scrape weekday and fake a spike.
>
> One judgment call before the block: **I'm giving you these as a single handoff, not two.** You yourself framed #1+#2 as "one clean, self-contained slice," and they edit the _same four files_ (`analytics.ts`, the `DashboardAnalytics` type, `analytics.test.ts`, `page.tsx`) — two separate executer passes would collide on them for no benefit, whereas #1 alone (one `toKpi` line + a test) is too small to justify its own brief. I've folded in your `hasData` cleanup as a third, explicitly-bounded item since it lives in the same file and is about the same post-count gate. Say the word if you'd rather I split them.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
You are a world-class TypeScript/React data-visualisation engineer with two
non-negotiable instincts. First, you date an event by when it HAPPENED, never by
when it was observed — a post's weekday is the weekday it went out, and a post
whose date the pipeline never resolved has NO weekday you may assert. Second, you
label a chart by what it MEASURES, never by what a reader might wish it proved —
"average impressions by weekday" is a measurement; "best day to post" is a
recommendation the data has not earned, and you do not print the second.

Working style, non-negotiable:
- Read before you write. ⚠️ comments in this repo document real past defects and
  are binding — never weaken one to make a test pass.
- The service core is a PURE function, so RED-first is cheap and mandatory: write
  the failing test that pins each behaviour before the implementation exists.
- Four facts, never collapsed: "could not be read", "truncated / a lower bound",
  "genuinely zero", and "not applicable / unknown". A weekday with no posts is a
  genuine zero; a post with no resolved date has an UNKNOWN weekday and is excluded.
- Do not widen scope silently. If a change seems to need a file outside SCOPE,
  STOP and FLAG it.
- Report honestly. Paste real command output, never a paraphrase of it.

═══════════════════════════════════════════════════════════════════════
GOAL
═══════════════════════════════════════════════════════════════════════

Enrich the ArcBase dashboard overview (the `/` route) so it answers two questions
it currently cannot — "how much are we publishing?" and "which weekday do posts
land best?" — WITHOUT any new database read, and fix one stale gate left behind by
a removed table. Concretely, three bounded changes:

  A. A "Posts" KPI — publishing volume for the current window, with a vs-prior
     delta, in the existing KPI row.
  B. An "Average impressions by day of week" chart on the dashboard — a book-level
     (or client-filtered) view of which weekday posts earn the most impressions.
  C. A one-line cleanup: the dashboard's has-data gate keys off a now-vestigial
     field; point it at the honest one.

All three read from data `buildDashboardAnalytics` ALREADY holds in memory. None
adds a query.

═══════════════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════════════

This repository IS ArcBase — an internal, auth-gated, single-tenant Next.js app
for Arcbound staff to register Clients (individual LinkedIn profiles), ingest
weekly scraped LinkedIn post metrics, and view analytics. It sits mid-pipeline:
external scraper → ArcBase → Supabase `bi.*` views → Power BI.

READ FIRST: `AGENTS.md` (every stack and architecture rule — follow it, do not
restate it), `CONTEXT.md` (the four-state discipline), and then the files under
SCOPE, especially `src/services/analytics.ts` (`buildDashboardAnalytics`,
`currentWindow`, `effectiveMs`, `toKpi`) and the report's
`src/components/dashboard/report/impressions-by-weekday-chart.tsx` (the chart idiom
you will mirror).

WHAT THE DASHBOARD DOES TODAY. `buildDashboardAnalytics(rows, {range, now})` is a
PURE function over the windowed post rows the page already read (paged past the
1000-row cap, truncation already surfaced by the existing banner). It computes
`current` = `currentWindow(rows, …)` and `prior` = the immediately preceding window
of equal length, then a hero KPI (Impressions) and a `kpis: Kpi[]` array (Likes,
Comments, Shares, Saves), each built by `toKpi(label, currentValue, priorValue)`,
which carries the vs-prior delta. `totalPosts` is `current.length`. Everything you
need for A and B is already in `current`/`prior`; DO NOT add a read.

─── A. THE "POSTS" KPI ───────────────────────────────────────────────

The KPI row measures engagement OUTPUTS (likes, comments…) but never publishing
VOLUME — the leading indicator an agency actually watches, currently buried in a
grey caption with no trend. Add one KPI via the existing idiom:

    toKpi("Posts", current.length, prior.length)

Place it FIRST in the `kpis` array — it is the publishing volume the engagement
outputs were earned on, so the row reads Posts → Likes → Comments → Shares → Saves.
Because `KpiCards` renders the `kpis` array, this should require NO change to the
KPI component or the page for A — confirm that and say so. Use `toKpi` unchanged;
do not special-case the delta. (Posts is a count, not a sum, but `toKpi` takes two
numbers and does not care.)

─── B. "AVERAGE IMPRESSIONS BY DAY OF WEEK" ──────────────────────────

Add a weekday aggregation to `buildDashboardAnalytics` and render it with a chart
that mirrors the report's `ImpressionsByWeekdayChart` — an AreaChart over seven
buckets Sun→Sat, each bucket the AVERAGE (`mean`) of its posts' impressions, shaped
as `SeriesPoint[]` (`{label, value}`). Reuse the report's `WEEKDAYS`/`mean` idiom;
an empty weekday bucket must yield 0 (so the chart's existing all-zero empty state
still triggers when there are no posts).

⚠️ THE WEEKDAY IS THE ESTIMATED POST DATE'S WEEKDAY, AND UNDATED POSTS ARE
EXCLUDED. `current` is filtered on `effectiveMs !== null`, which INCLUDES posts
whose only timestamp is `scraped_at` (hour-age posts Shay's resolver left with a
null `estimated_post_date`). You must NOT bucket those by their scrape weekday:
every post in one weekly scrape shares a `scraped_at`, so they would pile onto a
single weekday and fabricate a spike — turning "best weekday" into "the weekday we
happened to scrape". Bucket ONLY by each post's `estimated_post_date` weekday,
using the existing helper that parses `estimated_post_date` and returns null when
it is absent (the null-returning sibling of `effectiveMs` near the top of
`analytics.ts`), and DROP posts with no estimated date from the weekday buckets.
Verify how the report's weekday chart derives its own weekday and reuse the same
basis IF it is estimated-date-based; if the report falls back to a scrape date, use
estimated-only here regardless and FLAG the divergence for a later report fix.

⚠️ TITLE IT AS A MEASUREMENT, NOT A RECOMMENDATION. The section/chart title is
"Average impressions by day of week posted" (as the report's is), NOT "Best day to
post". This dashboard is book-level and the sample is thin; "best day" is a causal
claim the data cannot support — the same discipline that forbids ranks in the
cross-client comparison and a consistency score in cadence. No "best", "top",
"optimal", "recommended" in any user-facing string.

SCOPING: the chart aggregates the CURRENT WINDOW's posts (respecting the 7d/30d/90d
range filter and the client filter), consistent with every other dashboard figure.
At 7d each weekday holds roughly one post, so the chart is sparse — that is
inherent to any 7d dashboard figure and is NOT a defect to correct; the existing
empty state covers zero posts.

COMPONENT REUSE. The report's `ImpressionsByWeekdayChart` takes report-specific
props (`period: ReportPeriod`, and a `ChartScope`). Those do not fit the dashboard.
PREFER reuse over duplication: if practical, lift the shared AreaChart core into a
small presentational component both surfaces use, leaving the report chart's
behaviour byte-for-byte unchanged; if that proves heavier than it is worth for one
chart, create a dashboard weekday chart in `src/components/dashboard/analytics/`
that mirrors the idiom, and SAY which you did and why. Either way the dashboard
chart carries an honest scope caption (the window label + the post count it
averaged), and undated-post exclusion is disclosed if any were dropped
(e.g. "N posts without a resolved date are not counted here").

─── C. THE STALE has-data GATE ───────────────────────────────────────

The page's `hasData` currently keys off `analytics.recentPosts.length > 0`. The
recent-posts table has been removed, so `recentPosts` is now only a presence
signal — an honest gate is `analytics.totalPosts > 0`. Make that change. Then check
whether `recentPosts` is now consumed by NOTHING on the page; if so, do NOT remove
it in this slice (that is a separate change with its own blast radius) — FLAG it as
now-vestigial for a follow-up.

═══════════════════════════════════════════════════════════════════════
SCOPE
═══════════════════════════════════════════════════════════════════════

MODIFY  `src/services/analytics.ts` — in `buildDashboardAnalytics`: add the "Posts"
        KPI (A); compute `impressionsByWeekday: SeriesPoint[]` from `current`,
        bucketed by estimated-date weekday, undated excluded, `mean` impressions (B).
MODIFY  `src/services/types.ts` — add `impressionsByWeekday: SeriesPoint[]` to
        `DashboardAnalytics` (the Posts KPI rides the existing `kpis` array; add a
        type field only if one is genuinely needed — confirm).
MODIFY  `src/services/analytics.test.ts` — cover the Posts KPI (current vs prior
        counts and the delta), and the weekday aggregation (weekday derived from the
        estimated date; undated posts excluded; `mean` not sum; empty buckets → 0).
CREATE  the dashboard weekday chart (or the extracted shared core + a thin
        dashboard wrapper) in `src/components/dashboard/analytics/` + a render test.
MODIFY  `src/app/(app)/page.tsx` — render the weekday chart in the chart area; fix
        `hasData` to `analytics.totalPosts > 0` (C). (The Posts KPI should render
        automatically via `KpiCards`; confirm.)

Do NOT touch: the report's weekday chart behaviour (unless extracting a shared core,
in which case keep the report identical), the cross-client comparison, the cadence
or content-composition slices, the ingestion path, the Data Quality service,
`nav-config.ts`, `components.json`, or Shay's `bi.*` views. Do NOT add a database
query. Do NOT remove `recentPosts`. If a change appears to need a file outside this
list, STOP and FLAG it.

═══════════════════════════════════════════════════════════════════════
APPROACH
═══════════════════════════════════════════════════════════════════════

- Use `superpowers:test-driven-development`: `buildDashboardAnalytics` is pure, so
  RED-first every new behaviour (Posts current-vs-prior, weekday derivation, undated
  exclusion, mean, empty-bucket) before implementing.
- Follow the existing `toKpi`/`kpis` idiom for A and the report's `WEEKDAYS`/`mean`/
  `SeriesPoint` idiom for B. Use `superpowers:systematic-debugging` mindset for C —
  confirm `recentPosts` is truly the wrong gate before swapping it.
- Consult the repo's stack-alignment skills in `.claude/skills/` — at least
  `typescript-strict`, `vitest-testing-library`, `react-19`, and `recharts`.
- Run `superpowers:verification-before-completion` before calling anything done.

═══════════════════════════════════════════════════════════════════════
ACCEPTANCE CRITERIA
═══════════════════════════════════════════════════════════════════════

1.  A "Posts" KPI shows `current.length` with a vs-prior delta against
    `prior.length`, first in the KPI row, using the existing `toKpi` idiom. Pinned
    by a test where current and prior counts differ so the delta is non-trivial.
2.  A weekday chart renders on the dashboard showing AVERAGE impressions per weekday
    (Sun→Sat), titled as a measurement (no "best/top/optimal/recommended" anywhere).
3.  The weekday is derived from `estimated_post_date`; a test proves a post with a
    null estimated date is EXCLUDED from the weekday buckets (not bucketed by its
    scrape weekday), and that any exclusion is disclosed in the UI.
4.  A weekday with no posts contributes 0; the chart's existing empty state still
    triggers when the window has no posts.
5.  The chart respects the range and client filters (aggregates `current`).
6.  `hasData` keys off `analytics.totalPosts > 0`; `recentPosts` is confirmed
    vestigial and flagged (not removed) if nothing else consumes it.
7.  NO new database read is introduced.
8.  Test count strictly greater than the pre-slice baseline, 0 failures, and no
    existing assertion weakened or deleted. If an existing test had to change, name
    it and say why. The report's own weekday chart behaviour is unchanged (if you
    extracted a shared core, a test or the existing report suite proves it).

═══════════════════════════════════════════════════════════════════════
VERIFICATION
═══════════════════════════════════════════════════════════════════════

Confirm the pre-slice baseline (full gate green; record the test count) BEFORE you
start, and report any difference from what this brief assumes.

Run the full gate at the end and paste REAL output:

    pnpm lint && pnpm type:check && pnpm test && pnpm build

Then paste `git status --porcelain` and confirm the only paths changed beyond
whatever was already uncommitted are those in SCOPE.

Verification is the automated gate plus your unit and component tests, and NOTHING
ELSE. Do NOT use Claude-in-Chrome, do NOT start a dev server, do NOT attempt any
browser walk — assert rendering through the component's markup in a test.

Prove each new test discriminates: mutate the implementation, watch the right test
fail, restore. At minimum mutate (a) the Posts KPI to read `prior.length` twice (so
the delta is always zero), (b) the weekday derivation to fall back to
`effectiveMs`/scrape date (so an undated post lands on the scrape weekday), (c) the
weekday aggregate from `mean` to sum (so a high-volume weekday dominates), (d)
`hasData` back to `recentPosts.length` — and show the test that catches each.

═══════════════════════════════════════════════════════════════════════
GUARDRAILS
═══════════════════════════════════════════════════════════════════════

- LEAVE ALL WORK UNCOMMITTED on the current branch. Do not commit, push, branch,
  or open a PR. Never commit to `main`. The user reviews and commits.
- READ THE ACTUAL GIT STATE AT START and report it. Work ahead of you (a committed
  truncation pass, and possibly a fix pass, a cadence slice, and a content-
  composition slice) is NOT yours: build additively, do not revert, stash, reset or
  tidy it, and do not touch `components.json`.
- SURFACE any unexpected commit — never self-heal, rebase, reset or amend.
- Date the weekday by when the post went out (`estimated_post_date`), never by when
  it was scraped. Exclude, never fabricate, an unknown weekday.
- Title the chart as a measurement; no "best/top/optimal/recommended" language; no
  ranking of weekdays.
- No new threshold, floor, or sampling constant. If a change seems to need one,
  FLAG it.
- Distinguish "could not be read", "truncated / lower bound", "genuinely zero", and
  "unknown / not applicable" everywhere — in the service and on screen.
- ADR 0009: raw values are never rewritten; the `bi.*` views own the analytics
  contract; attribution is downstream and can only be observed.
- Reads through `src/services/*` from RSCs; routes and links via `src/paths.ts`.

═══════════════════════════════════════════════════════════════════════
REPORT BACK
═══════════════════════════════════════════════════════════════════════

GIT STATE AT START — what you actually found, and how it differed from this brief.
BUILT — where the Posts KPI sits and confirmation `KpiCards` rendered it with no
  component change; how you computed the weekday buckets and where the chart lives;
  whether you extracted a shared chart core or created a dashboard-specific one, and
  why; the exact `hasData` change and whether `recentPosts` is now vestigial.
DATING — confirmation the weekday uses `estimated_post_date` only, how many undated
  posts your fixtures excluded, and what the UI discloses about them; whether the
  report's weekday chart shares that basis or diverges.
TESTS — what each new test proves, that it failed first for the right reason, the
  mutation table (a–d above), and any existing test you changed with the reason.
VERIFIED — pasted gate output, `git status --porcelain`, test count before/after,
  branch, HEAD.
FLAGS — at minimum: the chart title wording and your confidence a reader won't read
  it as advice; the 7d sparsity and whether you think the chart should be hidden or
  labelled at 7d; `recentPosts` now-vestigial; anything you left alone that looked
  wrong; and anything you stopped short of, with the reason.
```

## Feedback & revisions

- **2026-07-25 — v1 emitted; built and landed (`19dbe14`).** Executer BUILT A, B, C.
  Chose a dashboard-specific `weekday-impressions-chart.tsx` over extracting a shared
  core (the report chart had no guard test, wrappers genuinely differ, shared surface
  ~18 lines). +17 tests, gate green.
- **FLAGS returned by the executer (planner-triaged):**
  - _Report weekday chart diverges_ — it still buckets on `effectiveMs` (fabricated
    rhythm); the dashboard chart here is correct. → Spawned the report-weekday fix
    handoff. **Priority follow-up.**
  - _KpiCards layout orphan_ — 5 small cards + the 2×2 hero wrap "Saves" to a 3rd
    row; REASONED not observed (no live walk). Design call open (5-col grid / hero
    not spanning 2 rows / leave it) — user's eye.
  - _`recentPosts` now vestigial_ — dead after RecentPostsTable removal (`60507b2`);
    small cleanup left for a follow-up (touches ~6 service-test assertions).
  - _Chart title / 7d sparsity_ — accepted as-is (measurement wording, sparsity
    disclosed by the post-count caption; no invented threshold).
    _(Append dated entries here on further feedback; edit the prompt above in place if revised.)_
