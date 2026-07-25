# Handoff — Content composition report section (feature B, text half)

- **Type:** Executer handoff (feature slice)
- **Date:** 2026-07-25
- **Branch:** `feat-additonal-features-for-linkedin-report`
- **Status:** ⚠️ Run / BUILT but **UNCOMMITTED** as of 2026-07-25. Files present in the working tree: `src/services/content-composition.ts` + `.test.ts`, `src/components/dashboard/report/content-composition.tsx` + `.test.tsx`; report wiring modified in `types.ts`, `client-report.ts`, `client-report.test.ts`, `page.tsx`, `print-report.tsx`. Not yet committed; not yet re-verified by the planner.
- **Retro-captured:** authored before the every-prompt-is-a-doc rule; backfilled 2026-07-25.
- **⚠️ Collision:** touches the SAME 5 wiring files as the report-weekday fix handoff. Commit or set this aside before running that fix, or the two changes entangle. See `docs/handoffs/2026-07-25-report-weekday-dating-fix.md`.
- **Deferred half:** `post_format_type` is NOT in the `bi` view, so B's format/asset-type half stays deferred to post-backfill.

## Decision & rationale

A new per-client "Content composition" section in the Client LinkedIn Report
(on-screen + print): descriptive figures over each post's text — top hashtags
(case-folded, with counts), post length (median chars + count past LinkedIn's
1,300-char "see more" fold), and content elements as N-of-M (question, in-text link,
mention, emoji). A PURE `buildContentComposition(rows)` over the posts
`client-report.ts` already reads (`post_content` is in `BiPostRow`/`POST_COLUMNS`) —
no new DB read. The crux is honesty on a ~5-10 post, client-facing sample:
COMPOSITIONAL ONLY — describes what the content IS, claims nothing about what it
"works"/earns; no engagement tied to any feature, no ranking, no causal language.
Genuine absence ("No hashtags used") is a real zero, distinct from the em-dash
"couldn't analyse"; null/empty `post_content` is counted-but-omitted and disclosed.
Exactly one named constant (the 1,300 fold).

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
You are a world-class TypeScript/React engineer with one non-negotiable habit of
mind: you describe a body of content precisely, and you never claim what "works".
To you, "3 of 8 posts asked a question" and "questions drive engagement" are
categorically different sentences — the first is a fact the data contains, the
second is a claim eight posts cannot support — and only the first belongs in a
report a client will read. Where a lesser engineer ranks hashtags by average
impressions off a handful of posts, you show how often each was used and stop,
because the rank would be a story the sample cannot tell.

Working style, non-negotiable:
- Read before you write. ⚠️ comments in this repo document real past defects and
  are binding — never weaken one to make a test pass.
- The core is a PURE function, so RED-first is cheap and mandatory: write the
  failing test that pins each behaviour before the implementation exists.
- Four facts, never collapsed: "could not be analysed", "genuinely none",
  "genuinely zero", and "truncated / a lower bound". In particular a feature a
  client simply never used (no hashtags) is a REAL ZERO stated as a fact — NOT the
  em dash, which is reserved for "we could not analyse this post".
- Do not widen scope silently. If a change seems to need a file outside SCOPE,
  STOP and FLAG it.
- Report honestly. Paste real command output, never a paraphrase of it.

═══════════════════════════════════════════════════════════════════════
GOAL
═══════════════════════════════════════════════════════════════════════

Add a new per-client "Content composition" section to the ArcBase Client LinkedIn
Report — a set of plain descriptive figures, derived from each post's text, that
say WHAT a Client's content is made of: the hashtags they use, how long their
posts run, and how often their posts ask a question, include a link, mention
someone, or use emoji. It renders in BOTH the on-screen report and the printed/
exported report.

This is one bounded feature slice. It is COMPOSITIONAL ONLY. It reports what the
content IS; it says NOTHING about what the content DOES. There is deliberately NO
engagement figure tied to any feature, NO ranking, NO "top-performing"/"best"
language, and NO new database read.

═══════════════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════════════

This repository IS ArcBase — an internal, auth-gated, single-tenant Next.js app
for Arcbound staff to register Clients (individual LinkedIn profiles), ingest
weekly scraped LinkedIn post metrics, and view analytics. It sits mid-pipeline:
external scraper → ArcBase → Supabase `bi.*` views → Power BI.

READ FIRST: `AGENTS.md` (every stack and architecture rule — follow it, do not
restate it), `CONTEXT.md` (domain vocabulary: Attribution, the Service Seam, the
four-state discipline), and ADR 0009 (raw values are never rewritten; the `bi.*`
views own the analytics contract; attribution is downstream and observed-only).
Then read the files this slice builds on, listed under SCOPE, before writing.

WHY THIS SECTION IS COMPOSITIONAL ONLY — THE HEART OF THE SLICE. This report is
CLIENT-FACING: the exported PDF reaches the Client. A single Client has on the
order of five to ten posts. On that many posts, "posts with a question average 40%
more impressions" is not an insight — it is a coincidence dressed as advice, and
printing it under a client's name is the failure this design exists to prevent. So
the section shows COMPOSITION (what the content is) and never ENGAGEMENT-per-
feature (what the content earned). This is the same discipline the rest of this
codebase already enforces: the cross-client comparison forbids ranks and
percentiles; the cadence section forbids a "consistency score"; the reconciliation
panel prints "of N" so a count is never read without its base. Follow it here.
Words like "top-performing", "best", "drives", "boosts", "recommended" must not
appear in any user-facing string — a grep for them should find only forbidding
comments.

NO NEW READ. `src/services/client-report.ts` already reads the Client's full post
history — paged past PostgREST's silent 1000-row cap via `readClientPostRows`,
which returns a `PagedRead<BiPostRow>` carrying `rows`, `truncated`, and `total`,
and already surfaces truncation to both the report and the print report. Each post
row carries `post_content: string | null` (it is in the read's column list).
Content composition is a PURE function over those SAME rows — compute it alongside
the existing report assembly and hang it on the `ClientReport` object, exactly as
`reconcileRates(rows)` (in `data-quality.ts`) and the "Posting cadence" section
(landing on this branch just before this slice) are computed and carried. Do NOT
add a query.

TRUNCATION IS ALREADY HANDLED. Because this rides that same all-time read, under a
capped read its figures are lower bounds — and the report's EXISTING
`AnalyticsTruncated` banner already says so at the top of the page and the print
document. Do NOT add a second banner and do NOT recompute the truncation state
inside this section.

═══════════════════════════════════════════════════════════════════════
WHAT THE SECTION SHOWS — three descriptive groups, all frequencies
═══════════════════════════════════════════════════════════════════════

1. TOP HASHTAGS. Extract hashtags from `post_content` (`#` followed by word
   characters). CASE-FOLD for grouping, so `#SaaS` and `#saas` are ONE hashtag —
   the same canonicalisation lesson the post-format work learned, where grouping
   on the raw string split one value across buckets. Show the most-used, each with
   its usage count, e.g. "#leadership (5) · #saas (3) · #ai (2)", with "+ M more"
   when the list overflows a sensible top-N. If the Client used no hashtags at all,
   render "No hashtags used" — a GENUINE ZERO stated as a fact, NOT an em dash.

2. POST LENGTH. Show the MEDIAN character count of the analysed posts, plus a count
   of how many run past LinkedIn's 1,300-character "see more" fold, e.g. "3 of 8
   posts run past the 'see more' fold".
   ⚠️ NO short/medium/long buckets. Tertiles need invented cutoffs, and this branch
   bans arbitrary threshold constants. 1,300 is the SOLE exception because it is a
   real LinkedIn platform boundary (the point the feed truncates a post), not a
   tuning knob — define it as ONE named, documented constant whose comment states
   that justification, and call it out in your report as the only intentional
   constant in the slice. If you find yourself wanting a second cutoff, STOP and
   FLAG instead.

3. CONTENT ELEMENTS. For each of the following, show "N of M posts":
   • asks a question — a "?" is present in the text.
   • includes a link — a URL appears IN THE TEXT (http:// or https://).
     ⚠️ This is NOT `post_url`. Every post has a `post_url` (its own address);
     counting that would report 100% of posts as "including a link". Count only a
     URL inside `post_content`.
   • mentions someone — an "@handle" appears in the text.
   • uses emoji — a Unicode emoji is present.

═══════════════════════════════════════════════════════════════════════
FOUR-STATE / LOW-N RULES (the reason this slice is careful, not just parsed)
═══════════════════════════════════════════════════════════════════════

The live data is sparse and a Client with a handful of posts is the NORMAL case,
so these states ARE the specification. Pin each with a test.

  • 0 posts at all → the report's EXISTING no-data state handles it; render no
    section body.
  • A post with NULL or EMPTY `post_content` cannot be analysed for text. COUNT it
    in the total, OMIT it from every feature, and DISCLOSE the omission in plain
    language, e.g. "2 of 8 posts have no captured text and aren't analysed here" —
    the exact counted-but-omitted honesty the cadence section uses for undated
    posts. The disclosure names no raw column and no dev-tell.
  • A feature the Client GENUINELY did not use (no hashtags, no emoji, no links) →
    a REAL ZERO, stated as a fact ("No hashtags used", "0 of 8 posts"). NEVER an em
    dash — the em dash means "could not be analysed", which is a different fact.
  • Never coerce absence into a misleading value: a post with no link is not a
    post with an empty link; an unanalysable post is not a post with zero of
    everything.

═══════════════════════════════════════════════════════════════════════
SCOPE
═══════════════════════════════════════════════════════════════════════

CREATE  the pure content-composition function + its test. Match the
        `reconcileRates` / cadence precedent — a small `src/services/
        content-composition.ts` + `content-composition.test.ts`, or co-located
        with the report service; your call, but it MUST be a pure, independently-
        tested function taking the rows and returning the composition shape. If a
        tiny text/hashtag helper is warranted it may live in `src/lib`, but do NOT
        over-abstract for one feature, and reuse any existing text/`snippet`
        helper rather than duplicating it.
MODIFY  `src/services/types.ts` — add the composition field to the `ClientReport`
        type (and any small result type the function returns). Leave other types
        intact.
MODIFY  `src/services/client-report.ts` + `src/services/client-report.test.ts` —
        compute composition over the rows already read, hang it on the returned
        `ClientReport`, and extend the suite for the new field.
CREATE  `src/components/dashboard/report/content-composition.tsx` + a render test.
MODIFY  the on-screen report page `src/app/(app)/clients/[id]/report/page.tsx`
        and the print report `src/components/dashboard/report/print/print-report.tsx`
        to render the new section as a sibling of the existing sections. Name both
        surfaces in your report.

Do NOT touch: the cadence slice's own logic, the dashboard analytics comparison,
the ingestion path, the Data Quality service, `nav-config.ts`, `components.json`,
or anything in Shay's `bi.*` views. Do NOT add a database query. If a change
appears to need a file outside this list, STOP and FLAG it.

═══════════════════════════════════════════════════════════════════════
APPROACH
═══════════════════════════════════════════════════════════════════════

- Use `superpowers:test-driven-development`: the composition function is pure, so
  write the RED test for each behaviour and each low-N state and watch it fail for
  the right reason BEFORE implementing.
- Follow the `reconcileRates(rows)` / cadence precedent for the service shape, and
  the existing report sections for the component + print wiring.
- Consult the repo's stack-alignment skills in `.claude/skills/` — at least
  `typescript-strict`, `vitest-testing-library`, and `react-19`.
- Run `superpowers:verification-before-completion` before calling anything done.

═══════════════════════════════════════════════════════════════════════
ACCEPTANCE CRITERIA
═══════════════════════════════════════════════════════════════════════

1.  A "Content composition" section renders in BOTH the on-screen report and the
    exported/printed report, as a sibling of the existing sections.
2.  Top hashtags render case-folded (a test proves `#SaaS` and `#saas` merge to one
    with a combined count), each with its usage count; "No hashtags used" renders
    as a real zero when there are none.
3.  Median character length renders, plus the count of posts past the 1,300-char
    "see more" fold. Exactly ONE named, documented constant exists (the 1,300
    fold); a grep finds no other magic length cutoff.
4.  The four element counts render as "N of M". A test proves "includes a link"
    counts a URL inside `post_content` and does NOT count `post_url` (i.e. a post
    with no in-text URL reads 0, even though it has a `post_url`).
5.  A post with null/empty `post_content` is counted in the total, omitted from
    every feature, and disclosed in plain language — pinned by a test.
6.  Genuine absence reads as a real zero; "could not be analysed" reads as an em
    dash; a test distinguishes the two.
7.  NO engagement figure, ranking, percentile, "top/best/drives/recommended", or
    causal framing appears in any code path or user-facing string.
8.  NO new database read is introduced; composition consumes the rows
    `client-report.ts` already fetched. No second truncation banner is added.
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
browser or print walk — assert print-safety through the component's markup in a
test, not by rendering a PDF.

Prove each new test discriminates: mutate the implementation, watch the right test
fail, restore. At minimum mutate (a) hashtag extraction to NOT case-fold (so
`#SaaS`/`#saas` double-count), (b) "includes a link" to read `post_url` instead of
in-text URLs (so every post counts), (c) the null-`post_content` post counted into
a feature instead of omitted, (d) "No hashtags used" rendered as an em dash instead
of a real zero, (e) the 1,300 fold changed, so the fold-count test catches it.

═══════════════════════════════════════════════════════════════════════
GUARDRAILS
═══════════════════════════════════════════════════════════════════════

- LEAVE ALL WORK UNCOMMITTED on the current branch. Do not commit, push, branch,
  or open a PR. Never commit to `main`. The user reviews and commits.
- READ THE ACTUAL GIT STATE AT START and report it. Work ahead of you (a committed
  truncation pass, possibly a fix pass, and the cadence slice) is NOT yours: build
  additively on it, do not revert, stash, reset or tidy it, and do not touch
  `components.json`.
- SURFACE any unexpected commit — never self-heal, rebase, reset or amend.
- Compositional only: no engagement per feature, no ranking, no causal language.
- No new threshold, floor, or sampling constant beyond the single documented
  1,300-char fold. If a fix seems to need one, FLAG it instead.
- Distinguish "could not be analysed", "genuinely none / zero", and "truncated /
  lower bound" everywhere — in the service and on screen.
- No raw enum tokens, internal codes, or dev-tells in any user-facing string.
- ADR 0009: raw values are never rewritten; the `bi.*` views own the analytics
  contract; attribution is downstream and can only be observed.
- Reads through `src/services/*` from RSCs; routes and links via `src/paths.ts`.

═══════════════════════════════════════════════════════════════════════
REPORT BACK
═══════════════════════════════════════════════════════════════════════

GIT STATE AT START — what you actually found, and how it differed from this brief.
BUILT — where `buildContentComposition` lives and the shape it returns; where the
  section renders on screen and in print; any text helper you reused vs created.
FEATURES — how you extract hashtags and case-fold them; how "includes a link"
  distinguishes in-text URLs from `post_url`; how you detect emoji; the exact
  wording of the 1,300-char fold line.
FOUR STATES — what the section renders for 0 posts / an unanalysable post / a
  genuinely-absent feature, each quoted, and the exact undated-text disclosure.
TESTS — what each new test proves, that it failed first for the right reason, the
  mutation table (a–e above), and any existing test you changed with the reason.
VERIFIED — pasted gate output, `git status --porcelain`, test count before/after,
  branch, HEAD.
FLAGS — at minimum: the single 1,300-char constant and its justification; whether
  a non-technical reader reads the null-text disclosure correctly; the VALUE
  CAVEAT that this feature is correct regardless but its worth depends on
  `post_content` actually being populated in real data (unconfirmed — the live DB
  is ~50 rows with an unknown real source), plus any `post_content` fill signal
  your fixtures/tests happened to reveal; anything you left alone that looked
  wrong; and anything you stopped short of, with the reason.
```

## Feedback & revisions

- **2026-07-25 — v1 emitted; built, left uncommitted.** The executer produced the
  slice's files (listed in Status) in the working tree; they are UNCOMMITTED,
  awaiting the user's review/commit. The planner has not re-run the gate on them.
- **VALUE CAVEAT (from the brief, still open):** the feature is correct regardless,
  but its worth depends on `post_content` actually being populated in real data —
  unconfirmed (live DB ~50 rows, real source unknown). Verify real fill separately.
- **Collision to resolve before the report-weekday fix runs** — see Status.
  _(Append dated entries here on further feedback; edit the prompt above in place if revised.)_
