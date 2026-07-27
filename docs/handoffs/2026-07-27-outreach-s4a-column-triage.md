# Handoff — Outreach System S4a: sticky name + column visibility

- **Type:** Executer handoff (follow-up pass on S4)
- **Date:** 2026-07-27
- **Branch:** `feat-outreach-system-dashboard`
- **Status:** Ready to run. Depends on **S4** (built, green, UNCOMMITTED — run
  this before S5, which touches the same page).
- **Brief:** the S4 executer's own usability finding, put to Bryan and confirmed.

## Decision & rationale

Bryan chose all-24-column parity before anyone had seen 24 columns rendered. The
S4 executer measured the result and the planner verified it against the
`OutreachProspect` field order: at ~1440px roughly 6 of 24 columns are visible,
and the four triage columns sit at positions **14** (Connection Status), **15**
(Date Sent), **16** (Reply Status) and **21** (Stage) — behind seven wide
free-text columns. Full Name is position 1, so **the name and any status column
can never be on screen together**.

Bryan's call: keep all 24 available, pin Full Name, default to a curated ~8.
Parity preserved; triage made possible.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class React 19 + TypeScript (strict) engineer with a specialism
in dense data tables. You know that hiding a column is a display decision that
must never become a search decision, and that a sticky cell without an opaque
background is a bug that only shows up when someone scrolls. You read before you
write; ⚠️ comments in this repo are binding; you write failing tests first and
prove they fail for the right reason; you never widen scope silently; you report
with real command output.

GOAL
Make the Outreach prospect table triage-able without losing full parity: pin Full
Name as a sticky first column, and default the view to eight columns with a
control that reveals all 24.

CONTEXT — read FIRST (do not restate; follow):
- S4 IS BUILT AND UNCOMMITTED IN THE TREE. Read these before changing anything:
    src/components/dashboard/outreach/prospect-table.tsx    — TanStack table,
      "use client", global search + 4 filters + pager (page size 100)
    src/components/dashboard/outreach/prospect-columns.tsx  — 24 ColumnDefs, a
      `meta.sourceHeader` carrying the exact spreadsheet spelling, and explicit
      filterFns (`equalsRaw` / `matchesCanonical`) — do NOT disturb those
    src/components/dashboard/outreach/outreach-pill.tsx
- `docs/handoffs/2026-07-27-outreach-s4-prospect-table.md` — the slice this
  extends, and its Feedback log recording why this pass exists.
- PRECEDENT: `src/components/dashboard/posts/posts-table.tsx` for the table
  idiom; `src/components/ui/dropdown-menu.tsx` for the menu primitive.
- WHY THIS EXISTS (do not re-derive): at ~1440px about 6 of 24 columns fit, and
  Connection Status / Date Sent / Reply Status / Stage are columns 14, 15, 16 and
  21. Full Name is column 1. Today they cannot be read together.

STEPS — TDD throughout (RED first; prove each test fails for the right reason):

1. Sticky first column. Full Name sticks to the left edge and survives horizontal
   scroll, in BOTH the header row and every body row.
   • ⚠️ IT NEEDS AN OPAQUE BACKGROUND. A sticky cell with a transparent
     background lets the columns behind it scroll THROUGH the text. Give the
     header cell and the body cell backgrounds that match their rows, including
     the hover state, so nothing bleeds.
   • ⚠️ THE TOP-LEFT CELL IS STICKY IN BOTH AXES and needs a higher z-index than
     either the sticky header row or the sticky column, or it will be overlapped
     by one of them at the corner.
   • ⚠️ THE PAGE BODY STILL MUST NOT SCROLL SIDEWAYS. S4 pins this with a test —
     keep that test passing; the overflow stays inside the table's container.

2. Column visibility. Use TanStack's `columnVisibility` state (do NOT filter the
   `columns` array — the hidden columns must remain part of the table).
   • DEFAULT VISIBLE, exactly these eight, in the existing source order:
       Full Name · Title · Company · ICP Seg · Connection Status · Date Sent ·
       Reply Status · Stage
   • A control built from the repo's `DropdownMenu` with checkbox items, one per
     column, labelled with `meta.sourceHeader`, plus "Show all 24" and "Show
     triage columns" actions. Place it in the existing controls bar.
   • The control states how many of 24 are showing, so a hidden column is never
     a silent absence.

3. ⚠️ THE LOAD-BEARING TEST OF THIS SLICE: HIDING A COLUMN MUST NOT NARROW THE
   SEARCH. With `Notes` hidden, typing an email address that appears only in
   `Notes` MUST still return that row. Anything else is the worst failure this
   table can have — you hide a column, search for something that IS in the data,
   get nothing back, and conclude it is not there. Visibility is a rendering
   concern; the global filter reads every field regardless.
   • Verify TanStack's actual behaviour rather than assuming it: if the global
     filter skips non-visible columns by default, configure it so it does not
     (e.g. `getColumnCanGlobalFilter: () => true`), and pin the behaviour with
     the test above.
   • Same rule for the four dropdown filters: hiding Stage must not disable
     filtering by Stage.

4. Persistence: NONE. Visibility is ephemeral per-mount, like S4's sorting and
   pagination. Do NOT put it in the URL, localStorage, or a cookie — S4's own
   comment records that the server owns no state on this page, and adding a
   persisted preference is a decision for Bryan, not a side effect of this pass.

ACCEPTANCE
- Full Name stays visible while scrolling right, with no text bleeding through
  it, in header and body, including on hover.
- Eight columns show by default; the control reveals all 24 and can restore the
  triage set.
- A search term present ONLY in a hidden column still finds its row. Same for the
  filters.
- The page body does not scroll horizontally (S4's existing test still passes).
- `meta.sourceHeader`, the explicit filterFns, the pills, and the pager are all
  untouched in behaviour.
- Test count strictly up; no existing assertion weakened; every new test RED-first
  and mutation-verified.

VERIFICATION (the whole gate — nothing else)
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output pasted.
- Mutation table (real runs): (a) make the global filter skip hidden columns →
  the hidden-Notes search test fails; (b) implement visibility by filtering the
  `columns` array → the same test fails (the column stops existing, not just
  showing); (c) drop the sticky cell's background → assert the class/style is
  present, so the test fails; (d) default to all 24 visible → the default-set
  test fails.
- NO Claude-in-Chrome / dev-server walk — assert through component markup only.
  ⚠️ Sticky positioning cannot be proven by jsdom layout; assert the applied
  classes/styles and say plainly in REPORT BACK that visual correctness is
  unverified by the gate and needs Bryan's eye.

GUARDRAILS
- READ THE ACTUAL GIT STATE AT START and report it. Stay on
  `feat-outreach-system-dashboard`; never commit to `main`; SURFACE (never
  self-heal) any unexpected commit. LEAVE ALL WORK UNCOMMITTED.
- ⚠️ Build ADDITIVELY on uncommitted S4 work: do NOT revert, stash, reset, or
  reimplement it.
- Do NOT change the column ORDER, the pills, the filter semantics, the page size,
  or any service/vocab/SQL file.
- Do NOT add an export, download, or copy-all control — still banned, and the
  page's ⚠️ comment says so.
- Do NOT build Trends (S5) or the Report Link aggregate (S6).
- If a change needs a file outside SCOPE, STOP and FLAG.

SCOPE — create/modify ONLY:
`src/components/dashboard/outreach/prospect-table.tsx` (+ test);
`src/components/dashboard/outreach/prospect-columns.tsx` (+ test).

REPORT BACK
- Git state at start; files changed; final `git status --porcelain`.
- What TanStack actually does with hidden columns and the global filter, and what
  you had to configure — this is the finding of the slice.
- The default eight, and how the control reads when some are hidden.
- Full gate output + the mutation table (real runs); test count before/after.
- FLAGS: what the gate could NOT prove (sticky rendering); whether eight is the
  right default set.
```

## Feedback & revisions

- **2026-07-27 — v1 (authored).** Confirmed with Bryan after the S4 executer
  surfaced the finding and the planner verified the column positions against the
  `OutreachProspect` field order. The load-bearing requirement is not the sticky
  column — it is that **hiding a column must not narrow the search**; a hidden
  `Notes` field that silently drops out of the global filter would let staff
  conclude an email is absent when it is present.
  _(Append dated entries as the executer reports back.)_
