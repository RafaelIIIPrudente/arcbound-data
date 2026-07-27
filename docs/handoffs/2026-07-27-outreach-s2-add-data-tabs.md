# Handoff — Outreach System S2: "Add Data" reshape + Outreach upload tab

- **Type:** Executer handoff (feature slice, S2 of the Outreach System workstream)
- **Date:** 2026-07-27
- **Branch:** `feat-outreach-system-dashboard`
- **Status:** Ready to run. Depends on S1 (built, green, uncommitted).
- **Brief:** [spec §S2](../specs/2026-07-27-outreach-system-dashboard.md) +
  [ADR 0012](../adr/0012-outreach-system-per-client-snapshots.md).

## Decision & rationale

The upload screen stops being LinkedIn-only: the sidebar item becomes the
service-agnostic **Add Data**, and `/upload` hosts two tabs. The LinkedIn form is
untouched. Two traps the planner verified in the code are carried in as binding
requirements: the **1 MB server-action body limit** (the real export is 1.42 MB,
so the first real upload would fail), and the **silent 25th-column drop** flagged
by the S1 executer.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class Next.js (App Router) + React 19 + TypeScript (strict)
engineer who adds a second path through an existing screen WITHOUT disturbing the
one that already works, and who treats a silently-dropped input as a defect rather
than a tidy default. You read before you write; ⚠️ comments in this repo are
binding; you write failing tests first and prove they fail for the right reason;
you never widen scope silently; you report with real command output.

GOAL
Turn ArcBase's LinkedIn-only `/upload` screen into a two-tab "Add Data" screen:
tab 1 is the EXISTING LinkedIn metrics form, unchanged; tab 2 is a new Outreach
System upload (select client → drop the Master DB CSV → snapshot ingested). Rename
the sidebar item accordingly.

CONTEXT — read FIRST (do not restate; follow):
- `docs/specs/2026-07-27-outreach-system-dashboard.md` — §"Global Constraints",
  §"Source data", §"Slice S2".
- `docs/adr/0012-outreach-system-per-client-snapshots.md` — snapshots, per-client
  attribution at upload, no name-matching.
- `AGENTS.md`, `CONTEXT.md` (terms: Outreach System, Prospect, Outreach Snapshot).
- S1 IS ALREADY BUILT AND UNCOMMITTED IN THE TREE — use it, do not rebuild it:
    src/lib/parse-outreach.ts     — pure CSV → rows + Zod (24 exact headers)
    src/services/outreach.ts      — ingestOutreach(clientId, rows), latestSnapshot,
                                    listOutreachUploads
    supabase/outreach-system.sql  — tables + ingest_outreach RPC (NOT yet applied
                                    to the hosted DB; that is a staff action)
  Read these files for their ACTUAL exported signatures before wiring anything.
- PRECEDENTS TO MIRROR:
    • `src/components/dashboard/ingest/upload-form.tsx` — the 4-step wizard,
      CSV drag/drop + FileReader, `useActionState`, ResultSummary/reset flow.
    • `src/app/(app)/upload/actions.ts` — envelope Zod validation, parse, call the
      seam, and attach a NON-BLOCKING `warning` on success (see how
      `nameMatchWarning` is attached in a try/catch that can never fail the write).
    • `src/components/dashboard/ingest/result-summary.tsx` — the success panel.

STEPS — TDD throughout (RED first; prove each test fails for the right reason):

1. ⚠️ RAISE THE SERVER-ACTION BODY LIMIT FIRST — without this the feature cannot
   work on real data. `next.config.ts` currently sets no
   `experimental.serverActions.bodySizeLimit`, so the limit is Next's DEFAULT 1 MB.
   The real export is 1,493,914 bytes (1.42 MB) and grows as prospects are added.
   Set it explicitly (suggest "4mb") with a comment recording: the measured file
   size, why the default is insufficient, and that Vercel caps a serverless
   request body around 4.5 MB — so this transport has finite headroom and a
   materially larger sheet will need a different ingest path (direct-to-storage),
   which is NOT this slice. Do not silently pick a huge number; state the ceiling.

2. Nav rename. `src/components/dashboard/layout/nav-config.ts`: the item title
   "Add LI Post Metrics" → "Add Data". `resolvePageTitle` for `paths.upload`
   currently returns `{lead: "Add post", accent: "metrics"}` → make it read "Add
   data" in the same lead/accent shape. Update `nav-config.test.ts` and the page
   `metadata.title` in `src/app/(app)/upload/page.tsx`. `paths.upload` stays
   `/upload`.

3. Tabs host. ⚠️ USE THE SHADCN `<Tabs>` PRIMITIVE, mirroring
   `src/components/dashboard/settings/settings-tabs.tsx` — NOT the link-tabs in
   `client-tabs.tsx`. That file documents the rule: link-tabs are for separate
   SERVER routes with their own data fetch and search params. Both of these tabs
   are forms sharing ONE `listClientRegistry()` read on ONE route, which is
   exactly the settings case. Do NOT add routes, and do NOT add URL tab state.
   • New `src/components/dashboard/ingest/upload-tabs.tsx` ("use client"):
     TabsList with "LinkedIn Metrics" and "Outreach System"; LinkedIn content
     renders the EXISTING `<UploadForm clients={clients} />` verbatim; Outreach
     content renders the new form. LinkedIn is the default tab.
   • `page.tsx` keeps its single `listClientRegistry()` read and its ⚠️ comment
     about a failed read not being an empty roster. The existing
     `<UploadEmptyState />` still short-circuits BOTH tabs when there are no
     clients — a client is required either way, so do not duplicate it per tab.

4. Outreach upload form —
   `src/components/dashboard/ingest/outreach-upload-form.tsx` (+ test). Mirror the
   LinkedIn wizard's structure and its `Step` visual language, but SIMPLER — there
   is no JSON option, no follower/connection counts, and no format review:
     01 Select client  (same Select, same "attach to one client" framing)
     02 Drop CSV       (drag/drop + click-to-browse; the sr-only file input
                        pattern, which keeps it keyboard-focusable)
     03 Submit
   Show the expected columns as help text like the LinkedIn form does. On success
   render a result panel stating the snapshot's row count in the ResultSummary
   visual language, plus an "Upload another" reset (the key-bump remount pattern
   at the top of upload-form.tsx).

5. Server action — `src/app/(app)/upload/outreach-actions.ts` (+ test).
   `ingestOutreachAction(_prev, formData)`: Zod-validate the envelope (clientId
   non-empty, rawText non-empty), `parseOutreach(rawText)`, and on success call
   `ingestOutreach(clientId, rows)`. Return a discriminated result mirroring
   `IngestResult`'s shape: `{status:"ok", rowCount, warning?}` /
   `{status:"error", errors}`. A parse failure must return BEFORE the seam is
   called — never a partial write.

6. ⚠️ THE 25th-COLUMN WARNING (an S1 flag being paid off here). Today a column
   added to the source sheet is dropped SILENTLY: no error, no warning, no trace.
   Bryan adding a column and getting nothing back is a real failure mode.
   • Extend `parse-outreach.ts` to also report headers present in the file but not
     in the schema — e.g. add `unknownHeaders: string[]` to its success result.
     This is ADDITIVE: the 24 known headers, the required/optional split, the
     null-on-blank rule, and duplicate survival must all be unchanged, and the
     existing parser tests must still pass untouched.
   • The action attaches those as a NON-BLOCKING warning on success, exactly like
     `nameMatchWarning` — inside a guard that can never fail a successful write.
   • The result panel renders the warning, naming the ignored columns verbatim.
   • Tests: a file with a 25th column still ingests AND reports it; a file with
     exactly the 24 known headers reports NO warning (no false alarm).

ACCEPTANCE
- The sidebar reads "Add Data"; the page title reads "Add data".
- `/upload` shows two tabs; the LinkedIn tab's behaviour is byte-for-byte
  unchanged (its existing tests pass untouched).
- An Outreach CSV uploads end-to-end through `ingestOutreach` and reports the
  snapshot row count.
- `serverActions.bodySizeLimit` is set above the measured 1.42 MB, with the
  ceiling documented.
- An unknown 25th column does NOT block the upload and IS reported by name.
- No client is inferred from file content — attribution is the selected clientId.
- Test count strictly up; no existing assertion weakened; every new test RED-first
  and mutation-verified.

VERIFICATION (the whole gate — nothing else)
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output pasted.
- Mutation table (real runs): (a) revert `bodySizeLimit` to the default → cite the
  size math showing the 1.42 MB file exceeds it (a test asserting the configured
  value is acceptable); (b) drop the unknown-header reporting → the 25th-column
  test fails; (c) call the seam before parsing → the "parse failure writes
  nothing" test fails.
- NO Claude-in-Chrome / dev-server walk — assert through component markup and
  action logic only.

GUARDRAILS
- READ THE ACTUAL GIT STATE AT START and report it. Stay on
  `feat-outreach-system-dashboard`; never commit to `main`; SURFACE (never
  self-heal) any unexpected commit. LEAVE ALL WORK UNCOMMITTED.
- ⚠️ DO NOT MODIFY `upload-form.tsx`, `actions.ts`, `format-review.tsx`, or the
  LinkedIn ingest path in any way. The LinkedIn tab must render the existing
  component unchanged. If wiring seems to require touching it, STOP and FLAG.
- Do NOT change `parse-outreach.ts`'s existing behaviour — the unknown-header
  report is purely additive.
- Do NOT build the Outreach dashboard, client tab, charts, or vocab module — that
  is S3. Do NOT run `db push` or touch the hosted DB.
- If a change needs a file outside SCOPE, STOP and FLAG.

SCOPE — create/modify ONLY: `next.config.ts`;
`src/components/dashboard/layout/nav-config.ts` (+ test);
`src/app/(app)/upload/page.tsx`;
`src/components/dashboard/ingest/upload-tabs.tsx` (+ test);
`src/components/dashboard/ingest/outreach-upload-form.tsx` (+ test);
`src/app/(app)/upload/outreach-actions.ts` (+ test);
`src/lib/parse-outreach.ts` (+ test) — additive unknown-header reporting only.

REPORT BACK
- Git state at start; files changed; final `git status --porcelain`.
- The `bodySizeLimit` you set and the comment you wrote about the Vercel ceiling.
- Proof the LinkedIn tab is unchanged (its test file untouched and passing).
- How an unknown column is surfaced, and the test proving no false alarm on a
  clean 24-column file.
- Full gate output + the mutation table (real runs); test count before/after.
- FLAGS: anything you stopped short of; whether the two-tab layout reads well
  given the LinkedIn form is a 4-step wizard and the Outreach form is 3 steps;
  and whether `UploadEmptyState` gating both tabs still reads correctly.
```

## Feedback & revisions

- **2026-07-27 — v1 (authored).** Carries two planner-verified traps: the 1 MB
  `serverActions.bodySizeLimit` default vs the measured 1.42 MB export (would fail
  on the first real upload), and the shadcn-`<Tabs>`-not-link-tabs rule documented
  in `client-tabs.tsx` (an earlier spec draft asked for deep-linkable tab state,
  which would have forced the wrong primitive — spec corrected). Also pays off the
  S1 executer's 25th-column flag.
  _(Append dated entries as the executer reports back.)_
