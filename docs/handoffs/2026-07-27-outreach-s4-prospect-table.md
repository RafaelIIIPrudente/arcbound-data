# Handoff — Outreach System S4: the prospect table (viewer parity)

- **Type:** Executer handoff (feature slice, S4 of the Outreach System workstream)
- **Date:** 2026-07-27
- **Branch:** `feat-outreach-system-dashboard`
- **Status:** Ready to run. Depends on **S3** (built, green, uncommitted).
- **Brief:** [spec §S4](../specs/2026-07-27-outreach-system-dashboard.md) +
  [ADR 0012](../adr/0012-outreach-system-per-client-snapshots.md) +
  [decision record v4](../decisions/2026-07-27-multi-service-dashboard-and-connection-count.md).

## Decision & rationale

Bryan judged the S3 aggregate view "a good view for the client" and asked for the
staff view to be formatted like his `Arcbound_Master_DB_Viewer.html`. That splits
along ADR 0012's own line — aggregates for the Client, row detail for staff — so
the prospect table, deferred in the original shaping, is un-deferred and lands
before Trends.

The load-bearing guardrail: **the viewer's own pill logic is buggy in exactly the
place S3 was careful.** `/Positive|Interested/` is tested before
`/Negative|Not Interested/`, so `Not Interested` matches on the substring
"Interested" and renders as a **green positive reply**. Porting that regex would
silently undo S3's refusal to guess.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class React 19 + TypeScript (strict) engineer who builds dense
data tables that stay honest — you will happily show a user 24 columns of messy
source data, and you will not colour a cell in a way the data does not justify.
You port a reference implementation's INTENT, never its bugs. You read before you
write; ⚠️ comments in this repo are binding; you write failing tests first and
prove they fail for the right reason; you never widen scope silently; you report
with real command output.

GOAL
Add the prospect table to the Outreach client tab, below the existing aggregates:
free-text search, four filters, click-any-column sort, all 24 columns, status
pills — modelled on Bryan's standalone Master DB viewer but wearing ArcBase's
design language.

CONTEXT — read FIRST (do not restate; follow):
- `docs/specs/2026-07-27-outreach-system-dashboard.md` — §"Global Constraints",
  §"Source data" (REAL observed values and fill rates — trust them), §"Slice S4".
- `docs/adr/0012-outreach-system-per-client-snapshots.md`.
- `AGENTS.md`; `CONTEXT.md` (Outreach System, Prospect, Outreach Snapshot, Stage).
- S1 + S3 ARE BUILT AND IN THE TREE. Read them for actual signatures:
    src/services/outreach.ts           — latestSnapshot(clientId): three states,
                                         carries `truncated` + `total`, and
                                         ALREADY returns all 24 columns for every
                                         row, paged past the 1,000-row cap.
    src/services/types.ts              — `OutreachProspect` (24 camelCase fields)
    src/lib/outreach-vocab.ts          — canonicalReply / canonicalStage /
                                         isKnownStage / REPLY_BUCKET_LABELS
    src/app/(app)/clients/[id]/outreach/page.tsx — the page you extend
- ⚠️ NO NEW DATABASE READ. The page already fetches every row to compute the
  analytics. Pass the SAME `snapshot.prospects` array to the table. If you find
  yourself adding a query, stop — you have misread the page.
- PRECEDENT TO MIRROR — `src/components/dashboard/posts/posts-table.tsx` +
  `columns.tsx`. `@tanstack/react-table` is ALREADY a dependency: client-side
  sorting, `ColumnDef` in a sibling `columns.tsx`, `"use client"` boundary,
  pagination after sorting. Follow that shape; add `getFilteredRowModel`.
- THE REFERENCE VIEWER (Bryan's file, for INTENT only — you do not have it, and
  do not need it; everything it does is specified below):
  header + static stats strip, then a controls bar (search box, four dropdowns,
  "N of M shown"), then one sticky-header table of all 24 columns with sortable
  headers, coloured pills on Connection Status / Reply Status / ICP Seg, the
  LinkedIn URL rendered as a "profile ↗" link, and every other cell 3-line
  clamped with the full text on hover.

STEPS — TDD throughout (RED first; prove each test fails for the right reason):

1. Pills — `src/components/dashboard/outreach/outreach-pill.tsx` (+ test).
   Wrap the repo's `Badge` (`@/components/ui/badge`) with ArcBase palette classes;
   do NOT introduce the viewer's own colours (#0f1115 / #4f9cf9 / #56d364).
   • Connection Status: `Connected` and `Pending` get distinct treatments; any
     other value gets the neutral one.
   • Reply Status: colour from `canonicalReply(raw)` — the S3 module — NEVER from
     a regex over the raw string.
     ⚠️ THE REFERENCE VIEWER IS WRONG HERE AND YOU MUST NOT REPRODUCE IT. Its
     logic is `/Positive|Interested/.test(v) ? positive : /Negative|Not
     Interested/.test(v) ? negative : neutral`. "Not Interested" contains the
     substring "Interested", so the FIRST branch wins and the viewer paints it a
     GREEN POSITIVE REPLY; the negative branch is unreachable for it.
     "Replied - Interested" goes green the same way. Those are the exact two
     values S3 deliberately left unmapped. Both are `unrecognised` here and MUST
     render as visibly unclassified — not positive, not negative, and not hidden.
   • ⚠️ THE PILL SHOWS THE RAW STORED TEXT. Colour is grouping; the label is the
     value. A cell reading "Replied 2026-07-13" says that, even though it buckets
     as replied-unspecified. ArcBase does not rewrite what the sheet says
     (ADR 0009).
   • Tests: "Not Interested" and "Replied - Interested" both render unclassified
     (assert they carry NEITHER the positive NOR the negative treatment); a dated
     "Replied 2026-07-13" renders its raw text; "Replied - Positive" is positive.

2. Columns — `src/components/dashboard/outreach/prospect-columns.tsx`.
   All 24 `OutreachProspect` fields as `ColumnDef`s, in SOURCE ORDER (use
   `rowIndex` order / the field order in the type — the export's own order is the
   order staff know).
   • `linkedinUrl` → an anchor reading "profile ↗", `target="_blank"` with
     `rel="noreferrer noopener"`; renders nothing when null.
   • `fullName` → no wrap, emphasised.
   • `connectionStatus` / `replyStatus` / `icpSeg` → the pills from step 1.
   • Everything else → 3-line clamp with the full value as a `title` tooltip.
   • ⚠️ A NULL CELL RENDERS EMPTY, NEVER "0", "—", "null", OR "N/A". These are
     text columns straight from the sheet; an invented placeholder is ArcBase
     asserting something the export did not say.
   • Header labels use the SOURCE column names ("Date Sent", "Follow-up Count",
     "What Arcbound Offers"), not the camelCase field names — staff match this
     against the spreadsheet.

3. Table — `src/components/dashboard/outreach/prospect-table.tsx` (+ test),
   `"use client"`, props `{ prospects: OutreachProspect[] }`.
   • TanStack: `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`,
     `getPaginationRowModel`. Sorting and filtering run over the WHOLE set.
   • Global search: a `globalFilter` matching case-insensitively across ALL 24
     fields (the viewer joins the row and substring-matches — same effect).
   • Four filter selects, each built from the values PRESENT in this snapshot,
     using the repo's `Select`:
       – Connection Status — raw values.
       – Stage — `canonicalStage` values.
       – ICP Seg — raw values.
       – Reply Status — ⚠️ CANONICAL BUCKETS, NOT RAW VALUES. Options are the
         `REPLY_BUCKET_LABELS` actually present; selecting one keeps every row
         whose `canonicalReply` matches. This is why the dropdown has ~7 entries
         instead of 15, eight of which would be single-row dates. The CELL still
         shows the raw text — the filter groups, it does not rename.
   • A live count reading "N of M shown" (M = total rows given), viewer parity.
   • Sticky header; horizontal scroll inside the table's own container.
     ⚠️ THE PAGE BODY MUST NOT SCROLL SIDEWAYS — 24 columns overflow, and the
     overflow belongs to the table, not the document.
   • Pagination: keep TanStack's pager (PLANNER'S CALL, deviating from the
     viewer's single long list) at a generous page size — 24 columns × 1,435 rows
     is ~34,000 DOM cells. Filter and sort still run over the full set, so the
     pager walks the filtered+sorted result; changing either resets to page 1,
     exactly as `posts-table.tsx` documents. Note it in REPORT BACK if this reads
     worse than one long scroll.
   • Tests: typing in the search narrows rows AND updates the count; a Reply
     bucket filter keeps a dated "Replied 2026-07-13" row under
     replied-unspecified; clicking a header sorts and clicking again reverses;
     filters compose; clearing everything restores all rows.

4. Wire it into `src/app/(app)/clients/[id]/outreach/page.tsx`.
   • Render below `OutreachDisclosure`, inside the existing `status === "ok"`
     branch only, passing `snapshot.prospects`.
   • ⚠️ FIX THE PAGE'S OWN ⚠️ COMMENT. It currently reads "…which is also why
     this page renders no prospect rows at all, only tallies." That becomes FALSE
     with this slice. REWRITE it — do not delete it. The staff-only boundary it
     protects is now MORE load-bearing, not less: this page will render prospect
     names, LinkedIn URLs, locations, drafted messages, and the email addresses
     inside Notes. Say that, and keep the prohibition on reuse by any print view,
     the public `/r/[token]` route, or anything a Client can reach.
   • ⚠️ THE AGGREGATES ABOVE MUST NOT RESCOPE TO THE TABLE'S FILTERS. Each funnel
     step is captioned with the column and rule that produced it ("a date is
     recorded in Date Sent"); recomputing those over a filtered subset makes
     every caption false. The KPIs, funnel and charts describe the whole
     snapshot, full stop — which is also what the reference viewer does. Add a
     test that the table's filter state cannot reach them.
   • Truncation: the existing `OutreachTruncated` banner still covers it. Do not
     add a second one, but make sure "N of M shown" cannot be misread as the
     whole snapshot when the read was capped.

ACCEPTANCE
- The Outreach tab renders the aggregates, then the table, on one page.
- All 24 columns render, in source order, with source column names as headers.
- Search, the four filters, and click-to-sort all work client-side over every row.
- The Reply filter lists canonical buckets; every cell shows its raw stored value.
- "Not Interested" and "Replied - Interested" render UNCLASSIFIED — provably
  neither positive nor negative.
- Null cells render empty; no "0", "—", or "N/A" is invented.
- The aggregates are unaffected by any filter.
- The page body does not scroll horizontally.
- No rate, percentage, score, rank, or benchmark appears anywhere.
- Test count strictly up; no existing assertion weakened; every new test RED-first
  and mutation-verified.

VERIFICATION (the whole gate — nothing else)
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output pasted.
- Mutation table (real runs): (a) colour the reply pill with the viewer's
  `/Positive|Interested/` regex → the "Not Interested" test fails; (b) render a
  null cell as "—" → the empty-cell test fails; (c) build the Reply filter from
  raw values → the bucket-filter test fails; (d) recompute a KPI from the
  filtered rows → the aggregates-unaffected test fails.
- REPORT THE MEASURED PAYLOAD: the built page's First Load JS and, if you can
  get it, the serialised size of the prospects array reaching the client. The
  planner measured the 1,435-row export at ~2.10 MB as JSON objects and ~1.51 MB
  as arrays-of-arrays. The object shape is ACCEPTED for an internal desktop tool
  — do NOT restructure it pre-emptively. Report the number; flag it if the built
  page is materially worse than that estimate.
- NO Claude-in-Chrome / dev-server walk — assert through component markup and
  pure functions only.

GUARDRAILS
- READ THE ACTUAL GIT STATE AT START and report it. Stay on
  `feat-outreach-system-dashboard`; never commit to `main`; SURFACE (never
  self-heal) any unexpected commit. LEAVE ALL WORK UNCOMMITTED.
- ⚠️ Build ADDITIVELY on uncommitted S1/S2/S3 work: do NOT revert, stash, reset,
  or reimplement it. Do NOT change `outreach-vocab.ts`, `outreach-analytics.ts`,
  `src/services/outreach.ts`, `parse-outreach.ts`, or any SQL — S4 adds a view of
  data those already produce. Do NOT run `db push`.
- ⚠️ NOTHING ON THIS PAGE MAY LEAVE THE STAFF SURFACE. Third-party prospect PII.
  No export button, no "download CSV", no copy-all action — deliberately out of
  scope this slice. Do not add the table to any report, print view, or public
  component.
- Do NOT build Trends (S5) or the Report Link aggregate (S6).
- Do NOT restyle the S3 aggregates, the nav, or the other client tabs.
- If a change needs a file outside SCOPE, STOP and FLAG.

SCOPE — create/modify ONLY:
`src/components/dashboard/outreach/outreach-pill.tsx` (+ test);
`src/components/dashboard/outreach/prospect-columns.tsx` (+ test);
`src/components/dashboard/outreach/prospect-table.tsx` (+ test);
`src/app/(app)/clients/[id]/outreach/page.tsx`.

REPORT BACK
- Git state at start; files changed; final `git status --porcelain`.
- The reply-pill mapping in full, and proof "Not Interested" is unclassified.
- The rewritten staff-only ⚠️ comment, verbatim.
- The page size you chose and why; whether a pager beats one long scroll here.
- Measured payload numbers (above), and whether they concern you.
- Full gate output + the mutation table (real runs); test count before/after.
- FLAGS: anything you stopped short of; whether 24 columns of horizontal scroll
  is genuinely usable, or whether a curated default set with a reveal control
  would serve staff better (Bryan chose full parity knowingly — say if the built
  result argues otherwise).
```

## Feedback & revisions

- **2026-07-27 — v1 (authored).** Un-defers the prospect table and makes it S4
  (Trends → S5, Report Link → S6). Eight decisions taken as recommended (see the
  [decision record v4](../decisions/2026-07-27-multi-service-dashboard-and-connection-count.md)).
  Leads with the reference viewer's own pill bug — `Not Interested` renders green
  because `/Positive|Interested/` is tested first — because porting it would
  silently reverse S3's refusal to classify that value. Two planner calls flagged
  as vetoable: keeping a pager rather than the viewer's single long scroll, and
  rewriting rather than deleting the page's staff-only ⚠️ comment.
  _(Append dated entries as the executer reports back.)_

- **2026-07-27 — v2: executer run COMPLETE and green.** Gate: lint clean,
  type-check clean, **1217 tests** (1129 → +88), build exit 0, route
  `/clients/[id]/outreach` at 6.63 kB / 326 kB First Load. All four mutations
  caught. Planner spot-checked the tree and confirms: the pill reads
  `canonicalReply` (never a regex), `unclassified` is a distinct tone rendered
  amber-dashed and carried on a `data-tone` attribute so tests assert the
  classification rather than a class string; no leftover mutation code
  (`grep filteredAnalytics` → nothing); working tree is 1 modified + 6 new, all
  in SCOPE.
  - **Both planner calls accepted by the executer, with reasoning worth keeping.**
    Page size 100 (~2,400 cells vs the viewer's ~34,000, re-laid-out on every
    keystroke). Their sharper framing: the pager's value isn't paging — search
    narrows 1,435 to a handful in one keystroke, so pagination rarely engages at
    all; it only matters when browsing without a query.
  - **⚠️ A REAL DEFECT THEY FOUND AND FIXED, outside the brief.** TanStack's
    default filter is a substring `includes`, so selecting "Connected" from the
    dropdown would ALSO have matched "Not Connected". The Stage filter passed its
    test only by luck (canonical == raw for that fixture) and would have broken on
    any row stored as `closed-low fit`. All four filters now match explicitly —
    `equalsRaw` on Connection Status and ICP Seg, `matchesCanonical` on Reply
    Status and Stage. **Verified in `prospect-columns.tsx:163,199,204,212`.**
    Accepted as in-scope: the brief specified the filters' semantics, and the
    default fn silently violated them.
  - **Payload, measured on a synthetic 1,435-row snapshot** (no live data in
    reach, and no dev-server walk permitted): 1.99 MB as objects (planner
    estimated ~2.10 MB), 1.46 MB as arrays (estimated ~1.51 MB), **631 kB gzip /
    406 kB brotli over the wire**. Their argument for keeping the object shape is
    accepted: ~540 kB is the 24 key names repeated 1,435 times and ~131 kB is two
    UUIDs repeated per row, and that redundancy is precisely what brotli removes —
    so the readable shape costs memory and parse time, not download.
  - **Two judgement calls accepted:** header labels show the short form with the
    EXACT spreadsheet spelling (`Why They Fit (signal)`, `Meeting Booked (date)`)
    preserved in `meta.sourceHeader` and surfaced as the header tooltip, pinned by
    a test — so nobody loses the literal name when reconciling against the sheet;
    and ICP Seg gets ONE neutral pill rather than a hue per segment, because the
    column has no ranking and no fixed vocabulary, so a per-value palette would
    invent a categorisation the source does not contain.
  - **⚠️ OPEN — the usability finding, which is well-founded.** At ~1440px roughly
    6 of 24 columns are visible, and the four triage columns sit at positions
    14 (Connection Status), 15 (Date Sent), 16 (Reply Status) and 21 (Stage),
    behind seven wide free-text columns (Why They Fit, What They Lack, What
    Arcbound Offers, Matching Client Archetype, Source Citation, Rationale,
    LinkedIn Message). **Planner verified the positions against the
    `OutreachProspect` field order.** Consequence: Full Name (position 1) is never
    on screen together with any status column. Their proposal — keep all 24, pin
    Full Name as a sticky first column, add a column-visibility toggle defaulting
    to a curated ~8 with a "show all 24" control — preserves parity while making
    triage possible. Put to Bryan as a follow-up; NOT built unilaterally.
  - **Git:** commit `64900b5` ("feat: implement outreach system with immutable
    snapshots and atomic ingestion", 46 files, +7469/−12) landed MID-TURN,
    committing all S1/S2/S3 work. Bryan's own commit — expected under the
    standing "I commit" rule — surfaced by the executer as instructed rather than
    acted on. Nothing was dropped; S4 built additively on top.
