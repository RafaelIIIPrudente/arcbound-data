# Handoff — Arcbound Services S6: the tab row becomes the services offered

**Date:** 2026-08-03
**Branch:** `feat--implement-RBAC`
**Shaping doc:** [`docs/decisions/2026-08-02-arcbound-services-registry.md`](../decisions/2026-08-02-arcbound-services-registry.md)
**Predecessors:** [S1](2026-08-02-services-s1-data-model.md) 🟢 · [S2](2026-08-02-services-s2-settings-screen.md) 🟢 · [S3](2026-08-02-services-s3-per-client-assignment.md) 🟢 · [S4](2026-08-02-services-s4-upload-reshape.md) 🟢 · [S5](2026-08-03-services-s5-client-tabs-filter.md) 🟢
**Slice:** S6 — added after S5 landed, from Bryan's screenshot of `/clients/<id>/report`.
**Status:** 🟢 LANDED — planner-verified 2026-08-03. Gate green from a clean
start on the planner's own machine (lint 0 · type:check 0 · test 0 · build 0),
**124 files / 1,826 tests**, 31.8 s. Six mutations re-applied independently, all
red, every file restored byte-identical. Uncommitted, as instructed.

## Origin

> "here I want the navbar in this page to be overview and the services offered.
> So the posts should be in the LinkedIn report sub navbar in that page."

…attached to a screenshot of `/clients/ae63bf89…/report` showing
`OVERVIEW | POSTS | LINKEDIN REPORT | OUTREACH` — all four tabs, i.e. the
fail-open path, because the SQL is still unapplied.

## Decisions this brief carries

- **D17** — the row is **Overview + one tab per held Service, labelled from the
  registry**. `Posts` is demoted to a sub-nav inside the LinkedIn section. Safe
  only because `services_one_per_handler` caps a handler at one Service.
- **D18** — `/posts` **keeps its URL**; the parent tab lights on both `/report`
  and `/posts` via an **explicit exact-match path set**, never a `startsWith`.
- **D19** — planner's calls: the fail-open fallback reuses S4's synthetic-Service
  trick from a pure map in `service-access.ts`; the sub-nav renders on both pages;
  only LinkedIn gets one; order stays fixed in code; long names truncate; the page
  headings are left alone on purpose.

## Carried defects — two, and they go FIRST

Both found during S5's planner verification. Small, urgent, and independent of the
nav work, so they are ordered before it rather than after.

1. **Internal diagnostics print into the client-facing PDF.** `(print)/layout.tsx`
   promises "nothing that would end up on paper or in a client's hands", and S5
   renders `ServicesUnreadableNotice` (red, "the check itself failed") and
   `NotAssignedGate` (containing a staff `<Link>`) inside it. **Live on every
   printed report today**, since the registry read fails.
2. **A false ⚠️ hazard.** `src/lib/service-access.ts:27–31` warns that a slug
   rename in Settings could disconnect a Client. There is no slug-rename path —
   `update_service` cannot change it. The planner's brief was wrong and the
   executer flagged it, then wrote the comment anyway.

## The prompt as issued

```
ROLE

You are a world-class TypeScript/React engineer with a particular discipline about
navigation: you treat a nav bar as a claim about where the user is and what exists,
and you know that a highlight in the wrong place, or a label that disagrees with
the page it opens, is a small lie that costs a lot of trust. You also know that
"just use startsWith" is how nav highlighting quietly breaks, and you reach for an
explicit set instead.

Working style, binding:
- READ BEFORE WRITE. Verify every fact below; if one is wrong, STOP and report it.
- ⚠️ comments in this codebase are BINDING CONSTRAINTS. Never delete or weaken one.
  If your change makes one FALSE, UPDATE it to the new truth.
- RED-first (superpowers:test-driven-development).
- DO NOT WIDEN SCOPE. If a change needs a file outside Scope, STOP and FLAG.
- Report honestly with real command output.

GOAL

The Client tab row becomes Overview plus one tab per Service that Client actually
holds, each labelled with the Service's own name from the registry. Posts stops
being a top-level tab and becomes a sub-nav item inside the LinkedIn section,
which stays highlighted while you are on it.

CONTEXT

The repo IS ArcBase: an internal, auth-gated, single-tenant Next.js app. Read
`AGENTS.md` and `CONTEXT.md` first, then
`docs/adr/0015-arcbound-services-registry.md`.

S1–S5 built the Arcbound Services registry and made the Client tabs filter on it.
This slice finishes the idea: today the row still shows Posts and LinkedIn Report
as two separate tabs for ONE Service, which is why it does not yet read as "the
services offered".

⚠️ FIRST, TWO SMALL DEFECTS THAT ARE NOT ABOUT NAVIGATION AT ALL. They are live
and client-facing, they are independent of everything else here, and they go
first so that a long slice cannot leave them undone. See Scope.

REPO FACTS YOU MUST USE (verify each):

1. `src/lib/service-access.ts` is the pure module S5 added: `canSee`,
   `servicesForHandler`, `visibleTabHandlers`, and a private
   `HANDLER_ORDER = ["linkedin_post_metrics", "outreach_prospects"]`.
2. `src/components/dashboard/client/client-tabs.tsx` is the async SERVER half; it
   calls `getClientServices(clientId)` and builds the list in `tabsFor()`, which
   today pushes BOTH Posts and LinkedIn Report under `linkedin_post_metrics`.
   `client-tabs-view.tsx` is the `"use client"` half holding `usePathname`.
3. ⚠️ **`isActive` IS AN EXACT PATHNAME MATCH, AND THAT IS A BINDING ⚠️ IN
   `client-tabs-view.tsx`.** No href may be a prefix of another. Do NOT switch to
   `startsWith` — `/clients/<id>` prefixes every client route, so Overview would
   light on all of them. D18's answer is an explicit set of exact paths per tab.
4. `getClientServices` returns `{ services, held } | null`, React-`cache()`d.
   `held` carries the full `ArcboundService` rows — **so the names D17 needs are
   already in hand; this slice adds no read.**
5. ⚠️ **`services_one_per_handler`** is a partial unique index
   (`on public.services (handler) where handler is not null`) in
   `supabase/arcbound-services.sql`. At most ONE Service per handler. **D17 is
   safe only because of it** — verify it is really there before relying on it.
6. A **NULL-handler Service is not a tab** (D2/D6) — it is a real listed offering
   with nowhere to go, and it stays on the Overview's Services card.
7. `paths.clients` has `details` / `posts` / `report` / `outreach` /
   `reportPrint`. **`paths.clients.posts` KEEPS ITS VALUE** — no route move (D18).
   Only `client-tabs.tsx` links to it internally today.
8. S4 already solves "label a pipeline with no registry row" in
   `upload-tabs.tsx` as `ALL_PIPELINE_SERVICES`, synthesised from `FORMS` +
   `HANDLER_ORDER`. ⚠️ **DO NOT IMPORT IT** — that module is a `"use client"`
   ingest component and would drag the whole upload form tree into the client
   page. Write the small label map in `service-access.ts` instead and FLAG the
   near-duplication rather than refactoring `upload-tabs.tsx` in this slice.
9. `src/app/(print)/layout.tsx` states its contract in a ⚠️: "no sidebar, no top
   bar, no theme toggle — nothing that would end up on paper or in a client's
   hands."

SCOPE — PART A: the two carried defects. DO THESE FIRST.

MODIFY — `src/app/(print)/clients/[id]/report/print/page.tsx` + its test.

  ⚠️ **A RED INTERNAL DIAGNOSTIC IS CURRENTLY PRINTED INTO THE DOCUMENT STAFF HAND
  TO A CLIENT, ON EVERY REPORT.** The page renders `ServicesUnreadableNotice`
  ("…the check itself failed. Try again shortly") inside the `(print)` shell, and
  its test asserts that it does. With the SQL unapplied the registry read fails on
  every request, so this is not an edge case — it is every printed report today.
  `NotAssignedGate` is the same problem in smaller form: it carries a `<Link>` to
  `/clients/<id>`, a staff route, into the print group.

  KEEP the gate — an unassigned Service must still not produce a client-facing
  PDF, and that test is mutation-proved. What must not reach paper is the
  diagnostic. Decide between suppressing it in print and refusing to render, say
  which you chose and why, and UPDATE the test that currently asserts the banner
  appears — it is asserting the defect.

MODIFY — `src/lib/service-access.ts`: correct the ⚠️ at lines 27–31.
  It claims `slug` is admin-editable and that a rename in Settings could
  disconnect a Client from a section. **That path does not exist.**
  `update_service(uuid, text, text, int)` takes id, name, description, sort_order;
  no function in the SQL mutates `slug`. Gating on `handler` is still right —
  it is the enum the code maps to a pipeline, and a display key is the wrong thing
  to branch on even where it is immutable. Say that instead. Do not delete the ⚠️.

SCOPE — PART B: the navigation.

MODIFY — `src/lib/service-access.ts` + test: replace `visibleTabHandlers` with
  something returning the SERVICES to show, in `HANDLER_ORDER`, plus the fallback
  label map (fact 8).

  ⚠️ `null` STILL MEANS EVERY TAB (D14), AND NOW IT ALSO MEANS THERE ARE NO NAMES.
  Return the synthetic fallback Services. This is not a second labelling policy —
  it is the same one degrading, and D14's on-page banner already discloses it.
  ⚠️ ORDER COMES FROM `HANDLER_ORDER`, NEVER FROM `sortOrder`. A re-sort in
  Settings must not be able to reorder a Client's navigation.

MODIFY — `client-tabs.tsx` + test: `tabsFor` builds Overview plus one tab per held
  Service, `label = service.name`, href = the Service's section route. Posts is no
  longer in this list.

MODIFY — `client-tabs-view.tsx` + test: a tab is active when the current pathname
  is in ITS OWN set of paths.

  ⚠️ AN EXPLICIT EXACT-MATCH SET PER TAB. NOT `startsWith`, NOT a prefix, NOT a
  regex on the segment. LinkedIn owns `{ …/report, …/posts }`; Outreach owns
  `{ …/outreach }`; Overview owns `{ …/<id> }`. The existing ⚠️ about exact
  matching stays true — UPDATE it to say the unit is now a set rather than a
  single href, and keep its reasoning about why prefixes are forbidden.
  ⚠️ EXACTLY ONE TAB MAY BE CURRENT ON ANY ROUTE. Assert the count, not just the
  identity — that is what catches a set that accidentally overlaps another.

CREATE — `src/components/dashboard/client/section-tabs.tsx` + test: the sub-nav.
  Same link-tab look as `ClientTabsView`, one level down. Build it general
  (a list of `{href,label}` + the current pathname); apply it only to LinkedIn.

MODIFY — `report/page.tsx` and `posts/page.tsx` + tests: render the sub-nav under
  `<ClientTabs>` on BOTH.

  ⚠️ BOTH PAGES, OR POSTS IS A DEAD END. Rendering it only on `/report` would
  leave someone on Posts with no way back into the section they are inside.

DO NOT TOUCH: `paths.clients.posts`'s value (D18 — no route move), ANY SQL,
`src/middleware.ts`, `src/lib/auth/*`, `/settings/services`, `/upload`,
`src/components/report-link/*`, `/r/[token]`, the `bi.*` views, or what any report
section COMPUTES. The Overview's `ClientServicesCard` also stays as it is — it is
the one place the full list including no-pipeline Services appears.

⚠️ LEAVE THE PAGE HEADINGS ALONE. After this slice the tab will read "LinkedIn
Growth" while the page eyebrow reads "LinkedIn report". That is not an
inconsistency to fix: the tab names the ENGAGEMENT, the eyebrow names the
DOCUMENT. Both are true and they are different nouns.

APPROACH

1. Report real git state. HEAD is `c3f29f4`, the USER'S OWN commit — not yours.
   S5 is uncommitted and also not yours. Surface, never rewrite, any commit you
   did not make.
2. Capture the `pnpm test` baseline first (S5 finished at 123 files / 1,813).
3. Part A first — both defects are small and neither depends on Part B.
4. Then: pure module → `client-tabs` → the view's active rule → sub-nav → the two
   pages.
5. Mutation-verify and report what went red:
   • Label the tabs from a hard-coded string instead of `service.name` — a test
     must fail.
   • Swap the active-path set for `pathname.startsWith(...)` — a test must fail,
     and it should be the "exactly one tab is current" assertion.
   • Render the sub-nav on `/report` only — a test must fail.
   • Return `[]` instead of the fallback Services when `held` is null — a test
     must fail.
   • Put a NULL-handler Service in the tab row — a test must fail.
   • Restore the print diagnostic — a test must fail.

ACCEPTANCE CRITERIA

- A Client holding both Services sees `Overview · <LinkedIn Service name> ·
  <Outreach Service name>` — three tabs, not four, with the names coming from the
  registry.
- Renaming a Service in Settings → Services changes the tab label.
- Posts is reachable from a sub-nav on the LinkedIn section, on BOTH its pages.
- On `/posts` the LinkedIn tab is highlighted, and exactly one tab is.
- `/clients/<id>/posts` still resolves at its current URL.
- A no-pipeline Service produces no tab and still appears on Overview.
- An unreadable registry still shows every section, now with code-side labels and
  the existing banner.
- The print export is still gated, and no longer prints an internal diagnostic or
  a staff link.
- `service-access.ts`'s ⚠️ no longer asserts a slug-rename hazard that cannot occur.
- Gate green; test count strictly up; no existing assertion weakened or deleted.

VERIFICATION

Run and paste real output:

    pnpm lint && pnpm type:check && pnpm test && pnpm build

Verification is the automated gate plus unit/component tests ONLY. DO NOT use
Claude-in-Chrome, a dev server, or any live-browser runtime walk.

⚠️ The suite is near its `testTimeout: 15_000` ceiling — S5 took it from ~35s to
~73s, and three calendar-related files have timed out under load. If you see a
timeout in a file you did not touch, re-run it alone before reporting it as a
failure, and SAY SO either way.

⚠️ Report whether `supabase/arcbound-services.sql` has been applied. If it has
not, say plainly that every Client renders the fallback labels and the banner, so
the registry-named tabs this slice builds are unobservable until it is.

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
4. Full gate output, including any timeout you re-ran.
5. The active-path rule, verbatim — it is the piece most likely to be quietly
   wrong.
6. What you did about the print diagnostic, and why you chose it over the
   alternative.
7. The corrected `service-access.ts` ⚠️, verbatim.
8. What the six mutation checks broke, and that you restored them.
9. FLAGS: anything in this brief wrong about the repo, anything you decided that
   it did not settle, and the SQL apply status.
```

---

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2026-08-03 | Emitted. Not yet run. Carries D17 and D18 (asked and answered from Bryan's screenshot), D19 (planner's calls), and the two defects found during S5's verification — ordered FIRST because both are live today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2   | 2026-08-03 | **Run and reported.** 15 files modified / 4 new; 123 files / 1,813 tests → **124 / 1,826**; gate exit 0 with no timeouts. Both carried defects fixed; the navigation reshaped as briefed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3   | 2026-08-03 | **The brief's HEAD was STALE and the executer was right.** It said `c3f29f4`; the real HEAD is `d91c9c6` "feat: implement client service access management and UI updates" — Bryan committed all of S5 between the two handoffs. Verified as **Bryan's own commit** (RafaelIIIPrudente <rflprdnt@gmail.com>, Aug 3 12:07), not a rogue agent commit. Surfaced, not rewritten — correct handling for the third slice running.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4   | 2026-08-03 | **Planner re-ran the full gate from a clean start: lint 0 · type:check 0 · test 0 · build 0, 124 files / 1,826 tests in 31.8 s.** Every count the executer reported is exact. The three calendar files that timed out under S5 did not time out here — confirming that flake is load-dependent, not a real regression.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 5   | 2026-08-03 | **Six mutations re-applied independently. All red; the executer UNDERSTATED two of them, as every executer on this workstream has.** `startsWith` → **6** red (reported as ~1: the exactly-one-current assertion); hard-coded label → **9** red (reported 8); sub-nav off `/posts` → 2; `visibleTabServices(null) → []` → **10 across 2 files**; NULL-handler unfiltered → **12+**; the print banner → 1. Understating, never overstating, is now a five-slice pattern.                                                                                                                                                                                                                                                                                                                                                                              |
| 6   | 2026-08-03 | **The executer's print mutation was WEAK and the planner redid it properly.** Re-adding `ServicesUnreadableNotice` without its import produced a `ReferenceError` — which proves only that a symbol is missing, not that any test asserts the banner is absent. Re-run **with** the import: genuinely red on the assertion (`expected <p role="alert"…> to be null`). The guard is real. `queryByRole("link")` likewise guards the staff-link leak. Verified, not assumed.                                                                                                                                                                                                                                                                                                                                                                           |
| 7   | 2026-08-03 | **PLANNER'S OWN DESTRUCTIVE ERROR, and the recovery.** To restore each mutation the planner ran `git checkout -- <file>` — which reverts to **HEAD**, and S6 is UNCOMMITTED. That wiped the slice's source changes in five files (`service-access.ts`, `client-tabs.tsx`, `client-tabs-view.tsx`, `posts/page.tsx`, `print/page.tsx`); the test files survived. Fully recovered from verbatim reads captured earlier in the same session, then proved: diffstat matches the original **exactly** (15 files / 519 insertions / 146 deletions, every per-file count identical), `posts/page.tsx` restored to the same git blob hash `058cb39`, and the re-run gate is green at the same 124 / 1,826. **Rule for every future slice: mutation-test uncommitted work by copying the file aside (`cp f f.bak` → `mv f.bak f`), NEVER `git checkout --`.** |
| 8   | 2026-08-03 | **A THIRD defect was fixed in this working tree, outside S6's scope, and correctly disclosed.** `actions.ts` exported `HANDLER_LABELS` — a plain object — from a `"use server"` file, which Next.js forbids at runtime (`A "use server" file can only export async functions, found object`). Moved to a new `handler-labels.ts`. This is an **S2 defect that broke `/settings/services` at runtime**. ⚠️ The gate never caught it: lint, type:check, test AND `next build` were all green across S1–S5 with the violating export in place. It surfaced only when a human loaded the page. Out of S6's scope, right to fix, right to flag.                                                                                                                                                                                                           |
| 9   | 2026-08-03 | Planner FLAG (cosmetic, not a defect): there are now **two constants named `HANDLER_LABELS` with different values** — the admin picker's (`"LinkedIn post metrics"`, exported from `handler-labels.ts`) and the tab-row fallback's (`"LinkedIn Metrics"`, private to `service-access.ts`). Different jobs, and one is unexported, so nothing can confuse them at a call site — but the shared name will read as a duplicate to the next person. Worth renaming the private one (e.g. `FALLBACK_TAB_LABELS`) in a later slice.                                                                                                                                                                                                                                                                                                                        |
| 10  | 2026-08-03 | Planner FLAG: `tabsFor` uses a non-null assertion — `routes[service.handler!]`. Sound today (`visibleTabServices` filters NULL handlers out, and a test asserts it), but the assertion is what makes the compiler agree, so the guarantee lives in a `!` rather than in a type. A `visibleTabServices` returning `Array<ArcboundService & { handler: ServiceHandler }>` would carry it in the signature. Not worth reopening the slice for.                                                                                                                                                                                                                                                                                                                                                                                                          |
| 11  | 2026-08-03 | Executer's undecided-by-the-brief call, **endorsed**: the fallback labels are `"LinkedIn Metrics"` / `"Outreach System"` — verified verbatim identical to `FORMS[handler].label` in `upload-tabs.tsx`, so an outage shows one vocabulary in the upload picker and the tab row. Deliberately NOT the registry's seeded names ("LinkedIn Growth"), so a code-side fallback cannot masquerade as a live registry value. Correct reasoning.                                                                                                                                                                                                                                                                                                                                                                                                              |
| 12  | 2026-08-03 | ⚠️ **STILL THE ONE THING BLOCKING ALL SIX SLICES: `supabase/arcbound-services.sql` HAS NEVER BEEN APPLIED.** Bryan's own screenshot is the proof — four tabs, i.e. the fail-open path. Until a human pastes it into the Supabase SQL editor, every Client renders `Overview · LinkedIn Metrics · Outreach System` (the code-side fallback) plus the unreadable banner, and the registry-named tabs this slice exists to show cannot appear.                                                                                                                                                                                                                                                                                                                                                                                                          |
