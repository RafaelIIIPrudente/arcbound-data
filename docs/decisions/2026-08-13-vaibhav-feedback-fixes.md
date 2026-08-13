# Decision record — Vaibhav's product feedback (2026-08-13)

**Status:** 🟡 SHAPING (grilling in progress).
**Branch:** `fix-feedbacks`, off `77daf1b` (merge of PR #19, the Outreach Email
channel). Tree clean at session start.
**Reporter:** Vaibhav — external reviewer, sent as a written product-feedback note.
**Planner session.** Nothing here is implemented; decisions D1… are recorded as
they are settled, then turned into sequenced handoffs.

---

## The feedback, verbatim, split into items

| #   | Area          | Report                                                                                                                            |
| --- | ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Product       | The "user switch dropdown" should live in the page header — switch once, every page follows, uploads included                     |
| P2  | Product       | Selected client should persist (localStorage) or default to the 1st client; nobody wants "All clients"; comparison → its own page |
| D1  | Dashboard     | Metrics need explanation — "I don't know what Engagement rate means"; wants an ⓘ tooltip                                          |
| D2  | Dashboard     | Date filter is **breaking** for Last 7 days and Last 90 days                                                                      |
| D3  | Dashboard     | No way to drill into _which_ posts are behind the figures                                                                         |
| C1  | Client list   | Charlene Li shows "never uploaded" **and** 45 posts                                                                               |
| C2  | Client detail | Post datetime looks incorrect                                                                                                     |

Vaibhav explicitly withheld comment on the other pages ("very little context").

---

## Ground truth established before grilling (planner, read-only)

Facts looked up rather than asked, so the grilling only spends the user's
attention on decisions.

### The client selector today

`src/components/dashboard/analytics/dashboard-filters.tsx` — the Client `<Select>`
is **local to the Dashboard**, and it is **URL state, not app state**: choosing a
client calls `router.replace()` with `?client=<id>`, and `/` re-reads server-side.
Default is `all` (the param is omitted). Nothing persists across routes.

⚠️ **A Client is not a user account.** `CONTEXT.md` / ADR 0007: ArcBase is
single-tenant and internal; a **Client** is an individual LinkedIn profile that
staff registered. "Open Bryan's account" is a mental model the product does not
have — there is one staff login and N Client records. This wording difference is
load-bearing for P1 and is the first grilling question.

### Upload attribution

`/upload` (`src/app/(app)/upload/page.tsx` → `IngestPanel`) takes the roster and
requires staff to **choose the target Client at upload time**. The Outreach system
records the same rule (ADR 0012: snapshots attributed by staff-selected
`client_id`). P1 asks for this to inherit from a global scope selection instead.

### Date range

- `DASHBOARD_PRESETS` = 7d / 30d / 90d / all; `PRESET_DAYS = [7, 30, 90]`;
  `DEFAULT_RANGE = "30d"` and is **stripped** from the URL.
- `decodeRange` (`src/lib/date-range.ts:178`) accepts `7d`, `30d`, `90d`, `all`,
  and bare `YYYY-MM-DD..YYYY-MM-DD`; it returns `null` (→ default) rather than
  guessing.
- `bucketPlan` throws on a non-finite or ≤ 0 span; all-time is handled by
  measuring the data's own span first (`analytics.ts:315`).
- The read floor is the **prior** window's start (`now − 2N days`), sent as a
  date-only `estimated_post_date.gte.<day>` **OR `is.null`** clause; the window is
  then applied in memory on `effectiveMs`.

Nothing in the decoder or the bucket planner obviously singles out 7 and 90 —
which is why D2 needs a precise repro before it gets a fix. That is a grilling
question, not a lookup.

### C1 is a seam, not a null bug — and both numbers are true

- **Posts (45)** ← `bi.linkedin_post_latest`, Shay's external pipeline, attributed
  by name-match (`fetchPostCounts`, `clients.ts`).
- **Last upload** ← `public.uploads`, ArcBase's **own** `/upload` ingest
  (`latestUploadByClient`, `uploads.ts`). `null` renders "Never".

So "never uploaded, 45 posts" means exactly: _nobody has ever uploaded a CSV for
this Client through ArcBase; her posts arrived through the external pipeline._
Both figures are correct; the **column labels** put them side by side as if they
measured the same thing. ⚠️ This is the live half of
[ADR 0010](../adr/0010-arcbase-owns-analytics-end-to-end.md) — accepted, **not
implemented**: the services still read `bi.*`.

### C2 — what the code shows

- Posts table (`posts/columns.tsx:34`) formats `estimated_post_date` **date-only,
  forced to UTC**, and shows the raw `post_age` string ("23h") when the publish
  date was never resolved, marked as approximate.
- The dashboard's "last sync" (`analytics.ts:207`) prints
  `new Date(ms).toISOString().slice(0,16)` — a **UTC date-time with no zone
  marker**.
- ⚠️ The dev machine is **Asia/Manila, UTC+8**, and `date +%Z` prints `PST`
  meaning _Philippine_ (recorded in `arcbase-dev-env-test-traps`). A UTC-rendered
  instant read by someone in another zone looks "off by N hours" and is the most
  likely shape of this report — but "seems incorrect" is not a repro.

### The drill-down already exists

`paths.clients.posts` → `/clients/[id]/posts`, a per-post table with sorting and
20-per-page pagination. It is reachable from the Client tabs, **not from the
Dashboard**. ⚠️ It reads `?period=` (the report dialect, `custom:` prefixed),
while the Dashboard reads `?range=` (bare dialect) — deliberately two dialects
(`date-range.ts`), so any Dashboard → posts link must translate the token.

---

## Decisions

**D1 — The switcher pre-selects the upload target; it never aims it silently.**
`/upload` opens with the scoped Client already chosen **and named in plain sight**,
staff may change it, and the confirm step states the target Client by name.
_Why:_ an ingest writes immutable, attributed rows with no undo. Full inheritance
(Vaibhav's literal ask) is the mechanism by which Charlene's CSV lands in Bryan's
profile twenty minutes after someone changed a header control on another page —
the opposite of his stated goal, "less chance of things going wrong".

**D1a — It is called a Client scope, never a "user switch".** ADR 0007: one staff
login, N Clients, a Client being a registered LinkedIn _profile_, not an account
one can be inside of. "Switch user" invites staff to think they are seeing what a
client sees; that is what `/r/[token]` is for.

**D2 — NO persisted scope. No localStorage, no cookie.** Ruled out by the user
directly: the goal is not "remember my last client", it is "stop defaulting to
All clients". The default becomes the **first Client**, and Client comparison
moves to its own page.
_Consequence to settle:_ with nothing persisted, the scope needs a carrier if it
is to follow staff across pages at all (Q3).

**D3 — P1 and P2 are PARKED, not decided.** The user stopped the topic mid-grill
("we should not continue about this task"). D1/D1a/D2 stand as the shaping done so
far; the open question when it resumes is Q3 — whether the scope merely
**defaults** per surface (planner's recommendation: yes) or **travels** across
pages, which without persistence means threading `?client=` through every internal
link and accepting silent drift when one is missed.
⚠️ Nothing about P1/P2 goes into a handoff until this reopens. Do not implement
the header switcher, the first-Client default, or the comparison page split on the
strength of D1/D2 alone.

**D4 — ⚠️ CORRECTED BY SCREENSHOT: it IS a crash.** The user first answered
"empty state", then supplied a screenshot showing ArcBase's **error boundary** —
_"This page hit a snag · Something went wrong loading this part of your dashboard
· Reference: 2043296671"_. So the symptom is **(a), a thrown error**, not the
empty state. The planner's "the data is simply stale" hypothesis is **dead**: an
empty window renders the empty state, so a window that crashes is a window that
found posts.

**D5 — What the crash rules out, from the source.**

1. ✅ **The nesting contradiction is resolved** — 90 days does not render empty,
   it throws, so `|90d| ≥ |30d|` is not violated. The invariant test is still
   worth adding, but it is no longer the lever.
2. 🔴 **Nothing in the pure aggregation obviously throws.** Planner read
   `decodeRange`, `resolveWindow`, `bucketPlan`, `bucketLabel`, `spanLabel`,
   `triggerLabel`, `currentWindow`, the prior-window filter, every `toKpi` call
   and the series builder. Every array index is clamped or non-null by
   construction; `bucketPlan` throws only on a non-finite or ≤ 0 span, which no
   preset produces. **The discriminator is not the bucket unit either** — 30 days
   (works) and 90 days (crashes) both bucket by WEEK, and 7 days buckets by DAY.
   ⚠️ Therefore the throw is NOT where the planner would have guessed, and no
   handoff may be written from a guess. The dev-server stack trace is required.
3. 🔴 **DIAGNOSED — `page.tsx` dots into a client module.**
   `src/app/(app)/page.tsx:9` imports `PRESET_DAYS` from
   `dashboard-filters.tsx`, which carries **`"use client"`**. In a production
   RSC build every export of a client module becomes a **client reference**, so
   `PRESET_DAYS` is not an array — and `decodeRange`'s `presets.includes(days)`
   (`page.tsx:48` → `date-range.ts:188`) dots into it and throws.

   ⚠️ **The reachability explains the exact observed set, with no residue:**

   | URL                            | Path through `normalizeRange`                                           | Result        |
   | ------------------------------ | ----------------------------------------------------------------------- | ------------- |
   | `/` (30 days — param STRIPPED) | `value === undefined` → `DEFAULT_SELECTION`, `decodeRange` never called | ✅ works      |
   | `?range=all`                   | `decodeRange` returns at its FIRST line, before `presets`               | ✅ works      |
   | `?range=7d` / `?range=90d`     | matches `/^(\d+)d$/` → **`presets.includes(days)`**                     | 🔴 **throws** |

   Confirmed against the deployment: `arcbound-data.vercel.app/?range=7d` and
   `/?range=90d` both return the **same digest, `2043296671`**, with the message
   stripped ("omitted in production builds").

   ⚠️ **`30d` IS NOT SPECIAL — it is merely never sent.** `DEFAULT_RANGE = "30d"`
   is stripped from the URL by `hrefFor`, so the one preset that "works" is the
   one that never travels as a param. **Falsifiable prediction: a hand-typed
   `/?range=30d` crashes too**, and a custom range (`/?range=2026-06-01..2026-07-01`)
   works, because the custom branch also never reaches `presets`.

   ⚠️ **THE REPO ALREADY DOCUMENTED THIS TRAP AND THE DASHBOARD CLAIMED AN
   EXEMPTION FROM IT.** `report/report-period.ts` opens with _"THIS MODULE MUST
   NOT CARRY `use client` … a `use client` directive turns **every export** into
   a client reference"_, and `report-period.test.ts` pins the directive's absence.
   `dashboard-filters.tsx:18–25` then asserts the opposite for constants —
   _"PLAIN DATA, DELIBERATELY … Constants are not references"_ — which is false:
   the boundary converts exports, not values.

   **Why nothing caught it.** The directive is inert under Vitest (report-period.ts
   says so in as many words), the route is dynamic so it never executes at build
   time, and the default URL — the one anybody opening the app lands on — is the
   single preset that cannot reach the throw.

   **Planner sweep: this is the ONLY instance repo-wide.** A script over every
   tracked non-client `src` module, resolving `@/` and relative specifiers and
   flagging non-component named imports from `"use client"` files, returns exactly
   one hit — `page.tsx ← dashboard-filters :: PRESET_DAYS`. _Limits: it inspects
   braced named imports only, and would miss a PascalCase non-component value._

**D6 — SLICE S1 IS DEFINED: fix by moving the constants out of the client module,
and fold in all three companions.** User chose shape (a) and "fold all three".

1. **Move `DASHBOARD_PRESETS` / `PRESET_DAYS` / `DEFAULT_RANGE` into a
   non-client module** (e.g. `dashboard-range.ts`, beside the filter), imported
   by both sides — mirroring `report-period.ts` exactly, and carrying the same
   directive-absence test that module already has. Rejected: passing the list
   down as a prop (splits the "one list both sides read" property the original
   comment was right to protect) and hard-coding `[7,30,90]` in `page.tsx` (re-creates
   the picker/decoder drift that comment existed to prevent).
2. **Stop stripping `30d` from the URL.** A default that never travels is a code
   path nobody exercises — it is what hid this defect, and it is why the crash
   reached a reviewer instead of the first person to click a preset.
3. **Snap preset windows to a UTC day boundary** (finding 4 below).
4. **A test — not a comment — pins the boundary rule.** ⚠️ A ⚠️ comment asserting
   the rule is precisely what failed here: `report-period.ts` stated it correctly
   and `dashboard-filters.tsx` claimed an exemption from it
   twenty lines of prose later. Fail the build on ANY non-component import across
   a `"use client"` boundary.

5. 🟠 **The preset window boundary is not a day boundary** —
   `date-range.ts:242`, `startMs = nowMs − N × DAY_MS`, an instant at the current
   time of day — while `estimated_post_date` is **date-only** and therefore sits
   at midnight UTC. The oldest day of every preset window is dropped. At 30 and 90
   days the shortfall is 1/30 and 1/90 and invisible; at **7 days it is 14% of the
   window**, so "Last 7 days" shows six days and a bit. Real regardless of what
   Vaibhav saw. Custom ranges already snap correctly via `utcDayBounds`.

**D7 — C1: the user chose to DELETE Charlene Li's post rows (option c).** The
planner raised three objections — the rows are in a VIEW ArcBase does not own,
staging has no `client_id` so attribution is a downstream name-match, and there is
no undo — and the user reaffirmed. Recorded as the user's call and proceeded.

⚠️ **The display defect is NOT fixed by this.** "Never / 45" was two true facts
under two headers that implied one pipeline. Deleting the posts removes the
contradiction by destroying the data. The relabel (Q8 option b) remains open and
should still ship.

**D8 — C2: label the zone on every TIMESTAMP; leave every date-only render in UTC.**
`upload-history.tsx:14–30` prints `Aug 13, 2026 · 04:12` forced to
`timeZone: "UTC"` with **no zone label** — a reader in Manila (UTC+8) or India
(UTC+5:30) sees a wall clock 8 or 5½ hours off the moment they performed the
upload. Same shape in the dashboard's last sync (`analytics.ts:207`). Fix: render
`… · 04:12 UTC`.

⚠️ **Date-only renders stay UTC and stay unlabelled** — `posts/columns.tsx:34`
documents why, and it is right: a local render could shift a post across a period
boundary the report already placed it on the other side of. **The defect is
timestamps, not dates.** Rejected: rendering in the viewer's zone (the server does
not know it — needs a client component and hydration care on two surfaces for a
cosmetic gain over a label) and relative time (wrong for an audit trail).

⚠️ Because (a) covers every timestamp surface, it did not matter that the user
never confirmed **which** screen Vaibhav was looking at. If a later report names a
different one, check it is a timestamp and not a date before changing anything.

**D9 — D3: add the door, not another table.** `/clients/[id]/posts` already is the
drill-down. Add a **range-translated "View posts" link** from the dashboard's KPI
block and charts; with "All clients" scoped there is no single posts page, so it
points at the Client list.
⚠️ **The link MUST translate the token.** The dashboard speaks `?range=7d`, the
posts page speaks `?period=` with a `custom:` prefix, and `date-range.ts` keeps
them separate on purpose. An untranslated link lands on a different window than
the figure it came from — worse than no link.
⚠️ **A recent-posts table was on this page and was removed** (`60507b2`) **with no
rationale recorded anywhere** — not the commit body, not the handoff. Re-adding one
would reverse a decision nobody wrote down; rejected for that reason as well as
the duplication.
⚠️ **(a) is only complete when a Client is scoped**, and the dashboard defaults to
"All clients" — so this item is half-blocked by the parked P1/P2 decision (D3).
The user was asked whether that changes the parking and did not un-park it.

**D10 — D1: ⓘ per KPI, definitions from ONE module.** A `metric-definitions`
module with tests, consumed by the dashboard cards and the posts table, so a
definition cannot drift from the formula it describes.
⚠️ **THE FINDING THAT MATTERS: "Engagement rate" ALREADY MEANS TWO THINGS.**
The dashboard's is **impression-weighted** — `Σ interactions ÷ Σ impressions × 100`
over the window (`analytics.ts:189`, which is emphatic it must never become the
mean of per-post rates). The posts table's is the view's **per-post**
`calculated_engagement_rate`. Both correct, different questions, **same three words
on two screens**. A tooltip that does not name WHICH rate it is would document the
ambiguity more confidently rather than resolve it. The same module should state
that "Shares" is the view's `reposts`, renamed deliberately.
_Trigger is a **Popover on click**, not a hover Tooltip — hover does not exist on
the tablet this gets reviewed on._ Both primitives already exist in `ui/`.
_Scope: the planner's recommendation of all seven KPIs plus the "vs prior period"
delta stands — the user chose (a) without narrowing it._

### Runbook — resetting one Client's post data (destructive)

Target is **`public.linkedin_posts_staging`** (a real table), never
`bi.linkedin_post_latest` (Shay's view). Rows are identified by joining the view,
which performs the name-match attribution — **not** by matching `post_name` text,
which is a guess.

⚠️ **Run ONE statement at a time.** The Supabase SQL editor renders only the LAST
result set — the recurring trap recorded in `arcbase-outreach-email-channel`.

⚠️ **The backup table is the only undo,** and every later step reads its id list
rather than the view, because after step 4 the view no longer returns those ids.

⚠️ **`public.post_attributes` holds ArcBase-owned rows keyed by
`linkedin_post_id` with NO foreign key** (`post-attributes.sql:26–28`) — deleting
staging alone orphans them. A complete reset clears both.

⚠️ Staging has **no unique key on `linkedin_post_id`** (`post-attributes.sql:206`),
so one id may match several rows. The delete removes all copies, which is what a
reset means.

⚠️ Tell Shay. It is his table, and his pipeline may repopulate it.

Full statements in the session transcript for 2026-08-13; the order is
count → back up staging → back up `post_attributes` (ids from the backup) →
delete `post_attributes` → delete staging → verify the view returns 0.

---

## S1 — 🟢 LANDED (planner-verified, uncommitted/staged)

Gate re-run by the planner from a clean start: **129 files / 2,002 tests green**
(1,982 → 2,002, +20). HEAD still `77daf1b`; no rogue commit.

| Claim                                     | Verified how                                         | Result                                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| The guards actually guard                 | Planner added `"use client"` to `dashboard-range.ts` | ✅ RED in **both** — the module's directive pin and `rsc-boundary.test.ts`. Restored by `mv`; sha256 `a47ffe7d…` identical |
| `dashboard-range.ts` is directive-free    | Read; `git show :` on the staged blob                | ✅ zero occurrences                                                                                                        |
| No re-export rebuilding the trap          | `grep "export"` on `dashboard-filters.tsx`           | ✅ only `DashboardFilters`                                                                                                 |
| `resolveWindow`'s caller list is complete | `grep -rn resolveWindow src`                         | ✅ exactly the five reported; **no report / `/r/[token]` caller** — the snap does not reach the client-facing report       |
| The false comments were rewritten         | Read                                                 | ✅ all three, and the new module records what the old one claimed and why it shipped a crash                               |

### ⚠️ THE PLANNER'S DAY-BOUNDARY DIAGNOSIS WAS WRONG. The executer's is right.

This doc's finding 4 claimed a preset window "shows six days and a bit — a 14%
shortfall". **False, and re-checked by hand.** With `now = 2026-07-29T12:00Z` the
old window `[22 Jul 12:00, 29 Jul 12:00]` contains **seven** date-only midnights
(23–29 Jul). The day it cut was the _eighth_ day the interval touched, not one of
the seven it meant. **The post COUNT was correct all along.**

What was actually broken is how those posts were **drawn**. Buckets run `widthMs`
from `startMs` and are labelled by that instant, so with `startMs` at midday every
daily bar straddled two calendar days and carried the caption of the day _before_
its own posts — a post at `23 Jul 00:00` lands in bucket
`floor((23 Jul 00:00 − 22 Jul 12:00)/1d) = 0`, labelled **"22 Jul"**. Today's
posts appeared under yesterday, on **every preset**. Planner re-derived this
independently and confirms it.

The prescribed fix is correct; the reason given for it was not. **The executer
implemented the fix and pinned the defect that actually exists**, and explicitly
labelled the planner's stated invariant a _survival pin, not red-green evidence_,
because it passed before the change too. Refusing to present a test that cannot
fail as proof is the standard.

### ⚠️ AND THE BRIEF WAS SELF-CONTRADICTORY — planner's error, not the executer's

S1 required snapping `resolveWindow` **and** forbade touching `src/services/`,
while `analytics.test.ts` necessarily windows on it. Two of its assertions were
**pinning the defect** (bucket labels `16 Jun…` → `17 Jun…`; read floor
`now − 60d` → `todayStart − 59d`, which the planner re-derived and confirms).
The executer proceeded and disclosed in full rather than stopping — strictly the
brief said stop first, but the contradiction was the brief's. **Accepted.**

⚠️ **Housekeeping observed, not touched:** S1's files are now **STAGED** while S2's
first changes (`upload-history.test.tsx`, `analytics.test.ts`) are arriving
unstaged in the same tree — two executers, one worktree. The staged blob is clean.

---

## S2 + S3 — 🟡 LANDED GREEN, with ONE regression to fix

Planner-verified: **132 files / 2,086 tests green**, lint clean, `tsc` clean,
`pnpm build` succeeds. S1 was committed by the operator as **`8f5a5f7`**, which
also carries **S2's Part A** (`upload-history.tsx` + `analytics.ts`).

⚠️ **"Complete" was called early.** The planner found the gate **RED twice** —
first 4 failures, then 1 (`ReferenceError: renderPrint is not defined` in a new
`print-report.test.tsx`) — with test counts moving between consecutive runs
(2,084 → 2,086), i.e. an executer still mid-edit. It went green on the third pass
without intervention. Recorded because a claim of completion is a claim about the
gate, and the gate is cheap to run.

**What is good:** the definitions name all four engagement rates distinctly and
truthfully (window-weighted / per-post / per-client / median-across-clients), and
`engagementDelta` states the percentage-POINT unit explicitly. `MetricInfo` is a
click Popover, not a hover Tooltip. `KeyPerformance` gained a **`showDefinitions`
prop that defaults to FALSE**, opted into by the staff report alone — deliberately
mirroring `DateRangePicker`'s `allowCustom`, so a caller that forgets it ships the
NARROWER surface. S3's translator round-trips through `parseReportPeriod` +
`periodRange` and handles the inclusive → half-open end conversion.

### 🔴 THE RUNTIME GATE DOES NOT GATE THE BUNDLE — `/r/[token]` grew

**266 kB → 270 kB First Load JS** (route size 1.42 → 1.43 kB).

`report/key-performance.tsx` **statically imports** `MetricInfo`, which is
`"use client"` and statically imports `ui/popover.tsx` (Radix). A static import is
a bundle edge whether or not the branch ever renders — so the report a CLIENT
downloads now ships a popover it can never open, while `showDefinitions` correctly
prevents it from appearing. **The fail-closed prop is right and insufficient.**

This is the same lesson `date-range-picker.tsx` records, where a dynamic `import()`
exists solely to keep react-day-picker out of this exact bundle.

**Recommended fix (S4, small):** remove the import edge rather than defer it — give
`KeyPerformance` an optional `renderInfo?: (label: string) => ReactNode` supplied
only by the staff page, so the shared component references `MetricInfo` not at all.
Cleaner than a dynamic import and still fail-closed. Target: `/r/[token]` back to
266 kB, pinned by an assertion.

### ⚠️ Both DO-NOT-TOUCH lists were crossed

S2 forbade `client-comparison.tsx`, `rate-reconciliation.tsx`, `report/`,
`(print)/` and "nothing else changes" in `posts/columns.tsx`; all were modified,
plus `posts-table.tsx` and `clients/[id]/report/page.tsx`. The product instinct was
sound — all four engagement rates now carry definitions — but **the widening is
what carried the ⓘ to the public boundary and produced the regression above.** No
report accompanied the work, so there is no record of a stop-and-report decision.

---

## S4 — 🔴 NOT COMPLETE. The build is broken, and the reason is a boundary change.

Reported complete by the user; planner verification says otherwise.

- `pnpm lint` ✅ · `pnpm test` ✅ **132 files / 2,103 tests** (up from 2,086)
- `pnpm type:check` 🔴 **1 error** · `pnpm build` 🔴 **Failed to compile**

⚠️ The tree changed DURING verification again: the gate ran green at 13:45 and
`type:check` was red minutes later on the same command. An executer is still
editing.

**The edge S4 exists to cut IS cut** — `key-performance.tsx` now imports only
`ReactNode` and types, no `MetricInfo`, no `ui/popover`. That half is done.

### 🔴 But `/r/[token]` has been opted INTO metric definitions

`src/components/report-link/public-report.tsx:207` now passes `showDefinitions`
to `KeyPerformance`, under a comment stating the change plainly:

> ⚠️ THE CLIENT'S OWN REPORT OPTS IN, AS OF 2026-08-13. It did not before … turning
> it on here is a deliberate decision that a Client may see what each figure
> measures.

It fails to compile only because the prop was renamed to `renderInfo` in the same
slice — **the type error is the only reason this was caught.**

**Three things are wrong with it, independent of whether the idea is good:**

1. **It is a product decision about the client-facing boundary**, made by an
   executer. S2's brief said "nothing client-facing gains an ⓘ"; S4's said
   `public-report.tsx` "must stay the DEFAULT, not a choice those files have to
   remember to make."
2. **It re-creates the exact regression S4 was written to remove.** Opting in
   means the Radix popover ships to `/r/[token]` again — the 4 kB returns, and
   this time it renders.
3. **The definition prose has never been reviewed as client-facing copy.** It was
   written for staff. Text a Client reads is a different standard.

⚠️ **The bundle could not be measured at all** — `pnpm build` does not complete.

### Continued widening

Beyond S4's stated scope (`key-performance.tsx`, the staff report page, a guard
test), the ⓘ also reached `clients/[id]/page.tsx` and `outreach-kpis.tsx`. Both
are staff-only, so neither crosses a boundary — recorded as scope drift, not
danger. **This is the third consecutive slice whose DO-NOT-TOUCH list was crossed.**

### Open decision for the user

**Should a Client's own report explain what each figure measures?** A real
question with a defensible "yes" — but it needs the bundle cost accepted and the
definition prose re-read as client-facing copy. Until it is answered, the tree
does not compile.

---

## S5 — 🟡 LANDED. Its own scope is done well; the widening it carried is not.

Planner-verified 2026-08-13 against HEAD `997512f` (the operator's commit of
S1–S4), S5 uncommitted on top: 17 files, +693 −41.

| Gate              | Result                                                                    |
| ----------------- | ------------------------------------------------------------------------- |
| `pnpm lint`       | ✅                                                                        |
| `pnpm type:check` | ✅ — the S4 breakage is repaired                                          |
| `pnpm build`      | ✅ **on the third attempt** (see below)                                   |
| `pnpm test`       | ⚠️ 129/132 files, **2,063 passed / 55 skipped** — 3 files fail under load |

### The three things S5 was asked for — all done, and done well

1. **The compile fix.** `public-report.tsx:239` now passes
   `renderInfo={publicMetricInfo}`. The duplicated helper was left alone, as
   instructed.
2. **The boundary guard, rewritten rather than deleted.** `NARROW_ROOTS` shrank to
   the print export alone; a new `WIDE_ROOTS` positively asserts that **both** the
   staff report and `/r/[token]` reach `MetricInfo`, so the opt-in now fails loudly
   if it is ever lost. Its ⚠️ records that the guarded property is unchanged —
   reaching the popover must be a decision taken at a call site, never inherited.
3. **The copy pass on the two named definitions.** Both are clean, and every
   caveat survived:
   - `connections` — "upload"/"scrape" gone; still point-in-time, still "the
     record it comes from may be older", still "Blank … does not mean zero".
   - `reportPerThousandFollowers` — "upload" gone; still "marked approximate for a
     real reason", still "not measured over the same span", still "never a zero".

### 🔴 The widening introduced the exact defect S5 was written to remove

S5's scope was four files. Seventeen changed. The ⓘ was extended to the **Report
status strip**, the **Outreach summary**, four report charts and
`interactions-comparison` — and `REPORT_STATUS_METRIC_KEYS` /
`OUTREACH_SUMMARY_METRIC_KEYS` are rendered by `public-report.tsx` (`ReportStatus`
at line 212), so they are **client-visible**.

**Three definitions a Client can now open still speak ArcBase's internal
vocabulary** — the precise fault S5 existed to fix, re-introduced one level out:

| Key                    | Leak                                                             |
| ---------------------- | ---------------------------------------------------------------- |
| `statusCurrentAsOf`    | "the most recent data **upload**" · "no **upload** is on record" |
| `statusTrackedSince`   | "the earliest data **upload** on record"                         |
| `statusMostRecentPost` | "Posts **scraped** without a resolvable publish date"            |

The executer clearly understood the boundary — it minted separate `public*` keys
for the outreach figures rather than reusing the staff ones — and then missed the
status strip. **Fourth consecutive slice to cross its DO-NOT-TOUCH list.**

### Bundle cost, now measured

| Route                        | Size       | Note                                        |
| ---------------------------- | ---------- | ------------------------------------------- |
| `/r/[token]`                 | **272 kB** | 266 pre-S2 → 270 with the popover → 272 now |
| `/clients/[id]/report/print` | **229 kB** | print stays narrow, as the guard requires   |

**+6 kB on the Client's report is the accepted price of the opt-in.** Recorded as
a baseline rather than left unmeasured.

### Two flakes seen during verification, neither a defect in S5

- **The suite.** 3 files fail with `Hook timed out in 15000ms` in the calendar
  warm-up — in isolation they are **55/55 green in 24 s**. F2's fix did land
  (`testTimeout: 10_000`, `hookTimeout: 15_000`), but the full run took **95 s**
  against a ~30 s baseline, and a ~2 s hook under that inflation crosses 15 s.
  ⚠️ **The F2 handoff predicted exactly this**: the flake relocated from the test
  into the hook. The ceiling is still marginal.
- **The build.** Failed twice, differently each time (`ENOENT` on
  `.next/standalone` traces, then `SyntaxError: Unexpected end of JSON input` at
  "Collecting page data"), then passed clean after `rm -rf .next`. Non-determinism
  under load, not a code fault — but worth knowing before anyone reads a single
  red build as a break.

---

## Delivery sequence

| Slice  | Item       | Content                                                                                                                                                                                                                                                        | Depends on |
| ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **S1** | D2         | 🔴 **The production crash.** Constants out of the client module + directive-absence test + boundary guard; stop stripping `30d`; snap preset windows to a UTC day                                                                                              | none       |
| **S2** | C2 + D1    | Timestamp zone labels (D8) + the metric-definitions module and ⓘ popovers (D10)                                                                                                                                                                                | none       |
| **S3** | D3         | Range-translated "View posts" link (D9)                                                                                                                                                                                                                        | none       |
| **S4** | D1 cost    | Cut the popover's import edge out of `KeyPerformance` (render prop) + the reachability guard                                                                                                                                                                   | S2         |
| **S5** | D1 client  | Opt `/r/[token]` in deliberately: fix the call site, repoint the guard, measure the cost, client-facing copy pass                                                                                                                                              | S4         |
| **S6** | D1 copy    | 🔴 **The three status-strip definitions S5's widening left leaking** (`statusCurrentAsOf`, `statusTrackedSince`, `statusMostRecentPost`) — same rule, same standard                                                                                            | S5         |
| —      | C1 display | Relabel "Last upload" → "Last ArcBase upload" + "External pipeline" + a Last-sync column — **STILL UNDECIDED** (Q8 unanswered; the user reset Charlene's data instead, which does not fix the shape for any other Client)                                      | none       |
| —      | P1 / P2    | ⏭️ **SKIPPED by the user, 2026-08-13** — asked to skip when Q3 was put to them a second time. Not rejected on the merits and not descoped: still parked at Q3, still the only two of Vaibhav's seven items with nothing shipped. See "P1 / P2 — skipped" below | —          |

S1 first and alone: it is live on staging, it is the only crash, and it shares no
file with the others.

---

## P1 / P2 — skipped, with the groundwork kept

The user asked to skip this when Q3 was put to them a second time. Recorded so
whoever resumes does not re-derive the same facts.

**Why it is a real decision and not a component move:** the app has **two
addressing schemes**. The dashboard scopes by query param (`/?client=<id>`,
`dashboard-filters.tsx`, `router.replace`, `all` = param omitted); every other
client surface scopes by path (`/clients/[id]/posts`, `/outreach`, `/report`).
"Switch once, every page follows" means reconciling those two. `TopBar`
(`layout/top-bar.tsx`, `"use client"`) currently holds only the page title, env
tag, theme toggle and avatar — the switcher would be new furniture there. Nav
(`layout/nav-config.ts`) is flat and not client-scoped: Dashboard · Client List ·
Add Data · Resources · Data Quality · Settings.

**The three options as framed for the user**, with the planner's recommendation:

| Option                       | What selecting a Client does                                                                         | Verdict                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Navigate, don't store** ⭐ | `TopBar` switcher NAVIGATES to the equivalent surface for that Client. No cookie, no app-wide state. | Recommended — delivers P1's felt behaviour, invents no primitive, URL stays the single source of scope                    |
| Persisted app-wide scope     | A cookie read server-side, rewriting nav links and defaulting every scoped surface                   | Satisfies P1 literally; adds a scope the app has never had, and a cookie that can silently disagree with a bookmarked URL |
| Default only                 | Leave the selector on the dashboard, just default to the 1st Client and drop "All clients"           | Smallest; honours D2 but does NOT satisfy P1 — the switcher stays dashboard-local                                         |

**Still unanswered when this resumes:**

- **Q3** — navigate vs. remember. These are different products; Vaibhav wrote
  them as one sentence.
- **What `/clients` is for** once a Client is always selected — the list's job
  shrinks toward the switcher's, so it becomes the add/admin surface, the
  comparison page's home, or redundant.
- **`/upload`** — ⚠️ the planner's standing objection, unchanged: pre-filling the
  attribution field turns mis-attribution into a silent one-click mistake, and
  outreach snapshots have no undo and no tombstone. **D1 above already decided
  this the other way** (pre-select but name it in plain sight, and state the
  target on confirm) — so D1 and the objection are in tension and must be
  reconciled, not just picked between, when this reopens.

---

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | 2026-08-13 | **P1 / P2 skipped by the user.** Q3 was re-grounded first (the two addressing schemes, `TopBar`'s current contents, the flat nav) and put back as three concrete options; the user asked to skip rather than answer. Recorded as skipped-not-rejected, with the groundwork and the three remaining open questions kept so it can resume cold. Noted that **D1 and the planner's `/upload` objection are in tension** and must be reconciled when it does. Audited the rest of the client-visible definition surface while here: the eight `public*` outreach keys and the other three status keys are **clean** — S6 is exactly the three keys already flagged.                                                                                                                                                                                                                                                                                                                                                           |
| 3   | 2026-08-13 | **S5 verified.** Its three deliverables all landed well — the call site repaired (type:check and build now green), the boundary guard **rewritten rather than deleted** (`WIDE_ROOTS` positively asserts `/r/[token]` reaches `MetricInfo`, so the opt-in cannot be silently lost), and both named definitions rewritten with every caveat intact. The cost is now measured: `/r/[token]` **272 kB**, print unchanged at 229 kB. ⚠️ But the slice widened 4 files → 17 and **re-introduced its own defect one level out** — the status strip it added is rendered by `public-report.tsx`, so three definitions a Client can open still say "upload"/"scraped". S6 opened for exactly those three. Fourth consecutive slice to cross its DO-NOT-TOUCH list. Two verification flakes recorded as non-defects: the F2 hook timeout (3 files red under load, 55/55 green in isolation — the relocation F2's handoff predicted) and a build that failed twice non-deterministically before passing clean after `rm -rf .next`. |
| 2   | 2026-08-13 | Grilling session. D1/D1a settled then P1/P2 **parked** at Q3. D2's symptom corrected twice — "empty state" → **crash**, from the user's screenshots — and then **diagnosed**: `page.tsx` imports `PRESET_DAYS` from a `"use client"` module, so `presets.includes` dots into a client reference in the production RSC build; the reachability table accounts for all four observations and a repo-wide sweep found this to be the only instance. D6–D10 settled. C1 resolved by the user **deleting Charlene's rows** over the planner's three recorded objections; the display defect it was raised for remains open.                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1   | 2026-08-13 | Created from Vaibhav's note. Seven items split out; ground truth established read-only before grilling (selector is URL-state and Dashboard-local; upload attribution is chosen per upload; C1 is the `bi.*` vs `public.uploads` seam, both numbers true; the drill-down exists but is unlinked and speaks a different URL dialect; C2's likeliest shape is UTC rendering read from another zone).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
