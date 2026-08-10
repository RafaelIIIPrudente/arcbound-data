# Handoff — Arcbound Services S4: `/upload` becomes Client-first

**Date:** 2026-08-02
**Branch:** `feat--implement-RBAC`
**Shaping doc:** [`docs/decisions/2026-08-02-arcbound-services-registry.md`](../decisions/2026-08-02-arcbound-services-registry.md)
**Predecessors:** [S1 — data model](2026-08-02-services-s1-data-model.md) 🟢 · [S2 — settings screen](2026-08-02-services-s2-settings-screen.md) 🟢 · [S3 — per-Client assignment](2026-08-02-services-s3-per-client-assignment.md) 🟢
**Slice:** S4 of five. **The largest** — it reshapes 527 LOC of existing forms and 307 LOC of their tests.
**Status:** 🟢 **LANDED — planner-verified 2026-08-03** (117 files / 1,754 tests, gate exit 0, four
mutations re-applied by the planner and all four went red). **One coverage gap found by the planner
and carried to S5** — see the revision log, row 12.

## Decisions this brief carries

- **D10** — a Client with no Services gets no tabs and assigns them **inline** on
  `/upload`. Chosen after the S1 backfill trap surfaced: the backfill only covers
  Clients that already have upload rows, so every Client registered before S3 and
  never uploaded to has no upload path at all.
- **D11** — an **archived** Service a Client still holds **keeps** its tab,
  labelled archived. The engagement is live until someone un-assigns it.
- **D12** — planner's calls: unreadable registry → render both tabs; the page owns
  the Client selection as Step 01 and the forms renumber to 02+; a form reset
  keeps the selected Client.

## Facts that changed the design, found while shaping

1. **`/upload` is NOT admin-gated.** No `requireAdmin`, `isAdmin` or `getRole`
   anywhere under `src/app/(app)/upload/`. An analyst can reach it. If the inline
   assign panel were offered to them, S3's `setClientServicesAction` would call
   `requireAdmin()` → `redirect()` and throw them out of the upload page in the
   middle of the routine. This is the slice's defining test.
2. **S3's action revalidates the wrong path for this reuse.**
   `services-actions.ts:58` revalidates `paths.clients.details(clientId)` only, so
   assigning from `/upload` leaves the tabs absent until a hard reload.
3. **Each form owns its own client `<Select>` as Step 01** and holds `clientId` in
   local `useState` (`upload-form.tsx:43,58,94`; `outreach-upload-form.tsx:55,63,83`).
   D3's Client-first ordering forces that state to lift.
4. **`client_services` reads are open to all authenticated staff**
   (`client_services_select_authenticated`); only the writes are admin-guarded.
   So an analyst can legitimately SEE the assignment, and must.

## Carried defects — recorded, NOT part of this slice

Found during S3 verification, deliberately left for S5 so this diff stays readable:

- `add-client-dialog.tsx` — after `created_without_services` /
  `created_services_failed` the dialog correctly stays open, but the submit button
  stays live, so a second click creates a duplicate Client (`clients` has no unique
  constraint, ADR 0009).
- `clients/[id]/page.tsx:218-222` — the ReportLinkCard's comment is now orphaned
  above `ClientServicesCard`.

---

## The prompt as issued

```
ROLE

You are a world-class TypeScript/React engineer with a specific instinct: before
you make a capability conditional, you enumerate every reader who arrives when the
condition is false, and you make sure each of them is told something true. You have
seen too many features where "hide it unless X" quietly became "this user can never
do their job again, and nothing on screen says why."

Working style, binding:
- READ BEFORE WRITE. Verify every fact below; if one is wrong, STOP and report it.
- ⚠️ comments in this codebase are BINDING CONSTRAINTS. Never delete or weaken one.
  If your change makes one FALSE, UPDATE it to the new truth.
- RED-first (superpowers:test-driven-development).
- DO NOT WIDEN SCOPE. If a change needs a file outside Scope, STOP and FLAG.
- Report honestly with real command output.

GOAL

Make /upload Client-first: staff pick the Client, and the upload tabs they then see
are exactly the ones that Client's assigned Arcbound Services provide. A Client with
none gets no tabs and a way to fix that in place. Nothing about the Client detail
tabs changes; that is S5.

CONTEXT

The repo IS ArcBase: an internal, auth-gated, single-tenant Next.js app. Read
`AGENTS.md` and `CONTEXT.md` first, then
`docs/adr/0015-arcbound-services-registry.md`.

S1 built `public.services` / `public.client_services` and the seam
`src/services/arcbound-services.ts`. S2 built `/settings/services`. S3 put the
assignment on the Client — at registration and on the Overview. This slice is where
the registry finally CHANGES WHAT STAFF CAN DO, which is why it is the one that can
break the weekly routine.

REPO FACTS YOU MUST USE (verify each):

1. ⚠️ **`/upload` IS NOT ADMIN-GATED.** There is no `requireAdmin`, `isAdmin` or
   `getRole` anywhere under `src/app/(app)/upload/`. A Data Analyst can reach this
   page and upload. Read `src/lib/auth/roles.ts` for `getRole()` / `isAdmin()`.
2. ⚠️ **`requireAdmin()` DENIES BY THROWING** (it calls `redirect()`).
   `setClientServicesAction` in `src/app/(app)/clients/[id]/services-actions.ts`
   calls it first thing. Offering that action's form to an analyst would eject them
   from the upload page mid-routine. See Scope — this is the slice's main hazard.
3. `src/app/(app)/upload/page.tsx` reads `listClientRegistry()` (cheap `{id,name}[]`),
   THROWS when it returns null, and renders `UploadEmptyState` at zero clients else
   `UploadTabs`. Read its ⚠️ block on why a failed read is not an empty roster — the
   same distinction governs everything you add.
4. `src/components/dashboard/ingest/upload-tabs.tsx` (40 lines) hard-codes two
   shadcn `<Tabs>`, LinkedIn default. Its ⚠️ block explains why these are the shadcn
   Tabs primitive and not the link-tabs in `client-tabs.tsx`. That reasoning still
   holds — do not convert them to routes.
5. ⚠️ **BOTH FORMS OWN THEIR OWN CLIENT `<Select>` AS STEP 01**, hold `clientId` in
   `React.useState`, and inject it with `formData.set("clientId", clientId)` on
   submit: `upload-form.tsx:43,58,94-107` and `outreach-upload-form.tsx:55,63,83-98`.
   Both take `clients: ClientOption[]`, and both remount on reset via `key={attempt}`.
6. `ServiceHandler = "linkedin_post_metrics" | "outreach_prospects"`
   (`src/services/types.ts:81`). The handler → form mapping is the CODE side of
   "visibility is data, capability is code" — a handler with no form must be
   impossible to reach, not merely unlikely.
7. Seam functions: `listServices()` (ALL services, active and archived, unfiltered),
   `listClientServices(clientId)` → `ClientServiceAssignment[]` (`.serviceId`),
   `setClientServices(clientId, ids)`. Verify the signatures yourself.
8. ⚠️ `client_services` SELECT is granted to every authenticated staff member
   (policy `client_services_select_authenticated`); only the WRITES are admin-only.
   An analyst may legitimately SEE which Services a Client receives.
9. `src/app/(app)/clients/[id]/services-actions.ts:58` revalidates
   `paths.clients.details(clientId)` — and only that.

SCOPE

MODIFY — `src/services/arcbound-services.ts` + test: add `listAllClientServices()`,
  every row of `client_services` (drop the `.eq`). No SQL change: the select policy
  already covers it.

  ⚠️ **THE POSTGREST 1000-ROW CAP IS A SILENT TRUNCATION, AND HERE IT WOULD READ AS
  "THIS CLIENT HAS NO SERVICES"** — which after this slice means "cannot upload". A
  Client whose row fell off the end would lose their tabs with no error anywhere.
  Either page it with this repo's existing helper (`src/lib/supabase/paged.ts`) or
  document the cap and the actual headroom in a ⚠️ comment. Silence is the one
  option that is not available.

MODIFY — `src/app/(app)/upload/page.tsx` + test: also read the registry, the
  assignments, and the viewer's role; pass them down.

  ⚠️ **THE SERVICES READ MUST NEVER TAKE THIS PAGE DOWN, AND MUST NEVER DEGRADE TO
  `[]`.** `supabase/arcbound-services.sql` IS NOT APPLIED, so these reads throw
  against the live database right now. Follow the pattern S3 established in
  `src/app/(app)/clients/page.tsx` and `clients/[id]/page.tsx`: `null` on failure,
  never `[]`, never a throw. `[]` would claim every Client has no services and take
  the whole ingestion routine offline over an unapplied migration.

CREATE — `src/components/dashboard/ingest/ingest-panel.tsx` + test.
  The Client-first orchestrator: owns `clientId` state, renders the Client `<Select>`
  as **Step 01**, and then branches. Suggested decomposition below; deviate only if
  you can say why it is better.

  ⚠️ **FOUR BRANCHES, AND EACH ONE IS A DIFFERENT FACT. Do not let any two collapse.**
    • No Client picked yet          → prompt to pick one. Not an error.
    • Registry UNREADABLE (`null`)  → ⚠️ RENDER BOTH PIPELINE TABS, plus a notice
      that services could not be read so all upload types are shown. CODE BACKSTOPS
      THE TABLE (ADR 0015). Rendering nothing here takes the weekly routine offline
      over a database read — the exact failure this branch exists to prevent, and
      the live state of this repo today.
    • Client holds NO Services      → no tabs, say so plainly, and offer assignment
      INLINE (see the next component).
    • Client holds Services         → tabs for the ones whose handler has a form.

CREATE — `src/components/dashboard/ingest/client-services-prompt.tsx` + test.
  The no-Services branch.

  ⚠️ **THE TEST THIS SLICE IS JUDGED ON: AN ANALYST MUST NEVER BE OFFERED THIS FORM.**
  `/upload` is open to analysts (fact 1) and `setClientServicesAction` calls
  `requireAdmin()`, which denies by THROWING a redirect (fact 2). Show an analyst
  the assign form and their first click ejects them from the upload page in the
  middle of the weekly routine — no error they can read, no way back to where they
  were. An analyst gets the FACT and the route to a fix instead: this client has no
  services assigned, an admin can assign them on the client's overview.
  Write the test that renders this with `isAdmin={false}` and asserts there is no
  assign control. It is the deliverable.

  Take `isAdmin: boolean` as a REQUIRED prop — same rule, and the same source guard,
  that `client-services-card.tsx` carries.

MODIFY — `src/components/dashboard/ingest/upload-tabs.tsx` + test: takes the
  selected `clientId` and the Services that Client holds; renders one tab per
  Service whose `handler` maps to a form. Preserve its existing ⚠️ block about the
  shadcn primitive. LinkedIn stays first and stays the default when present.

  ⚠️ **AN ARCHIVED SERVICE THE CLIENT HOLDS KEEPS ITS TAB (D11).** Render it,
  label it `ARCHIVED`, and say in the tab body that the service is archived but
  still assigned, so uploads for the existing engagement still work. The engagement
  is live until someone un-assigns it, and S2's archive was deliberately
  non-destructive. Hiding it would let a registry-level retirement silently strip a
  live engagement of its upload path.

  ⚠️ A Service with a NULL handler produces NO TAB, and that is correct, not a gap —
  it is a listed offering with no ingestion pipeline. If a Client holds ONLY
  no-handler Services, say that in words rather than rendering an empty tab strip.

MODIFY — `upload-form.tsx` + `outreach-upload-form.tsx` and both tests: take
  `clientId: string` instead of `clients: ClientOption[]`; delete their own Step 01
  Select; renumber their remaining steps to start at **02**, so the staff-facing
  numbering is unchanged from today. Keep `formData.set("clientId", clientId)` —
  the Server Actions' contract does not change.

  ⚠️ A FORM RESET KEEPS THE SELECTED CLIENT (D12). `key={attempt}` remounts the
  flow; the Client now lives above it and must survive. Uploading two services for
  the same person back-to-back is the common case.

MODIFY — `src/app/(app)/clients/[id]/services-actions.ts` + test: ALSO revalidate
  `paths.upload`. Without it, assigning from `/upload` leaves the tabs absent until
  a hard reload — the change appears to have done nothing (fact 9).

DO NOT TOUCH: `client-tabs.tsx` and the client tab set (S5), `clients/[id]/page.tsx`
(S5), `add-client-dialog.tsx`, `/settings/services` (S2), ANY SQL (S1's twins are
final — if you believe a function is wrong, STOP AND FLAG), `src/middleware.ts`,
`src/lib/auth/*`, the ingest Server Actions' signatures, the report-link functions,
or the `bi.*` views.

TWO KNOWN DEFECTS THAT ARE NOT YOURS. Both are recorded in the S3 handoff and
assigned to S5. Do NOT fix them here; a clean diff on this slice is worth more.
  • `add-client-dialog.tsx` — submit stays live after a partial success, so a second
    click creates a duplicate Client.
  • `clients/[id]/page.tsx:218-222` — an orphaned ReportLinkCard comment.

APPROACH

1. Report real git state. HEAD is `ed817fb`; S1–S3 are uncommitted and are NOT
   yours. Surface, never rewrite, any commit you did not make.
2. Capture the `pnpm test` baseline first (S3 finished at 114 files / 1,710).
3. Seam → page read → prompt component → tab filtering → lift the forms → action
   revalidate. Lift the forms LAST: it is the biggest edit and the least subtle.
4. Mutation-verify and report what went red:
   • Offer the assign form to an analyst — a test must fail. THE IMPORTANT ONE.
   • Render no tabs when the registry read returns `null` — a test must fail.
   • Render every tab regardless of what the Client holds — a test must fail.
   • Hide the tab for a held-but-archived Service — a test must fail.
   • Drop `paths.upload` from the action's revalidate — a test must fail.

ACCEPTANCE CRITERIA

- Picking a Client changes which upload tabs exist; a Client's tabs are exactly the
  Services they hold whose handler has a form.
- An unreadable registry renders BOTH pipeline tabs with a notice. Ingestion never
  goes offline because a table could not be read.
- A Client with no Services gets no tabs, a plain statement of why, and — for an
  ADMIN ONLY — inline assignment that works without leaving the page.
- An analyst on that same screen gets the fact and a route to a fix, and NO control
  that would redirect them away. Proven by a test.
- A held archived Service keeps its tab, labelled, with its status stated.
- A Client holding only no-handler Services is told so in words, not shown an empty
  tab strip.
- Neither form owns a client selector any more; both take `clientId`; staff-facing
  step numbers are unchanged (01 client, 02 input, …).
- A reset keeps the selected Client.
- Gate green; test count strictly up; no existing assertion weakened or deleted.

VERIFICATION

Run and paste real output:

    pnpm lint && pnpm type:check && pnpm test && pnpm build

Verification is the automated gate plus unit/component tests ONLY. DO NOT use
Claude-in-Chrome, a dev server, or any live-browser runtime walk.

⚠️ Report whether `supabase/arcbound-services.sql` has been applied. If it has not,
say plainly that this page runs entirely on its registry-unreadable fallback path
against the real database — which is exactly why that path has to be right.

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
5. The analyst-sees-no-assign-form test, verbatim.
6. The registry-unreadable branch, verbatim, so it can be checked that it renders
   both tabs rather than none.
7. How you handled the 1000-row cap on `listAllClientServices`, and the headroom.
8. What the five mutation checks broke, and that you restored them.
9. FLAGS: anything in this brief wrong about the repo, anything you decided that it
   did not settle, and the SQL apply status.
```

---

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2026-08-02 | Emitted. Not yet run by an executer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2   | 2026-08-03 | **Run and reported.** Planner re-ran the whole gate from a clean start rather than trusting the report: `pnpm lint` clean, `tsc --noEmit` clean, **117 files / 1,754 tests passed**, build succeeded with `/upload 16.7 kB / 222 kB` — matching the executer's figures exactly. Baseline was S3's 114 / 1,710, so **+3 files / +44 tests**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 3   | 2026-08-03 | **The brief's git premise was WRONG, and the executer was right to surface it.** The brief said HEAD is `ed817fb` with S1–S3 uncommitted. In fact **`6ca2d32 feat: arcbound services migration and tests`** exists on `feat--implement-RBAC`, authored by **RafaelIIIPrudente (the user), 2026-08-03 09:32**, and pushed (`0 0` against `origin`). It carries all of S1–S3 plus every planning doc. **Not a rogue agent commit** — the user's own, consistent with "keep uncommitted, I commit". The executer surfaced it and did not rewrite it. Correct handling; the brief was stale, not the repo.                                                                                                                                                                                                                                                                                                                                                                                                            |
| 4   | 2026-08-03 | **M1 re-applied by the planner — the judged mutation.** Replacing `if (!isAdmin)` with `if (false)` in `client-services-prompt.tsx` turned **3 tests red across 2 files** — the judged test (checkbox + button + `<form>` all asserted absent), and the panel's own routing test at `ingest-panel.test.tsx:135`. Exactly as reported. The two-level guard matters: the prompt owns the rule, the panel is proved to route to it with the viewer's real role rather than a hardcoded `true`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 5   | 2026-08-03 | **M2 re-applied — the registry-unreadable branch.** Deleting `<UploadTabs services={ALL_PIPELINE_SERVICES} />` from branch 2 turned **1 test red**: "⚠️ RENDERS BOTH PIPELINE TABS rather than taking ingestion offline". Verified the branch renders `role="alert"` **and** both tabs, not one or the other. `ALL_PIPELINE_SERVICES` is derived from `HANDLER_ORDER.map` over `FORMS`, so the fallback cannot drift from the pipelines that exist — a genuine improvement on a hand-written list, and the executer's own call.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 6   | 2026-08-03 | **M3 re-applied — D11's archived tab.** Adding `&& service.status !== "archived"` to the `ingestible` filter turned **2 tests red** (keeps its tab; labels it ARCHIVED and states it is still assigned). The third test in that block — "does not label an active service as archived" — correctly stayed green, which is what proves the label is conditional rather than always-on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 7   | 2026-08-03 | **M4 re-applied — the revalidate.** Deleting `revalidatePath(paths.upload)` turned **1 test red**: "⚠️ ALSO revalidates /upload, because the tabs there are derived from this". Confirms the fix for the fact-9 hazard actually holds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 8   | 2026-08-03 | **The 1000-row cap is handled properly, and better than the brief asked.** `listAllClientServices` goes through `readAllPages` (50 pages × 1,000 = 50,000 rows against ~150 today, ~330× headroom) and **converts both `unavailable` and `truncated` into a throw**, which `loadRegistry` catches into `null` → the show-everything fallback. Verified against `src/lib/supabase/paged.ts`: Supabase resolves failures as `{ error }` rather than rejecting, so the pager returns a flag, and turning that flag into a prefix would have stripped some Clients of their upload path while looking normal. The `.order("client_id").order("service_id")` pair is the primary key, i.e. a genuinely total order for concurrent ranges. ✅                                                                                                                                                                                                                                                                           |
| 9   | 2026-08-03 | **The "no renumbering needed" claim checked and TRUE.** Both forms already numbered their remaining steps 02+; deleting Step 01 left `02/03/04` (LinkedIn) and `02/03` (Outreach) untouched. Both tests now assert `queryByText("01")` is absent **and** `getByText("02")` is present, so the staff-facing numbering is pinned in both directions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 10  | 2026-08-03 | **D12 is genuinely tested at runtime.** `upload-form.test.tsx` runs a full submit → "Upload another" → second submit cycle and asserts the second submission still carries `clientId` **and** the new follower count — so it proves the remount happened and the client survived it, not just one or the other. Noted for honesty: the guarded property is `formData.set("clientId", clientId)`, not the panel's `useState` (see row 12).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 11  | 2026-08-03 | **The two reshaped test files were checked line by line for weakening. Verdict: intent preserved.** The outreach file lost its Radix pointer-event polyfills (nothing there opens a dropdown any more — correct), and the removed "passes the SAME client roster to both tabs" assertion was genuinely meaningless once the roster stopped being a tab prop. The full-string `findByText("Choose a client to attach this snapshot to.")` match was **kept**, and its ⚠️ comment rewritten to say why it stays now that the placeholder it guarded against is gone. **One cosmetic residue:** the rewritten "still has somewhere to render a clientId error" test now asserts only two facts already asserted elsewhere in the file — it is near-vacuous and could be deleted outright. Not a coverage loss; the real assertion is the full-string match. Recorded, not blocking.                                                                                                                                  |
| 12  | 2026-08-03 | ⚠️ **DEFECT FOUND BY THE PLANNER — the connected `IngestPanel` is untested, and breaking the Client picker leaves the suite green. → S5.** Every test mounts `IngestPanelView`, the presentational half, passing `clientId` and `onClientChange` as props. The connected wrapper (`ingest-panel.tsx:174–198`) — its `useState("")` and its `onClientChange={setClientId}` wiring — is never mounted. **Planner mutation:** replacing `onClientChange={setClientId}` with `onClientChange={() => {}}` leaves **all 97 ingest + upload tests passing** while making `/upload` permanently stuck on "Select a client to see the upload types available for them", with no way to ever pick one. That is the single most user-visible way this slice can fail, and nothing catches it. Same shape as S3's `isAdmin` gap: the presentational half was tested exhaustively and the **wiring** was not. Fix in S5 with one test that mounts `IngestPanel` (not the View), selects a Client, and asserts the tabs change. |
| 13  | 2026-08-03 | **Minor, recorded not fixed:** pressing "Assign services" in `ClientServicesPrompt` with nothing ticked submits an empty set, which `setClientServices` accepts as a valid replace-with-nothing and reports as saved. Harmless (the Client already held nothing) but it reports success for a no-op. Also: branch 3 fires when a Client's only assignments point at Services missing from the registry, and says "no services assigned" — technically a collapse of two states, but S2 archives rather than deletes, so the dangling case should not arise in practice.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 14  | 2026-08-03 | ⚠️ **`supabase/arcbound-services.sql` IS STILL NOT APPLIED.** Verified by the planner: no agent has touched the database, and the guardrails forbid one from doing so. **Live consequence today:** `/upload` runs entirely on its registry-unreadable fallback — every Client shows both pipeline tabs plus the red "services could not be read" notice, and no filtering happens at all. This is why that branch had to be right, and it is the reason it shows everything rather than nothing. **The moment staff paste the SQL into the Supabase SQL editor, filtering starts with no code change.** Now blocking S2, S3 and S4 from being live-true.                                                                                                                                                                                                                                                                                                                                                          |
