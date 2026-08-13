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

## Delivery sequence

| Slice  | Item       | Content                                                                                                                                                                                                                   | Depends on |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **S1** | D2         | 🔴 **The production crash.** Constants out of the client module + directive-absence test + boundary guard; stop stripping `30d`; snap preset windows to a UTC day                                                         | none       |
| **S2** | C2 + D1    | Timestamp zone labels (D8) + the metric-definitions module and ⓘ popovers (D10)                                                                                                                                           | none       |
| **S3** | D3         | Range-translated "View posts" link (D9)                                                                                                                                                                                   | none       |
| —      | C1 display | Relabel "Last upload" → "Last ArcBase upload" + "External pipeline" + a Last-sync column — **STILL UNDECIDED** (Q8 unanswered; the user reset Charlene's data instead, which does not fix the shape for any other Client) | none       |
| —      | P1 / P2    | **PARKED** at Q3 (D3 above)                                                                                                                                                                                               | —          |

S1 first and alone: it is live on staging, it is the only crash, and it shares no
file with the others.

---

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | 2026-08-13 | Grilling session. D1/D1a settled then P1/P2 **parked** at Q3. D2's symptom corrected twice — "empty state" → **crash**, from the user's screenshots — and then **diagnosed**: `page.tsx` imports `PRESET_DAYS` from a `"use client"` module, so `presets.includes` dots into a client reference in the production RSC build; the reachability table accounts for all four observations and a repo-wide sweep found this to be the only instance. D6–D10 settled. C1 resolved by the user **deleting Charlene's rows** over the planner's three recorded objections; the display defect it was raised for remains open. |
| 1   | 2026-08-13 | Created from Vaibhav's note. Seven items split out; ground truth established read-only before grilling (selector is URL-state and Dashboard-local; upload attribution is chosen per upload; C1 is the `bi.*` vs `public.uploads` seam, both numbers true; the drill-down exists but is unlinked and speaks a different URL dialect; C2's likeliest shape is UTC rendering read from another zone).                                                                                                                                                                                                                     |
