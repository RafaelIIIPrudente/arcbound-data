# Handoff — Arcbound Services S5: Client tabs filter, and the honest not-assigned state

**Date:** 2026-08-03
**Branch:** `feat--implement-RBAC`
**Shaping doc:** [`docs/decisions/2026-08-02-arcbound-services-registry.md`](../decisions/2026-08-02-arcbound-services-registry.md)
**Predecessors:** [S1](2026-08-02-services-s1-data-model.md) 🟢 · [S2](2026-08-02-services-s2-settings-screen.md) 🟢 · [S3](2026-08-02-services-s3-per-client-assignment.md) 🟢 · [S4](2026-08-02-services-s4-upload-reshape.md) 🟢
**Slice:** S5 of five — the last. It closes an honesty bug that is **live in production today**.
**Status:** 🟡 emitted, not yet run.

## Decisions this brief carries

- **D6** — Overview always; Posts + LinkedIn Report only with a
  `linkedin_post_metrics` Service; Outreach only with `outreach_prospects`. A
  no-pipeline Service is listed on Overview rather than claiming a tab.
- **D13** — **the registry is absolute.** Un-assigning a Service hides its tab
  even when the Client has data for it, and the direct URL says _not assigned_
  rather than rendering the rows. The cost — real data unreachable through the UI
  — was raised, accepted, and is reversible.
- **D14** — a failed Services read shows **every** tab, and repeats the notice
  **above the data on each tab's own page**, not only under the tab row.
- **D15** — `/r/[token]` is NOT gated. Structural: it reads through a definer RPC
  as an unauthenticated viewer, and `client_services` SELECT is
  authenticated-only. The gate would need new SQL. Recorded as the follow-up.
- **D16** — planner's calls: gate on `handler` never `slug`; split `ClientTabs`
  into a server wrapper + the existing client component; one React-`cache()`d
  helper serves both the tabs and the pages; the print export is gated too; the
  Overview card keeps its "Services" title.

## Facts that shaped the brief

- **`ClientTabs` is rendered by FOUR route pages, not a layout.** There is no
  `layout.tsx` under `clients/[id]/`. Each page renders
  `<ClientTabs clientId={client.id} />` itself: `page.tsx:213`,
  `posts/page.tsx:72`, `report/page.tsx:117`, `outreach/page.tsx:100`.
- **`getClient` is React-`cache()`d** (`clients.ts:246`), so the same read from a
  wrapper and its page costs one round trip. That is the precedent the new helper
  follows.
- **`clients/[id]/page.tsx` already has a local `loadServices()`** doing exactly
  the `Promise.all` + catch-to-`null` the new helper needs. It is replaced, not
  duplicated.
- **S2 lets an admin edit a Service's slug.** The handler is a database enum.
  Gating on slug would let a rename silently strip a Client of a tab.
- **The print export lives at
  `src/app/(print)/clients/[id]/report/print/page.tsx`** — a separate route group
  that does NOT render `ClientTabs`, so it needs its own gate.

## Carried defects — three, and they are IN this slice

Ordered last on purpose, and separable if the slice runs long.

1. **S4's untested wiring.** `ingest-panel.tsx:174–198` — the connected
   `IngestPanel` is never mounted by a test. Replacing
   `onClientChange={setClientId}` with `onClientChange={() => {}}` leaves all 97
   ingest + upload tests green while `/upload` becomes permanently stuck on
   "Select a client…". Found by the planner, mutation-proved.
2. **S3's duplicate-submit.** `add-client-dialog.tsx` — on
   `created_without_services` / `created_services_failed` the dialog correctly
   stays open, but the submit button stays live (`disabled={pending}` only). A
   second click creates a SECOND Client; `clients` has no unique constraint.
3. **S3's orphaned comment.** `clients/[id]/page.tsx:218–222` — the ReportLinkCard
   comment now sits above `ClientServicesCard`.

## The prompt as issued

```
ROLE

You are a world-class TypeScript/React engineer with one governing instinct: you
never let a screen imply a measurement it did not make. "We do not do this for
them" and "we did this and found nothing" render identically as an empty panel,
and you treat collapsing those two into one view as a correctness bug rather than
a polish issue — because someone reads that panel and tells a client a number.

Working style, binding:
- READ BEFORE WRITE. Verify every fact below; if one is wrong, STOP and report it.
- ⚠️ comments in this codebase are BINDING CONSTRAINTS. Never delete or weaken one.
  If your change makes one FALSE, UPDATE it to the new truth.
- RED-first (superpowers:test-driven-development).
- DO NOT WIDEN SCOPE. If a change needs a file outside Scope, STOP and FLAG.
- Report honestly with real command output.

GOAL

A Client's tabs are exactly the Services they are assigned. Posts and LinkedIn
Report require a `linkedin_post_metrics` Service; Outreach requires
`outreach_prospects`; Overview is always there. The routes still resolve — they
state the truth instead of rendering data.

CONTEXT

The repo IS ArcBase: an internal, auth-gated, single-tenant Next.js app. Read
`AGENTS.md` and `CONTEXT.md` first, then
`docs/adr/0015-arcbound-services-registry.md`.

S1 built the tables and the seam, S2 the registry screen, S3 per-Client
assignment, S4 made `/upload` Client-first. This is the last slice, and unlike the
others it CLOSES A BUG THAT IS LIVE RIGHT NOW:

⚠️ `client-tabs.tsx` renders all four tabs unconditionally today. A Client Arcbound
has never run outreach for still gets an Outreach tab, which loads an EMPTY
FUNNEL — reading as "we ran outreach and got nothing" rather than "we do not do
outreach for them". That is the absent-vs-zero collapse this repo refuses
everywhere else, currently in production. Every design choice below exists to
avoid replacing it with a subtler version of itself.

REPO FACTS YOU MUST USE (verify each):

1. `src/components/dashboard/client/client-tabs.tsx` is `"use client"` because of
   `usePathname`, and is rendered by FOUR route pages — NOT a layout. There is no
   `layout.tsx` under `clients/[id]/`. Call sites: `clients/[id]/page.tsx:213`,
   `posts/page.tsx:72`, `report/page.tsx:117`, `outreach/page.tsx:100`, each
   `<ClientTabs clientId={client.id} />`.
2. Read its ⚠️ block on why these are real links and not the shadcn `<Tabs>`
   primitive, and the note that `isActive` is an EXACT pathname match so no href
   may be a prefix of another. Both still hold — preserve them.
3. `getClient` (`src/services/clients.ts:246`) is wrapped in React `cache()`, with
   a ⚠️ explaining it must never become `unstable_cache` (it is cookie-bound and
   RLS-enforced). That is the precedent your new helper follows, and the same ⚠️
   applies to it.
4. `clients/[id]/page.tsx` already contains a local `async function loadServices`
   doing `Promise.all([listServices(), listClientServices(clientId)])` with
   `catch { return null }`. Your new helper REPLACES it. Do not leave two.
5. Seam: `listServices()` returns EVERY Service unfiltered; `listClientServices`
   returns `ClientServiceAssignment[]` (`.serviceId`);
   `ServiceHandler = "linkedin_post_metrics" | "outreach_prospects"`
   (`src/services/types.ts:81`).
6. ⚠️ **S2 LETS AN ADMIN EDIT A SERVICE'S SLUG. THE HANDLER IS A DATABASE ENUM.**
   Gate on `handler`. Matching `slug === "outreach-system"` would let a rename in
   Settings silently strip a Client of their Outreach tab, with nothing on screen
   connecting cause to effect.
7. The print export is `src/app/(print)/clients/[id]/report/print/page.tsx`, a
   separate route group that does NOT render `ClientTabs`.
8. `paths.clients` has `details` / `posts` / `report` / `outreach` /
   `reportPrint`. Read the ⚠️ on `outreach`: it shows third-party personal data
   and is staff-only. Nothing you add may leak it toward `/r/[token]`.
9. `/r/[token]` is NOT in scope and CANNOT be gated here — it reads through a
   SECURITY DEFINER RPC as an unauthenticated viewer, and `client_services`
   SELECT is `client_services_select_authenticated`. See DO NOT TOUCH.

SCOPE

MODIFY — `src/services/arcbound-services.ts` + test: add
  `getClientServices(clientId)`, wrapped in React `cache()`, returning
  `{ held: ArcboundService[] } | null`. Internally the `Promise.all` +
  catch-to-`null` that `loadServices` does today.

  ⚠️ `null` MEANS "COULD NOT BE READ" AND `{ held: [] }` MEANS "ASSIGNED NOTHING".
  Never collapse them. Every branch below turns on the difference, and after this
  slice the wrong one hides a working tab.

  ⚠️ CARRY OVER `getClient`'s ⚠️ ON `cache()`: request-scoped only, NEVER
  `unstable_cache`. The read is cookie-bound and RLS-enforced; persisting it
  between requests would move that boundary out of the database.

CREATE — `src/lib/service-access.ts` + test: the pure mapping from a Client's held
  Services to what they may see. Something like
  `canSee(held: ArcboundService[] | null, handler: ServiceHandler): boolean`, plus
  whatever the tab list needs. PURE — no React, no Supabase, no `paths`.

  ⚠️ A `null` HELD SET ANSWERS `true` TO EVERYTHING (D14). Unknown is not denial.
  Put that in the function, not in four call sites, and test it directly.

MODIFY — `client-tabs.tsx` + test: split into an async SERVER `ClientTabs` that
  calls `getClientServices` and computes the tab list, and a `"use client"`
  `ClientTabsView` holding today's `usePathname` rendering with the tabs as a
  prop. The four call sites stay `<ClientTabs clientId={…} />` — do not touch them
  for this.

  ⚠️ MOUNT THE CONNECTED COMPONENT IN A TEST, NOT ONLY THE VIEW. S4 tested its
  view exhaustively and left the wiring unmounted; unhooking its picker left the
  whole suite green while the page became unusable. Do not repeat that here: at
  least one test must exercise `ClientTabs` itself, with `getClientServices`
  mocked, and assert the rendered hrefs.

MODIFY — `posts/page.tsx`, `report/page.tsx`, `outreach/page.tsx` + tests: gate
  each on its handler.

  ⚠️ **THE COPY SAYS "NOT ASSIGNED", NEVER "NO DATA" (D13).** A Client can hold
  rows for a Service they are not assigned — an admin un-assigns Outreach from
  someone with three snapshots, or the S1 backfill missed them. Those rows are
  WITHHELD, not absent, and the count is not zero. Saying "no outreach data" would
  be the same absent-vs-zero collapse this slice exists to kill, wearing the
  opposite mask. Say they are not signed up, and that an admin can assign it on
  THIS CLIENT'S OVERVIEW — not Settings → Services, which is the registry.

  ⚠️ RENDER THE STATE, DO NOT `notFound()` AND DO NOT `redirect()`. This is not a
  security boundary; staff may legitimately look. A 404 would also be a lie: the
  Client exists.

CREATE — `src/components/dashboard/client/service-gate.tsx` + test: the two shared
  states — "not assigned to this Service" and "services could not be read".

  ⚠️ **THE UNREADABLE NOTICE GOES ON EVERY TAB'S OWN PAGE, NOT JUST THE TAB ROW
  (D14).** A notice under the tab row is absent the moment someone lands directly
  on `/clients/<id>/outreach`, which re-creates the exact production bug above for
  the duration of every read failure. It must name the ambiguity in words: an
  empty result below may mean Arcbound does not run this for them, NOT that it ran
  and found nothing.

  ⚠️ THIS IS THE LIVE PATH TODAY. `supabase/arcbound-services.sql` is not applied,
  so the read fails on every request and this notice is what staff actually see on
  every Client the day this ships. Write it as the main case, not the edge.

MODIFY — `src/app/(print)/clients/[id]/report/print/page.tsx` + test: same gate as
  the on-screen report. It is how the report reaches a client on paper; leaving it
  open would produce a client-facing PDF for a Service the Client is not assigned.

MODIFY — `clients/[id]/page.tsx` + test: replace the local `loadServices` with the
  cached helper (fact 4), and FIX THE ORPHANED COMMENT at lines 218–222 — the
  ReportLinkCard block now sits above `ClientServicesCard`. Keep the card titled
  "Services".

THEN, AND ONLY THEN — three carried defects. They are unrelated to the tab
filtering and are placed last deliberately.

  ⚠️ IF THE SLICE IS RUNNING LONG, LAND THE TAB FILTERING COMPLETE AND REPORT
  THESE AS UNDONE. A finished feature plus an honest list beats two half-things.

  a) `ingest-panel.test.tsx` — mount the CONNECTED `IngestPanel` (not the View),
     select a Client, assert the tabs change. Prove it by mutation: replacing
     `onClientChange={setClientId}` with `onClientChange={() => {}}` must go red.
  b) `add-client-dialog.tsx` + test — on `created_without_services` and
     `created_services_failed` the dialog stays open (correct) but the submit stays
     live, so a second click creates a SECOND Client. `clients` has no unique
     constraint, so nothing downstream catches it. Keep the message visible; stop
     the resubmit.
  c) (done above, in `clients/[id]/page.tsx`.)

DO NOT TOUCH: ANY SQL (S1's twins are final — if you believe a function is wrong,
STOP AND FLAG), `src/middleware.ts`, `src/lib/auth/*`, `/settings/services`,
`/upload`'s panel or forms beyond defect (a), `src/components/report-link/*`, the
`/r/[token]` route, the `bi.*` views, or the report/outreach analytics themselves.
You are gating access to sections, not changing what any section computes.

APPROACH

1. Report real git state. HEAD is `6ca2d32`, which is the USER'S OWN COMMIT of
   S1–S3 — not yours. S4 is uncommitted and also not yours. Surface, never
   rewrite, any commit you did not make.
2. Capture the `pnpm test` baseline first (S4 finished at 117 files / 1,754).
3. Pure mapping → cached helper → tabs split → the three pages → print → overview
   cleanup → carried defects. The pure module first means the four-way branching
   is settled and tested before any component depends on it.
4. Mutation-verify and report what went red:
   • Make a `null` held set deny instead of allow — a test must fail.
   • Gate on `slug` instead of `handler` — a test must fail.
   • Drop the unreadable notice from a tab's own page, keeping it on the tab row —
     a test must fail.
   • Render the Outreach data anyway when the Service is not assigned — a test
     must fail.
   • Leave the print export ungated — a test must fail.
   • Unhook `IngestPanel`'s `onClientChange` — a test must fail. (defect a)

ACCEPTANCE CRITERIA

- A Client with only `linkedin_post_metrics` sees Overview, Posts, LinkedIn
  Report — and no Outreach tab.
- A Client with only `outreach_prospects` sees Overview and Outreach.
- A no-pipeline Service claims no tab and is listed on Overview.
- A direct URL to an unassigned section resolves and states that the Client is not
  assigned it, pointing at the Client's Overview — never "no data", never a 404,
  never the data.
- A failed Services read shows ALL tabs, and every tab's own page carries the
  notice naming the ambiguity.
- The print export is gated exactly as the on-screen report is.
- Tabs and pages agree, because both read the same cached helper.
- The connected `ClientTabs` is mounted by a test, not only its view.
- Gate green; test count strictly up; no existing assertion weakened or deleted.
- Any carried defect not done is reported as undone, not quietly dropped.

VERIFICATION

Run and paste real output:

    pnpm lint && pnpm type:check && pnpm test && pnpm build

Verification is the automated gate plus unit/component tests ONLY. DO NOT use
Claude-in-Chrome, a dev server, or any live-browser runtime walk.

⚠️ Report whether `supabase/arcbound-services.sql` has been applied. If it has
not, say plainly that every Client on the live app renders the all-tabs +
notice path, and that the filtering this slice builds is unobservable until a
human pastes that SQL into the Supabase SQL editor.

GUARDRAILS

- DO NOT APPLY OR EDIT SQL. No `db push`, no CLI, no database connection.
- LEAVE ALL WORK UNCOMMITTED. No commit, push, branch, tag, or PR. Never commit to
  `main`.
- DO NOT run `graphify update`.
- If you cannot satisfy an acceptance criterion, DO NOT silently drop it. Finish
  everything else and report exactly what is undone and why.

REPORT BACK

1. Git state at start and end.
2. `git diff --stat` plus new files.
3. Baseline and final test counts.
4. Full gate output.
5. The pure `service-access` module, verbatim — it is where the four states live
   or die.
6. The not-assigned copy for all three sections, verbatim, so it can be checked
   that none of it claims there is no data.
7. The test that mounts the CONNECTED `ClientTabs`, verbatim.
8. What the six mutation checks broke, and that you restored them.
9. Which carried defects you landed and which you did not.
10. FLAGS: anything in this brief wrong about the repo, anything you decided that
    it did not settle, and the SQL apply status.
```

---

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                   |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 2026-08-03 | Emitted. Not yet run by an executer. Carries D13 and D14 (asked and answered this session), D15 and D16 (planner's calls), and the three defects carried from S3 and S4. |
