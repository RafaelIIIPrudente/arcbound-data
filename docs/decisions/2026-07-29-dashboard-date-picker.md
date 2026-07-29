# Decision record — dashboard date picker (2026-07-29)

- **Type:** Feature shaping record (planning session).
- **Branch:** `feat-add-date-picker`.
- **Origin prompt (verbatim):** _"I want to implement a date picker for
  'Screenshot 2026-07-29 at 2.46.30 PM.png'"_ — the screenshot is the Dashboard
  (`/`, `metadata.title = "Post analytics"`), showing the filter bar
  `ALL CLIENTS ▾` · `LAST 30 DAYS ▾`.
- **Method:** `/grill-with-docs` — one question at a time, planner recommends,
  the operator decides. Facts looked up in the repo, never asked.

## Repo facts established before grilling (looked up, not asked)

Two period vocabularies already exist and do not share code:

|            | Dashboard (`/`)                                                                  | Client report (`/clients/[id]/report`, `/posts`)                  |
| ---------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Component  | `src/components/dashboard/analytics/dashboard-filters.tsx`                       | `src/components/dashboard/report/report-period-picker.tsx`        |
| Vocabulary | `DashboardRange = "7d" \| "30d" \| "90d"` (`services/types.ts:66`) — **rolling** | `ReportPeriod` — `all` / `year` / `quarter` / `month` — **named** |
| URL param  | `?range=` (`?client=` alongside)                                                 | `?period=`                                                        |
| Default    | `30d` (`normalizeRange`, `app/(app)/page.tsx:22`)                                | newest month                                                      |

Load-bearing details on the Dashboard side:

- `RANGE_DAYS` (`analytics.ts:58`) drives `currentWindow` **and** a prior window
  of the same length (`analytics.ts:233-240`) — every ▲/▼ on the screen is
  "vs. prior N days". A range change is not just a filter; it redefines the
  comparison baseline.
- `RANGE_BUCKETS` (`analytics.ts:60`) = 7 / 5 / 3 — how the two time-series
  charts bucket.
- `RANGE_LABEL` (`analytics.ts:52`) — the "vs. prior 30 days" copy and the chart
  captions.
- `getDashboardAnalytics` **bounds the DB read** at `now − 2 × RANGE_DAYS`
  (`analytics.ts:604`). Widening the window widens the read, and the read is
  paged with a truncation banner already wired (`AnalyticsTruncated`).
- `effectiveMs` (`analytics.ts:135`) is how a post is dated for windowing —
  `estimated_post_date`, falling back to `scraped_at` for hour-age posts.

UI primitives present in `src/components/ui/`: no `calendar`, no `popover`.
`package.json` has no `react-day-picker` and no `date-fns`. A real calendar UI
is therefore a **new dependency**, not a composition of what is already here.

## Decisions

### D1 — A real custom start/end calendar, presets kept

**Asked:** does "date picker" mean an arbitrary start/end calendar, more presets,
or reusing the report's named-period picker?

**Decision:** a **custom start/end calendar**. The three rolling presets stay;
a "Custom range…" option opens a calendar and any start/end pair can be chosen.

**Consequence — accepted:** `DashboardRange` stops being a three-value union.
`RANGE_DAYS`, `RANGE_BUCKETS`, `RANGE_LABEL`, the read bound at
`analytics.ts:604`, `normalizeRange` and the URL encoding all have to take an
arbitrary window. A calendar primitive does not exist in this repo, so this
adds a dependency (`react-day-picker`, plus shadcn `calendar` and `popover`).

### D2 — Baseline: the immediately preceding equal-length window

**Asked:** with an arbitrary range, what do the ▲/▼ deltas compare against?

**Decision:** the **equal-length window immediately before the selected one**.
A 48-day range compares against the 48 days before it; the caption reads
"vs. prior 48 days".

**Reasoning:** it generalises the existing rule (`analytics.ts:233-240`) rather
than inventing a second one, so presets and custom ranges remain one concept.

**Rejected:**

- _No deltas on custom ranges_ — the em dash is this repo's reserved sign for
  "couldn't compute", not "not applicable"; reusing it here would lie.
- _Same dates one year earlier_ — the live `bi` view held ~74 posts total as of
  2026-07-25 with no 2025 history, so every KPI would take `toKpi`'s `prior = 0`
  branch and read "▲ 100% — grew from nothing".

**Consequence:** the dashboard's DB read bound (`2 × span`) now scales with the
chosen range. The paged read and the existing `AnalyticsTruncated` banner
already cover the volume honestly — no new banner.

### D3 — Scope: dashboard **and** the staff report/posts screens

**Decision:** both period vocabularies gain a custom range —
`/` (`?range=`) and `/clients/[id]/report` + `/clients/[id]/posts` (`?period=`),
including the print/export scope captions.

**Consequence:** `ReportPeriod` is a tagged union resolved service-side, so this
touches `services/client-report.ts`, `print-report.tsx`, and every
`scopeCaption` call site — materially more than the dashboard alone.

### D3a — The client-facing report link does **not** get it

**Fact established (looked up, not asked):** `/r/[token]` — the tokenized report
a client holds — renders the **same** `ReportPeriodPicker`
(`src/components/report-link/public-report.tsx:164`). Adding "Custom range…" to
that component ships it to clients automatically unless deliberately gated.

**Decision:** the picker takes an explicit **`allowCustom`** prop. Staff screens
pass `true`; `/r/[token]` passes `false` and keeps the named periods it has
today.

**Reasoning:** it holds the staff/client boundary the app draws everywhere else
(clients already see outreach as counts, never prospect rows), and keeps a
client's report on periods that can be named back to them in a conversation.
Costs one prop and one branch.

### D4 — Limits: future dates blocked, no maximum span

**Decision:** dates after today are disabled; start and end are otherwise
unrestricted; an inverted range is unreachable (a second pick before the first
restarts the selection).

**Reasoning:** "today" is a **principled** boundary, not a tuning knob — no post
exists in the future, and an end date beyond today would silently pad the window
and shift the prior baseline (D2) by the same amount. A maximum span, by
contrast, would be an invented cutoff; the paged read and the existing
`AnalyticsTruncated` banner already handle volume honestly.

**Rejected:** clamping to the client's own first/last post date — it costs a read
on every screen and hides the honest answer that a window genuinely has no posts,
which the empty state already states plainly.

### D5 — Bucketing: width chosen by span, one rule everywhere

**Decision:** bucket **width** derives from the span — daily up to 14 days,
weekly up to 120, monthly beyond — and the same rule serves presets and custom
ranges. Replaces `RANGE_BUCKETS` (a fixed bucket _count_ per preset) and
`bucketLabel`'s branching on the literal strings `"7d"` / `"90d"`
(`analytics.ts:288-304`).

**Reasoning:** one definition of "a bucket", matching the discipline
`currentWindow` already enforces for "the window" — a second copy is how two
surfaces come to disagree.

**Accepted regression:** _Last 30 days_ changes appearance. It currently draws 5
buckets of 6 days labelled `Wk 1…Wk 5`; under a weekly rule it draws 4 weeks
plus a partial. Same data, different bars.

**⚠️ Flagged constant.** 14 and 120 days _are_ invented cutoffs, which cuts
against D4's own reasoning. The distinction being drawn: these are
**readability** boundaries governing how bars are drawn, not analytical ones
asserting anything about the data — unlike a "short/medium/long post" tertile,
which the content-composition slice explicitly banned. Both must be named,
documented constants carrying that justification.

### D6 — Control: one popover, presets beside an inline calendar

**Decision:** the range control stops being a `Select` and becomes a Popover —
presets down one side, a two-month calendar beside them, an Apply button.

**Reasoning:** a Radix `Select` cannot host a calendar inside a `SelectItem`,
and this is shadcn's standard date-range pattern. One control, one concept.

**Rejected:** a separate calendar button beside the existing Select — it puts
two controls on screen that both answer "what window am I looking at?", and they
can visibly disagree.

**Consequence:** adds `ui/popover.tsx` and `ui/calendar.tsx` +
`react-day-picker`; both `dashboard-filters.tsx` and `report-period-picker.tsx`
stop being thin `Select` wrappers. The preset column differs per surface
(dashboard: 7/30/90; report: All time / Years / Quarters / Months), so the
options are passed in rather than hard-coded.

### D7 — The dashboard gains "All time", with deltas suppressed

**Decision:** "All time" joins the dashboard preset column. While it is active
the ▲/▼ chips are **hidden entirely** and the "vs. prior …" line is dropped.

**⚠️ Not an em dash.** This repo reserves "—" for _couldn't compute_. All-time
has no comparable prior window at all, which is a different statement, so the
chip is absent rather than rendered empty.

**Fact established (looked up, not asked):** `Kpi` (`types.ts:68`) declares
`delta: number` and `direction` as required, and is consumed **only** by
`analytics.ts` and `kpi-cards.tsx`. Making `delta` nullable is therefore
contained — the report carries its own types and is unaffected.

**Consequence:** the read bound (`analytics.ts:604`) becomes unbounded for
all-time, so the `AnalyticsTruncated` banner is more likely to fire. It is
already wired; no new banner.

### D8 — Delivery: three sequenced handoffs

**Decision:** three slices, each independently green and reviewable, rather than
one large brief.

| Slice                 | Delivers                                                                                                                                                | Screens touched                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **S1 — foundation**   | `react-day-picker`, `ui/calendar.tsx`, `ui/popover.tsx`, the shared range-picker component, and the pure date/range/bucketing helpers — all unit-tested | none                                                 |
| **S2 — dashboard**    | `?range=` gains custom + all-time; `analytics.ts` windowing, bucketing and read bound; `Kpi.delta` nullable; `DashboardFilters` adopts the popover      | `/`                                                  |
| **S3 — report/posts** | `?period=` gains a custom kind; `client-report.ts`; the `allowCustom` gate; print scope captions                                                        | `/clients/[id]/report`, `/clients/[id]/posts`, print |

**Reasoning:** S1's tests pin the honesty rules (D2, D4, D5) **before** any UI
depends on them, and S3 touches a client-facing surface that should not share a
gate with a windowing rewrite.

## Planner-decided specifics (mechanical — recorded, not asked)

These follow from D1–D8 and existing repo rules; they are the executer's brief,
not open questions.

1. **URL encoding — one param per surface, never two.**
   - Dashboard `?range=` : `7d` | `30d` | `90d` | `all` | `2026-06-12..2026-07-29`.
     Keeps `normalizeRange` (`app/(app)/page.tsx:22`) as the single decoder and
     `hrefFor`'s omit-when-default logic intact.
   - Report `?period=` : existing named keys, plus `custom:2026-06-12..2026-07-29`.
     Fits the existing `periodKey` string contract, so `reportPeriodHref` is
     unchanged.
   - **⚠️ `report-period.ts:35` documents that the encoder must ALWAYS write the
     param, never strip it** — an absent param legitimately means "no choice
     yet". That rule extends to custom keys verbatim.

2. **Timezone — UTC, explicitly.** The existing code windows in UTC
   (`getUTCDay`, `.toISOString().slice(0,10)`). A calendar day picked by a user
   in any zone must resolve to `[start 00:00:00.000Z, end 23:59:59.999Z]`, via a
   named, tested helper. Not a behaviour change — a rule made explicit so the
   picker cannot drift from the windowing.

3. **Read bound for a range ending in the past.** Today's bound is
   `now − 2 × days` because the window always ends at now. For a custom range
   the lower bound is **`start − span`** (the prior window's start), not
   `now − 2 × span`. Lower bound only — no upper bound in the query; rows past
   the end are filtered in memory by `currentWindow`, and adding an upper bound
   would interact badly with the `.or(… estimated_post_date.is.null)` clause
   that deliberately keeps hour-age posts (`analytics.ts:589`). For all-time,
   the bound is dropped entirely.

4. **Mobile.** Two months side by side does not fit below `sm`; render one month
   there. Mobile regressions have bitten this repo before (PR #11).

5. **Trigger label.** `12 JUN – 29 JUL 2026`, in the existing mono/uppercase
   `TRIGGER` style (`dashboard-filters.tsx:20`). All-time reads `ALL TIME`.

6. **`scopeCaption` for a custom period.** `Scoped to 12 Jun – 29 Jul 2026`.
   The existing rule — labels not lowercased because months and quarters are
   proper nouns, all-time alone lowercased as prose — is unaffected.

## S1 — landed, uncommitted, planner-verified (2026-07-29)

Gate green: `pnpm lint && pnpm type:check && pnpm test && pnpm build` → exit 0.
**1,289 → 1,380 tests (+91), 90 → 93 files.** Nothing weakened or skipped.

Planner verified independently, not taken on report: `git diff --stat` shows
**only** `package.json` and `pnpm-lock.yaml` modified — every other change is a
new untracked file inside scope. `components.json` (including `registries`) and
`button.tsx` are unchanged despite the shadcn CLI attempting to overwrite the
latter.

**Contract now fixed for S2 and S3** (`src/lib/date-range.ts`):

- `resolveWindow(sel, now)` — `endMs` **inclusive**; `priorEndMs` **exclusive**
  and `=== startMs`, matching the existing `t >= priorStart && t < currentStart`
  at `analytics.ts:237-240`. `spanDays` counts **both** endpoints (12 Jun –
  29 Jul = 48, not 47).
- All-time → `startMs: -Infinity`, `spanDays: Infinity`,
  `priorStartMs`/`priorEndMs`: `null`. Deliberately not the epoch — "1970 is a
  date, and a date here would be a claim about where the data starts."
- `decodeRange` returns `null`, never a guess, for unknown presets, malformed
  days, inverted ranges, and the wrong dialect.

**Two props added beyond the brief, both additive with safe defaults.** Accepted:

- `customPrefix` (default `""`) — S3 would otherwise hand-roll prefix/unprefix
  inside `report-period-picker.tsx`, duplicating dialect knowledge the codec
  already owns.
- `ariaLabel` (default `"Date range"`) — `report-period-picker.tsx` has the
  accessible name `"Reporting period"` and a test asserting it; without this
  prop S3 would silently lose it.

`allowCustom` defaults to **`false`** — fails closed, so a caller that forgets
it cannot accidentally expose the calendar on `/r/[token]`.

### Three deferrals S1 handed forward — all land in S2

1. **⚠️ The all-time bucketing trap.** `bucketPlan` **throws** on `Infinity`
   (documented at `date-range.ts:276-279`), and all-time reports
   `spanDays: Infinity`. A caller drawing all-time must first measure the span
   the **data** actually covers. This is deliberate: an honest `Infinity` that
   throws loudly, rather than a silent wrong bucket count.
2. **A custom window ending in the future is resolved as given, not clamped.**
   The picker cannot produce one; a hand-edited URL can. Clamping would shorten
   the window while leaving the baseline its full declared length — the exact
   distortion D4 blocks future dates to prevent. The refusal belongs in S2's
   `normalizeRange`, which owns both the token and the fallback. Pinned by a
   test so S2 is not surprised.
3. **Month buckets are a fixed 30 days**, so a label can drift a few days from
   the calendar month it names. Month labels therefore carry their year
   (`"Jul 2026"`), since month bucketing only appears past 120 days where a bare
   `"Jan"` could name two different months.

### Notes carried

- `date-fns@4.4.0` was hoisted to a **direct** dependency by the shadcn CLI. It
  is a declared dependency of `react-day-picker@10`, so it is a transitive need
  rather than a new ask, and nothing in this repo imports it. Left as the CLI
  wrote it; tidying it is optional and belongs to nobody yet.
- A pre-existing build line — `Failed to load the client registry: Dynamic
server usage: Route /upload couldn't be rendered statically because it used
cookies`, originating at `src/services/clients.ts:102` — is unrelated to this
  workstream and the build still exits 0.
- **The dev machine runs Asia/Manila (UTC+8), east of UTC.** This matters for
  testing: a local-midnight-to-UTC-day bug only bites east of UTC, so a test
  written in a US zone can pass while asserting nothing. S1's timezone tests run
  both `Pacific/Kiritimati` (UTC+14) and `America/New_York` for that reason.

## S2 — landed, uncommitted, planner-verified (2026-07-29)

Gate green: exit 0. **1,380 → 1,424 tests (+44), 93 → 96 files.** Nothing
skipped or deleted.

Planner verified: `git diff --stat` shows exactly the seven S2 files plus the
two S1 dependency lines. `grep` confirms no live `RANGE_LABEL` / `RANGE_DAYS` /
`RANGE_BUCKETS` / `DashboardRange` references survive — only retirement comments,
which is the right way to leave them.

**Bucketing changes, pinned rather than deleted:**

- `90d`: 3 buckets → **13** (`ceil(90/7)` weekly). The visible regression D5
  accepted.
- `30d`: still 5 buckets, but for a different reason — 5 × 6 days became
  `ceil(30/7)` × 7. Same count, different bars, so the executer added a label
  assertion (`["16 Jun","23 Jun","30 Jun","7 Jul","14 Jul"]`) plus a guard that
  no label matches `/^Wk /`, so the old scheme cannot creep back.
- `7d`: still 7, now by the daily rule rather than by coincidence.

**All-time span measurement (deferral 1, resolved):** earliest `effectiveMs`
across the current window through `now`, both endpoints counted. Zero rows →
`bucketPlan` never called, existing "No posts yet" state renders — "a zero-height
bar over an invented date range would assert a period was observed and found
silent." One row → ≥1 day → one daily bucket.

**Two type widenings beyond the brief, both accepted:**

- `Kpi.direction` → `"up" | "down" | null`. A direction beside a null delta is a
  glyph with nothing behind it; nulling them together lets the type system
  enforce the pairing.
- `engagement.delta` → `number | null`. It was rendering **`+0pt`**, coercing
  absence to "unchanged" — the same defect D7 exists to prevent, found in a
  second place. Consumed only by `engagement-chart.tsx`.

**`normalizeRange` could not be exported** — Next rejects arbitrary named exports
from a page module (`TS2344 … not assignable to type 'never'`). It stays private
in `page.tsx`; `page.test.tsx` covers every branch through the page by asserting
the `RangeSelection` actually handed to the seam.

**The picker receives `encodeRange(range)`, not the raw param** — otherwise
`?range=garbage` would sit in the trigger while the screen renders the 30-day
default, the control claiming a window nobody is looking at.

### ⚠️ Bundle cost — and what it means for S3

`/` grew **7.46 kB → 28.3 kB**, First Load **326 → 350 kB**: `react-day-picker`

- calendar + popover now ship on the most-hit route.

**This is a live constraint on S3, not a footnote.** `/r/[token]` is
`allowCustom={false}` (D3a) and never renders a calendar — but a _static_ import
of `Calendar` inside `DateRangePicker` ships `react-day-picker` to that public
route anyway, for a control the client can never open. S3 must load the calendar
lazily so the cost follows the capability.

### The `calendar.tsx` anomaly — surfaced, not fixed

S2's executer found `src/components/ui/calendar.tsx` changed (~3.5 min after
their pre-work checksum) without having written to it, and correctly surfaced it
rather than self-healing.

Planner assessment: benign. The file is 180 lines, prettier-clean, and
structurally a stock shadcn new-york calendar — `DayPicker` +
`getDefaultClassNames`, `CalendarDayButton`, `buttonVariants` — and all 91 S1
tests pass against it. The project is open in an IDE; format-on-save is the
obvious cause, and S1's own report noted it had already reconciled prettier
formatting on this file.

**Honest limit:** the file is **untracked**, so there is no git baseline and
byte-equality to the CLI output cannot be proven by anyone. Committing it turns
that into a diffable baseline. Worth a glance before the operator commits.

## S3 — landed, uncommitted, planner-verified (2026-07-29) — WORKSTREAM COMPLETE

Gate green: exit 0. **1,424 → 1,460 tests (+36)**, still 96 files — S3 extended
existing suites rather than adding new ones. Planner re-ran `pnpm test`
independently: **1,460 passed / 96 files**, confirmed not taken on report.

**Bundle — the point of the exercise:**

| Route                  | S2 baseline | S3 static import | S3 shipped (lazy) |
| ---------------------- | ----------- | ---------------- | ----------------- |
| `/clients/[id]/report` | 274 kB      | 289 kB           | **269 kB**        |
| `/clients/[id]/posts`  | 166 kB      | 180 kB           | **160 kB**        |
| `/r/[token]`           | 271 kB      | 286 kB           | **266 kB**        |

The public route lands 20 kB below the static-import version and **5 kB below
its own pre-S3 baseline** — it gains a better picker and gets smaller. Verified
from the build manifest, not inferred from totals: `react-day-picker` lives in
two chunks and neither appears in the initial payload of `/r/[token]`,
`/clients/[id]/report`, `/clients/[id]/posts`, or `/`.

**The inclusive/exclusive trap, handled.** `periodRange`'s custom branch converts
`utcDayBounds`' inclusive `23:59:59.999Z` to the half-open `< end` bound every
consumer expects, with a ⚠️ comment stating the failure mode it prevents: "the
posts are read, the count comes back a day short, and nothing errors."
Planner-verified in source.

**The `allowCustom` boundary, verified at every site:** `posts/page.tsx:66` and
`report/page.tsx:99` pass it; `public-report.tsx:174` passes `false` explicitly
under a ⚠️; the prop defaults `false` at `report-period-picker.tsx:34`; two tests
pin the absence of any calendar or custom affordance in the DOM.

### Three scope notes, all disclosed by the executer rather than hidden

1. **`vitest.config.ts` — `testTimeout: 15_000`. Outside the stated scope.**
   Cause: a dynamic `import()` moves react-day-picker's ~6s Vite transform out
   of module collection (no per-test budget) and into whichever test first
   mounts the picker (5s budget). Same work, different clock, paid once per test
   FILE. The in-file comment says explicitly that it is headroom for a one-off
   module transform and **not licence for slow tests**.
   **Planner assessment: accept, with a known trade-off** — a genuinely hung
   test now takes 3× longer to fail. A narrower alternative exists (a per-file
   timeout on the picker suite only) if that ever bites.
2. **`date-range-picker.tsx` carries a second change beyond the sanctioned lazy
   import** — a prefetch-on-mount effect. Flagged twice by the executer.
   Verified gated: `if (allowCustom) void import(...)` (lines 126-128), so it
   never runs on the public route. It is also the right product behaviour — a
   staff popover opens instantly instead of showing an empty panel on a cold
   cache. **Accepted.** No public prop changed; all 25 S1 picker tests pass
   unmodified, including in isolation.
3. **`report-cover.tsx` (+13)** was modified — a print surface not named on the
   literal scope list, but the same category as the `print-report.tsx` entry
   that was. Noted, not a concern.

### A diagnosis the executer walked back, correctly

They first blamed the 6s transform on `next/dynamic` and switched to
`React.lazy`. On re-testing, all seven calendar-dependent S1 tests failed **in
isolation**: `React.lazy` suspends to its fallback and mounts a tick after the
click, so a synchronous `querySelector` right after `await user.click()` sees
nothing. They had only re-run the full file, never isolation, and missed it.
`next/dynamic` settles within the click's own flush and is isolation-clean —
that is what shipped, and the reason is recorded in the file. Worth keeping:
**a raised timeout cannot help a synchronous assertion that runs too early.**

## Status: all three slices landed, green, UNCOMMITTED

Everything sits uncommitted on `feat-add-date-picker` at `d0cb3f0`, awaiting the
operator's review and commit. 1,289 → 1,460 tests across the workstream (+171).

## Open items carried, not resolved

- The 14-day and 120-day bucketing thresholds (D5) are invented constants,
  justified as readability boundaries. Flagged in D5; must be named and
  documented in code.
- _Last 30 days_ chart appearance changes (D5). Accepted, not a regression to
  fix.

## Feedback & revisions

- **v1 (2026-07-29)** — record opened at the start of grilling; repo facts
  established.
- **v1.1 (2026-07-29)** — D1, D2, D3, D3a captured.
- **v1.2 (2026-07-29)** — D4, D5, D6 captured.
- **v1.3 (2026-07-29)** — D7, D8 captured; planner-decided specifics recorded;
  design presented for confirmation before any handoff is authored.
- **v1.4 (2026-07-29)** — **S1 landed green and planner-verified** at 1,380
  tests, uncommitted. Fixed contract, two accepted prop additions, and three
  deferrals recorded — all three land in S2. S2 handoff authored against the
  contract that actually shipped, not the one that was specified.
- **v1.5 (2026-07-29)** — **S2 landed green and planner-verified** at 1,424
  tests, uncommitted. All three S1 deferrals resolved. Two accepted type
  widenings, one of which fixed a second `+0pt` absence-as-zero defect. Bundle
  cost recorded as a binding constraint on S3 (lazy-load the calendar so
  `/r/[token]` does not carry `react-day-picker`). `calendar.tsx` anomaly
  surfaced and assessed benign, with its unprovable-baseline limit stated.
  S3 handoff authored.
- **v1.6 (2026-07-29)** — **S3 landed green and planner-verified** at 1,460
  tests (independently re-run, not taken on report). Lazy calendar leaves
  `/r/[token]` 5 kB SMALLER than before the workstream. `periodRange`'s
  inclusive→half-open `+1` and the `allowCustom` boundary both verified in
  source. Three disclosed scope notes accepted, one with a stated trade-off
  (`vitest.config.ts` timeout). **Workstream complete; all three slices
  uncommitted on `feat-add-date-picker` awaiting review.**
