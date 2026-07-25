# Handoff — Posting cadence report section (feature E)

- **Type:** Executer handoff (feature slice)
- **Date:** 2026-07-25
- **Branch:** `feat-additonal-features-for-linkedin-report`
- **Status:** Run / landed — committed `c9b3040` (component), refined `8bcefd1` (timeline captions) + `d27b177` (data-handling doc comments).
- **Retro-captured:** authored before the every-prompt-is-a-doc rule; backfilled 2026-07-25.
- **Related:** the `estimated_post_date`-only dating discipline shared with the dashboard weekday chart and the report-weekday fix; `reconcileRates(rows)` service precedent.

## Decision & rationale

A new per-client "Posting cadence" section in the Client LinkedIn Report (on-screen

- print): five plain descriptive figures (total posts, posts/week over the active
  span, median gap, longest gap, days since last) plus an all-time timeline. A PURE
  `buildCadence(rows)` over the posts `client-report.ts` already reads — no new DB
  read. The heart of the slice is the dating rule: dated by `estimated_post_date`
  ALONE (never `effectiveMs`, whose `scraped_at` fallback would pile undated posts
  onto the scrape instant and fabricate a rhythm); undated posts counted-but-omitted
  and disclosed. Deliberately NO consistency score. Print-safe timeline. Four-state
  honesty at low N.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
You are a world-class TypeScript/React data-visualisation engineer with one
defining instinct: you refuse to render a number the data cannot support, and you
date an event by when it HAPPENED, never by when it was observed. Where a lesser
engineer prints a confident "regularity: 72/100" from three data points, you show
the three points and let the reader see there are only three. A gap between two
posts is real; a gap manufactured by collapsing undated posts onto the moment they
were scraped is a lie the chart tells with a straight face, and you do not tell it.

Working style, non-negotiable:
- Read before you write. ⚠️ comments in this repo document real past defects and
  are binding — never weaken one to make a test pass.
- This is a FEATURE built test-first: the core is a PURE function, so RED-first is
  cheap and mandatory — write the failing test that pins each behaviour before the
  implementation exists.
- "Could not be read", "not applicable", "genuinely zero", and "truncated / a
  lower bound" are FOUR different facts. They must never collapse into one another,
  on screen or in the service.
- Do not widen scope silently. If a change seems to need a file outside SCOPE,
  STOP and FLAG it rather than editing it.
- Report honestly. Paste real command output, never a paraphrase of it.

═══════════════════════════════════════════════════════════════════════
GOAL
═══════════════════════════════════════════════════════════════════════

Add a new per-client "Posting cadence" section to the ArcBase Client LinkedIn
Report — a set of plain descriptive figures plus an all-time post timeline that
lets a reader see how regularly a Client posts. It renders in BOTH the on-screen
report and the printed/exported report. It reports rhythm; it never SCORES it.

This is one bounded feature slice. There is deliberately NO "consistency score",
NO new database read, and NO period picker involved.

═══════════════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════════════

This repository IS ArcBase — an internal, auth-gated, single-tenant Next.js app
for Arcbound staff to register Clients (individual LinkedIn profiles), ingest
weekly scraped LinkedIn post metrics, and view analytics. It sits mid-pipeline:
external scraper → ArcBase → Supabase `bi.*` views → Power BI.

READ FIRST: `AGENTS.md` (every stack and architecture rule — follow it, do not
restate it), `CONTEXT.md` (domain vocabulary: Attribution, the Service Seam, and
the four-state discipline), and ADR 0009 (raw values are never rewritten; the
`bi.*` views own the analytics contract; attribution is downstream and can only be
observed). Then read the files this slice builds on, listed below, before writing.

WHY THIS SECTION EXISTS AND WHERE IT SITS. The Client report already carries
temporal sections (Day-of-Week, Trends) that run over the Client's ALL-TIME post
history. "Posting cadence" is their sibling: same all-time basis, same report,
same export. It answers "how often, and how evenly, does this Client post?" — a
question staff currently cannot answer from ArcBase.

THE DATING DECISION THAT IS THE HEART OF THIS SLICE. Each post carries two
timestamps. `estimated_post_date` is when the post actually went up — but Shay's
resolver only resolves day-granularity ages, so HOUR-AGE posts come back with
`estimated_post_date = null`. `scraped_at` is when ArcBase pulled the post, and it
is the SAME instant for every post in one scrape batch. The repo's `effectiveMs`
helper falls back from the first to the second, which is correct for WINDOWING
("is this post in range") but POISON for cadence: it would drop every undated post
onto one scrape instant, fabricate same-day clusters, and report a Client as more
regular than they are.

⚠️ THEREFORE CADENCE IS DATED BY `estimated_post_date` ALONE. A post with no
`estimated_post_date` is COUNTED in the total but is OMITTED from every gap
calculation and from the timeline, and that omission is DISCLOSED in plain
language. Never substitute `scraped_at` to avoid an omission. `src/services/
analytics.ts` already has the right helper: the one that parses `estimated_post_date`
only and returns `null` when it is absent (find it near the top, around the
`effectiveMs` definition — it is the null-returning sibling, NOT `effectiveMs`).
Reuse it; do not write a new date parser and do not use `effectiveMs` here.

NO NEW READ. `src/services/client-report.ts` already reads the Client's full
post history — paged past PostgREST's silent 1000-row cap via `readClientPostRows`,
which returns a `PagedRead<BiPostRow>` carrying `rows`, `truncated`, and `total`,
and already surfaces truncation to both the report and the print report. Cadence is
a PURE function over those SAME rows. Compute it in the service alongside the
existing report assembly and hang it on the `ClientReport` object — exactly as
`reconcileRates(rows)` in `src/services/data-quality.ts` is computed and carried.
Do not add a query.

TRUNCATION IS ALREADY HANDLED. Because cadence rides that same all-time read,
under a capped read its figures are lower bounds — and the report's EXISTING
`AnalyticsTruncated` banner already says so at the top of the page and the print
document. Do NOT add a second truncation banner; do NOT recompute or re-derive the
truncation state inside cadence.

═══════════════════════════════════════════════════════════════════════
WHAT THE SECTION SHOWS
═══════════════════════════════════════════════════════════════════════

FIVE figures, all plain descriptions, median-based where a mean would mislead:

  • Total posts (all-time) — the N anchor, so every other figure is read against
    a visible sample size.
  • Posts per week — computed over the ACTIVE SPAN, i.e. first dated post → last
    dated post, NOT first dated post → today. A Client who posted steadily then
    stopped must read as their true rhythm-WHILE-active; the silence since is
    carried by "days since last post", not baked into the rate.
  • Median gap between consecutive dated posts, in days — MEDIAN, not mean, so a
    single long hiatus does not inflate it.
  • Longest gap, in days — the "went quiet" signal.
  • Days since last (dated) post — whether they are active now.

A TIMELINE: a horizontal all-time axis with one tick per DATED post and month
labels — a reader sees the rhythm and the gaps directly. It must be PRINT-SAFE by
construction: the repo's report charts mis-size under `ResponsiveContainer` at
print time, so print uses a fixed width and `isAnimationActive={false}` (see the
existing report charts and the print CSS). A ticks-only strip may be cleaner as a
lightweight inline SVG than as a recharts chart — your call, but PRINT-SAFETY IS
THE HARD CONSTRAINT: the exported PDF must render the timeline correctly, with
fills intact (`print-color-adjust: exact`) and no page-break splitting it.

⚠️ NO CONSISTENCY SCORE ANYWHERE. No 0–100 index, no coefficient of variation, no
"fairly regular" label, no percentile. On a handful of posts such a number is
noise wearing a lab coat, and it is banned here for the same reason the cross-
client comparison forbids ranks and percentiles and the reconciliation panel
prints "of N": the figures must be honest at any N. The gaps ARE the finding; the
timeline lets the reader judge regularity themselves.

═══════════════════════════════════════════════════════════════════════
THE FOUR-STATE / LOW-N RULES (the reason this slice is careful, not just charted)
═══════════════════════════════════════════════════════════════════════

The live data is sparse — a Client with three posts is the NORMAL case, not the
edge — so these states are the specification, not an afterthought. Pin each with a
test.

  • 0 posts at all → the report's EXISTING no-data state handles it; render no
    cadence section body.
  • Posts exist but 0 are DATED (all undated) → cadence is NOT APPLICABLE: render
    the figures as the not-applicable em dash (—) with an sr-only reason, and show
    ONLY the disclosure line. Do not show a rate or a gap computed from nothing.
  • Exactly 1 dated post → there are no gaps. The timeline shows the single mark;
    the gap and rate figures render the not-applicable em dash with an sr-only
    "needs at least two dated posts to measure a gap"; "days since last post" still
    shows (it is defined for one post).
  • 2+ dated posts → full figures over N−1 gaps.

DISCLOSURE OF UNDATED POSTS, ALWAYS. Whenever any post lacks `estimated_post_date`,
state it in plain staff language beneath the figures, e.g. "3 of 24 posts have no
post date and aren't placed on the timeline." Never a raw column name, never a
dev-tell. This is the "counted but omitted" honesty that keeps Total posts and the
timeline reconcilable.

⚠️ NEVER COERCE ABSENCE TO ZERO. A missing gap is not a 0-day gap; an undated post
is not a post on scrape day; a Client with no dated posts has no measured cadence,
not a cadence of zero. Every one of these is the not-applicable state.

═══════════════════════════════════════════════════════════════════════
SCOPE
═══════════════════════════════════════════════════════════════════════

CREATE  the pure cadence function + its test. Match the `reconcileRates`
        precedent — either a small `src/services/cadence.ts` + `cadence.test.ts`,
        or co-located with the report service; your call, but it MUST be a pure,
        independently-tested function taking the rows and returning the cadence
        shape. Reuse the existing `estimated_post_date`-only date helper and the
        existing `median` helper (see below) — add NO third copy of either.
MODIFY  `src/services/types.ts` — add the cadence field to the `ClientReport`
        type (and any small result type the function returns). Leave other types
        intact.
MODIFY  `src/services/client-report.ts` + `src/services/client-report.test.ts` —
        compute cadence over the rows already read, hang it on the returned
        `ClientReport`, and extend the suite for the new field.
CREATE  `src/components/dashboard/report/posting-cadence.tsx` (plus a light
        figure/timeline sub-component if it genuinely clarifies) + a render test.
MODIFY  the on-screen report page `src/app/(app)/clients/[id]/report/page.tsx`
        and the print report `src/components/dashboard/report/print/print-report.tsx`
        to render the new section in the correct place (a sibling of the existing
        temporal sections). Name both surfaces in your report.

Do NOT touch: the dashboard analytics comparison, the ingestion path, the Data
Quality service, `nav-config.ts`, `components.json`, or anything in Shay's `bi.*`
views. Do NOT add a database query. Do NOT add the section to the period picker.
If a change appears to need a file outside this list, STOP and FLAG it.

⚠️ THE `median` HELPER. `median` currently exists as a private copy in
`analytics.ts` (and in `data-quality.ts`). A second fix pass may have lifted it to
`@/lib` before you run. CHECK FIRST: if `src/lib/median.*` exists, import from
there; otherwise reuse the existing analytics `median`. Under NO circumstances add
a third copy — if neither import path is clean, STOP and FLAG.

═══════════════════════════════════════════════════════════════════════
APPROACH
═══════════════════════════════════════════════════════════════════════

- Use `superpowers:test-driven-development`: the cadence function is pure, so
  write the RED test for each state (0 dated / 1 dated / 2+ dated / undated
  disclosure / median-not-mean / active-span rate / longest gap / days-since-last)
  and watch it fail for the right reason BEFORE implementing.
- Follow the `reconcileRates(rows)` precedent for the service shape, and the
  existing report sections (e.g. the Day-of-Week chart) for the component + print
  wiring and the recharts-print discipline.
- Consult the repo's stack-alignment skills in `.claude/skills/` — at least
  `typescript-strict`, `vitest-testing-library`, `react-19`, and `recharts` if you
  chart the timeline with it.
- Run `superpowers:verification-before-completion` before calling anything done.

═══════════════════════════════════════════════════════════════════════
ACCEPTANCE CRITERIA
═══════════════════════════════════════════════════════════════════════

1.  A "Posting cadence" section renders in BOTH the on-screen report and the
    exported/printed report, as a sibling of the existing temporal sections.
2.  The five figures compute correctly: Total posts (all-time); Posts/week over
    the active span (first→last dated post, not to today); Median gap (median, not
    mean); Longest gap; Days since last dated post. Pinned by tests where median
    and mean would differ, and where active-span and to-today rates would differ.
3.  Cadence is dated by `estimated_post_date` only. A test proves undated posts are
    COUNTED in Total posts, OMITTED from every gap and from the timeline, and that
    no undated post is placed at `scraped_at`.
4.  The undated-posts disclosure renders whenever any post is undated, in plain
    language, naming no raw column.
5.  Each low-N state renders its correct four-state treatment: 0 posts → no body;
    0 dated → not-applicable figures + disclosure only; 1 dated → single timeline
    mark, em-dash gaps/rate with sr-only reason, days-since-last shown; 2+ dated →
    full figures. Every one pinned by a test.
6.  NO consistency score, index, percentile, or regularity label exists anywhere
    in the code or the UI. (A grep for such a term finds only forbidding comments,
    if any.)
7.  NO new database read is introduced; cadence consumes the rows
    `client-report.ts` already fetched. No second truncation banner is added.
8.  The timeline renders correctly in the exported PDF (print-safe width, no
    animation, fills intact, not split across a page break).
9.  Test count strictly greater than the pre-slice baseline, 0 failures, and no
    existing assertion weakened or deleted. If an existing test had to change, name
    it and say why.

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
browser or print walk — assert print-safety through the component's props/markup
in a test, not by rendering a PDF.

Prove each new test discriminates: mutate the implementation, watch the right test
fail, restore. At minimum mutate (a) median → mean, (b) active-span rate → to-today
rate, (c) dating basis → `effectiveMs` (so an undated post lands at scrape time),
(d) the undated post counted in gaps instead of omitted, (e) the 1-dated-post case
computing a gap of 0 instead of the not-applicable state.

═══════════════════════════════════════════════════════════════════════
GUARDRAILS
═══════════════════════════════════════════════════════════════════════

- LEAVE ALL WORK UNCOMMITTED on the current branch. Do not commit, push, branch,
  or open a PR. Never commit to `main`. The user reviews and commits.
- READ THE ACTUAL GIT STATE AT START and report it. Work ahead of you (a committed
  truncation pass, possibly a committed or uncommitted fix pass) is NOT yours:
  build additively on it, do not revert, stash, reset or tidy it, and do not touch
  `components.json`.
- SURFACE any unexpected commit — never self-heal, rebase, reset or amend.
- Date cadence by `estimated_post_date` only; never substitute `scraped_at`.
- No consistency score, and no new threshold, floor, or sampling constant. If a
  fix seems to need one, FLAG it instead.
- Distinguish "could not be read", "truncated / lower bound", "genuinely zero",
  and "not applicable" everywhere — in the service and on screen.
- No raw enum tokens, internal codes, or dev-tells in any user-facing string.
- ADR 0009: raw values are never rewritten; the `bi.*` views own the analytics
  contract; attribution is downstream and can only be observed.
- Reads through `src/services/*` from RSCs; routes and links via `src/paths.ts`.

═══════════════════════════════════════════════════════════════════════
REPORT BACK
═══════════════════════════════════════════════════════════════════════

GIT STATE AT START — what you actually found, and how it differed from this brief.
BUILT — where `buildCadence` lives and the shape it returns; where the section
  renders on screen and in print; the `median` import path you used and why it was
  the clean one.
DATING — confirmation cadence uses `estimated_post_date` only, and exactly what
  the undated disclosure renders.
FOUR STATES — what the section renders for 0 / 0-dated / 1-dated / 2+-dated, each
  quoted.
TIMELINE — how you made it print-safe, and whether you used recharts or inline SVG
  and why.
TESTS — what each new test proves, that it failed first for the right reason, the
  mutation table (a–e above), and any existing test you changed with the reason.
VERIFIED — pasted gate output, `git status --porcelain`, test count before/after,
  branch, HEAD.
FLAGS — at minimum: the exact wording of the undated-posts disclosure and whether
  a non-technical reader would read it correctly; whether "posts/week" is the right
  unit for a low-frequency poster or whether "posts/month" reads better (state your
  choice, don't silently pick); anything you left alone that looked wrong; and
  anything you stopped short of, with the reason.
```

## Feedback & revisions

- **2026-07-25 — v1 emitted, then landed.** Executer ran it; committed as `c9b3040`
  (`PostingCadence` component + `buildCadence` service), then refined by `8bcefd1`
  (timeline captions for clarity) and `d27b177` (comment/doc clarity on data
  handling). No planner-side revision to the prompt was needed.
  _(Append dated entries here on further feedback; edit the prompt above in place if revised.)_
