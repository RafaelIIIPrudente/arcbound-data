# Total impressions as a fourth Key Performance hero figure

**Date:** 2026-08-19
**Status:** Shaped, handed off, **built** (2026-08-19, uncommitted)
**Surface:** `/clients/[id]/report` (staff), the print/export PDF, and `/r/[token]`
(the Client's own report)

---

## The ask

Bryan sent two screenshots of the Client LinkedIn Report's **Key performance**
section:

1. The section with its hero row and all-time matrix — _"under this table, I want
   to highlight also total number of impressions, likes, comments and
   reposts (Change name to: shares)"_.
2. The hero row alone (`192 · 22 · 4,231` for Charlene Li, all time) — _"add here
   another for total number of impressions"_.

The second message relocates impressions specifically: **"another"** hero figure,
beside the existing three.

---

## D1 — Total impressions becomes the FOURTH hero figure

**Decided.** Not a quiet footer line beside Connections.

Total impressions is genuinely new to this report. The report has
`impressionsAverage` (mean impressions per post) and `impressionsSeries` (the
trend chart), but **no impressions total lives anywhere on the page** — so unlike
the other three metrics asked for, there is nothing to point the reader at
instead.

It belongs in the hero because it is period-scoped like its three neighbours, and
because a total seen 284,391 times is the figure a Client reads first.

---

## D2 — Likes / Comments / Shares are NOT added, because they are already there

**Decided: no change.** The ask is already satisfied by existing UI.

`InteractionsComparison` renders **immediately below** `KeyPerformance`, inside
the same "Key performance" section, on **all three surfaces** (staff report,
print export, `/r/[token]`). Its first row is Likes · Comments · Shares · Saves
for exactly the selected period.

Adding a highlight strip under the matrix would print the same three numbers
roughly 100px above the table that already carries them. On a document a Client
downloads, that reads as a defect rather than as emphasis.

Two alternatives were put to Bryan and declined:

- add the strip anyway and accept the repetition;
- add the strip and drop the `selected` row from `InteractionsComparison`
  (no duplication, but it silently changes what that panel means).

⚠️ **The "reposts → shares" rename needs no work — it is already the repo's
convention.** `reposts` is only the raw BI column name; `InteractionsRow.shares`
carries the comment _"`reposts` in the BI view — always labelled 'Shares' in the
UI"_, the `Shares` metric definition spells the reason out to a Client, and no
surface prints the word "Reposts". Verified across `src/`.

---

## D3 — Summed over `selected`, never over `selectedPlaceable`

The hero's `Total posts` is `selected.length`. `Total impressions` must sum the
**same population**, or the two hero figures describe different sets of posts
while sitting side by side under one period caption.

`client-report.ts` keeps a second, narrower population — `selectedPlaceable`,
the rows that could be _dated_ — and uses it for `impressionsAverage` and
`impressionsPostCount`, because a chart can only plot a post it can place on a
timeline. That is correct for the charts and **wrong for the hero**: an undated
post's impressions are a real measurement, and dropping them would understate the
total against a post count that counted them.

`impressions` is `number | null` on `BiPostRow` and the file's existing `sum()`
coerces through `num()`. That coercion is already blessed for likes, comments and
reposts and applies here for the same reason; it is the _saves_ column that must
never be coerced, and saves is untouched by this slice.

---

## D4 — The blast radius is wider than the screenshot: the PRINT COVER

⚠️ **The single fact that makes this more than a one-line change.**

`keyPerformance.selected` is read in **two** places, not one:

| Reader                       | File                         | Layout                   |
| ---------------------------- | ---------------------------- | ------------------------ |
| The section hero             | `key-performance.tsx:152`    | `grid grid-cols-3`       |
| **Page 1 of the client PDF** | `print/report-cover.tsx:151` | `grid grid-cols-3 gap-8` |

Both are hard-coded to three columns. A fourth figure orphans one item onto a
second row in both — including on the cover, which is the first and often the
only page a Client reads.

The cover is fed `figures={report.keyPerformance.selected}` straight from the
seam (`app/(print)/clients/[id]/report/print/page.tsx:85`) and _"does no
arithmetic of its own"_, so the array's length is the whole contract.

---

## D5 — Wide numbers are a real overflow risk, and abbreviation is banned

Impressions run one to two orders of magnitude larger than the figures they now
sit beside: `4,231` interactions against `284,391` impressions today, and seven
to nine characters for a larger Client.

The paper column is fixed at `--print-column: 700px`. Four columns with `gap-8`
leaves roughly 150px of content width per figure, against a cover figure set at
`text-4xl` (36px) and an on-screen hero at `sm:text-5xl` (48px) — and `sm:`
(640px) _is_ active at the print width, so paper gets the large size.

**The fix must be structural — a smaller type step, or a 2×2 grid.** Compacting
the number itself ("284.4K") is forbidden: every figure on this document is
exact, `format()` prints exact values everywhere, and a rounded headline on a
client-facing report is a precision claim we cannot support.

⚠️ **A test suite cannot see overflow.** Structure makes it safe by construction;
the printed sheet still wants one human look before it goes to a Client. This
matches the standing note in `interactions-comparison.tsx:84` — _"any FURTHER
column needs the printed sheet checked by eye before it ships, not just the test
suite."_

---

## D6 — The ⓘ is mandatory, and an existing test already enforces it

`REPORT_METRIC_KEYS` maps report labels → definition keys, and
`key-performance.test.tsx:391` drives that map from a **real** `buildClientReport`
result:

```ts
expect(labels.filter((l) => REPORT_METRIC_KEYS[l] === undefined)).toEqual([]);
```

So a fourth hero figure without a definition **fails the suite** rather than
shipping a silent gap. The guard's floor (`labels.length >= 7`) must rise to 8, or
it goes slack the moment it is satisfied.

`metric-definitions.test.ts:294` asserts the map's key list **exactly**, so it
must gain the new label too — that is a second, deliberate tripwire, not a
duplicate.

⚠️ The new definition is read by a **Client**, so it falls under the client-facing
sweeps in that suite: no "upload", "scrape", "schema" or "ingestion" vocabulary,
and none of the `FALSE_FRIENDS` (`refresh`, `sync`, `update`). A dashboard
`Impressions` definition already exists and is close in spirit — but the report's
own labels get report-specific keys naming the report's spans, so this needs its
own entry rather than a reuse of the dashboard key.

---

## D7 — Truncation is already covered; no new banner

A capped read makes every total a lower bound. `AnalyticsTruncated` already says
so on all three surfaces, in the same words, and the cover carries it too. Total
impressions rides the same read as the figures beside it, so it inherits the
existing caveat. **Do not add a second banner.**

---

## Scope

**Modify**

- `src/services/types.ts` — document the fourth member of `selected`; correct
  any prose that says "three".
- `src/services/client-report.ts` — the `selected` array.
- `src/lib/metric-definitions.ts` — a new report definition + `REPORT_METRIC_KEYS`
  entry.
- `src/lib/metric-definitions.test.ts` — the exact key-list assertion.
- `src/components/dashboard/report/key-performance.tsx` — hero grid to 4-up.
- `src/components/dashboard/report/key-performance.test.tsx` — the hero test and
  the `>= 7` floor.
- `src/components/dashboard/report/print/report-cover.tsx` — cover grid to 4-up.
- `src/services/client-report.test.ts` — cover the new figure.
- `src/components/dashboard/report/print/report-cover.test.tsx` (if present).

**Do not touch** — `interactions-comparison.tsx` and its row-building (D2),
`impressionsAverage` / `impressionsSeries` / `impressionsPostCount` (D3), the
ingestion path, the `bi.*` views, `posting-cadence.tsx`, `content-composition.tsx`.

---

## Verification

`pnpm lint && pnpm type:check && pnpm test && pnpm build`, plus unit and component
tests. **No Claude-in-Chrome, no dev-server walk** — standing instruction.

Test count strictly up; no existing assertion weakened.

---

## Feedback & revisions log

| Date       | From                 | Change                                                                                                                                                                                       |
| ---------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-19 | Bryan (screenshot 1) | Asked for impressions + likes + comments + shares under the matrix table.                                                                                                                    |
| 2026-08-19 | Bryan (screenshot 2) | Relocated impressions to the hero row — _"add here another"_.                                                                                                                                |
| 2026-08-19 | Bryan (answer)       | Chose **hero fourth figure** for impressions; chose to **leave likes/comments/shares** to `InteractionsComparison` rather than duplicate them.                                               |
| 2026-08-19 | Bryan                | Asked for the `/r/[token]` fixture gap (flagged in the build report) to be closed too — done, with a surface-level assertion.                                                                |
| 2026-08-19 | Bryan                | Asked for the printed sheet to be checked on the dev server, overriding the standing "no dev-server walk" rule — done; two corrections to the headroom estimate recorded above.              |
| 2026-08-19 | Bryan                | Asked for a 4-up on wide screens (`xl:grid-cols-4`). Measurement showed `xl` overflows by 6.2px at 1280–1304; chose the container-query gate instead. See **D8**.                            |
| 2026-08-19 | Executer             | Built. D5's open question — smaller type step **or** 2×2 — resolved as **2×2 by default on both grids**, keeping the existing type scale, plus a container-gated 4-up on the hero only (D8). |

---

## As built

**Layout (D5, resolved).** Both grids went `grid-cols-3` → `grid-cols-2`. No type
step was reduced, so the hero keeps the 48px scale that carries its hierarchy and
the cover keeps 36px.

Why 2×2 rather than four across: the paper column is FIXED at 700px, and four
columns would leave ~163px of content per figure. Two columns give 342px on the
hero (`gap-x-4`) and 334px on the cover (`gap-8`).

**Verified in the browser (2026-08-19), not estimated.** Dev server, Charlene Li,
all time, `/clients/[id]/report/print` at the real 700px column:

| Surface              | Cell  | Widest figure | Rendered | Headroom | Ceiling      |
| -------------------- | ----- | ------------- | -------- | -------- | ------------ |
| Print cover (36px)   | 334px | `1,012,301`   | 179.4px  | 154.6px  | 12 digits    |
| Hero on paper (48px) | 342px | `1,012,301`   | 239.2px  | 102.8px  | **9 digits** |

`document.documentElement.scrollWidth - clientWidth === 0` on the print route: no
horizontal overflow, and no second-row orphan on either grid. Measured advances:
30.7px a digit and 12.15px a comma at 48px; 23.03px and 9.1px at 36px.

⚠️ **Two corrections to what was written before the walk.**

1. The binding ceiling is **9 digits** (up to 999,999,999), not the 11 estimated
   from font metrics — a 10-digit total overflows the hero cell by ~1.5px. Still
   ~3 orders of magnitude of headroom, but the estimate was two digits optimistic.
2. This client's all-time total is **1,012,301**, not the 284,391 the shaping note
   assumed from an older screenshot — already 7 digits on day one.

### D8 — the 4-up is gated on the CONTAINER, never on the viewport

Added after the walk showed the 2×2 reading sparse on a wide staff screen: at a
1470px viewport the hero cells are 577px holding at most 239px of text.

`xl:grid-cols-4` was tried first and **measured wrong**. `xl` fires at a 1280px
VIEWPORT, but the staff report spends 300px of it on the sidebar and page
padding, leaving a 233px cell against 239.2px of text — six pixels past the
margin line every other figure aligns to, for every window from 1280 to 1304. It
does not clip or collide (impressions is the last column, so the overrun lands in
the page padding), but it is a misalignment on a report.

The constraint is the CONTAINER, not the window. `@container` + `@6xl:grid-cols-4`
(Tailwind v4, already used in `ui/card.tsx`) measures the thing that actually
bounds the figure, so the sidebar is accounted for by construction. Verified in
the browser by driving the container width directly:

| Container               | Columns | Cell    | `1,012,301` @48px | Slack      |
| ----------------------- | ------- | ------- | ----------------- | ---------- |
| 700px (**paper**)       | **2**   | 342px   | 239.2px           | 102.8px    |
| 1151px                  | 2       | 567.5px | 239.2px           | 328.3px    |
| **1152px** (the switch) | **4**   | 276px   | 239.2px           | **36.8px** |
| 1452px                  | 4       | 351px   | 239.2px           | 111.8px    |

⚠️ **THE 4-UP COSTS DIGIT HEADROOM, AND THIS IS THE NUMBER TO REMEMBER.** At the
1152px switch — the tightest 4-up there is — the cell holds **8 digits**
(`12,345,678` = 269.8px, 6.2px of slack) and **9 overflows** (`123,456,789` =
300.5px, 24.5px over). The 2×2 fallback holds 9 on paper. So the ceiling is
8 digits in the narrow 4-up band and 9 everywhere else. This client is at 7.

⚠️ The `@container` parent is load-bearing: a `@`-variant with no `@container`
ancestor silently never matches, and the hero would just never go 4-up with
nothing failing. `key-performance.test.tsx` asserts the parent carries it,
mutation-proved.

**Known limit at the narrow end.** Below `sm` the figure is `text-3xl` (30px),
where `1,012,301` measures 149.5px. A two-column cell is ~136px at a 320px
viewport, so it would overflow there by ~14px; it fits from ~360px up. The
previous three-column layout was far worse at every one of those widths, so this
remains strictly an improvement — but 320px is not proven clean.

**What the tests do and do not prove.** `key-performance.test.tsx` and
`report-cover.test.tsx` each pin the STRUCTURE — four figures, no three-column
track — because jsdom computes no layout and can see neither overflow nor a
second-row orphan. The measurements above came from a real browser and are the
only evidence about overflow; D5's "one human look" is now satisfied for the
on-screen preview at the paper column, though nobody has yet put it on paper.

**Prose count made self-checking.** `reportTotalPosts` told a Client "The three
large figures are all scoped to that period"; that sentence is now four, and a
test drives the number word from `keyPerformance.selected.length` so a fifth
figure fails rather than shipping a false count.

**`/r/[token]` covered at the SURFACE, not just transitively.** Flagged first as
out of scope, then added on request: `public-report.test.tsx`'s
`keyPerformance.selected` fixture carries the fourth figure, and a new test
asserts the Client's own report shows `Total impressions`, the exact `284,391`,
and its ⓘ. Mutation-proved by trimming the wrapper's `selected` to three figures
— the shape a "narrow the public boundary" change would take — which turns it
RED.
