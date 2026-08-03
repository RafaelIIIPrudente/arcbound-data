# Handoff — Arcbound Services S3: per-Client assignment

**Date:** 2026-08-02
**Branch:** `feat--implement-RBAC`
**Shaping doc:** [`docs/decisions/2026-08-02-arcbound-services-registry.md`](../decisions/2026-08-02-arcbound-services-registry.md)
**Predecessors:** [S1 — data model](2026-08-02-services-s1-data-model.md) 🟢 · [S2 — settings screen](2026-08-02-services-s2-settings-screen.md) 🟢
**Slice:** S3 of five.
**Status:** 🟢 LANDED — planner-verified 2026-08-02 (114 files / 1,710 tests, gate exit 0).

**Planner call carried into this brief (vetoable).** Services are **not required**
when registering a Client — requiring them would block registering a Client before
the engagement is finalised. But choosing none must say out loud that the Client
cannot receive uploads until one is assigned, rather than succeeding quietly.

---

## The prompt as issued

```
ROLE

You are a world-class TypeScript/React engineer who is unusually careful with
replace-the-whole-set writes. Your defining trait: when an API takes the complete
desired state rather than a delta, you ask what is in the current state that the
form does not render — and you make sure submitting the form cannot destroy it.
You have seen "the checkbox wasn't on the page, so the save removed it" too many
times to let it happen again.

Working style, binding:
- READ BEFORE WRITE. Verify every fact below; if one is wrong, STOP and report it.
- ⚠️ comments in this codebase are BINDING CONSTRAINTS. Never delete or weaken one.
  If your change makes one FALSE, UPDATE it to the new truth.
- RED-first (superpowers:test-driven-development).
- DO NOT WIDEN SCOPE. If a change needs a file outside Scope, STOP and FLAG.
- Report honestly with real command output.

GOAL

Let an admin choose which Arcbound Services a Client receives — when registering
the Client, and afterwards from the Client's Overview. Analysts see the
assignment read-only. Nothing about the upload flow or the client tabs changes
yet; those are S4 and S5.

CONTEXT

The repo IS ArcBase: an internal, auth-gated, single-tenant Next.js app. Read
`AGENTS.md` and `CONTEXT.md` first, then
`docs/adr/0015-arcbound-services-registry.md`.

S1 built `public.services` / `public.client_services` and the seam
`src/services/arcbound-services.ts`. S2 built `/settings/services`, where admins
create, archive, restore and delete Services. This slice connects the registry to
Clients.

REPO FACTS YOU MUST USE (verify each):

1. ⚠️ **`setClientServices(clientId, serviceIds)` REPLACES THE ENTIRE SET FOR THAT
   CLIENT.** It is not a delta. Whatever you do not submit is removed. This is the
   central hazard of this slice — see Scope.
2. Seam functions available (verify the exact signatures in
   `src/services/arcbound-services.ts`): `listServices()`,
   `listClientServices(clientId)`, `setClientServices(clientId, serviceIds)`.
   Check whether `listServices()` already excludes archived Services; do not
   assume either way, and say what you found.
3. `createClientAction` in `src/app/(app)/clients/actions.ts` is already
   admin-only (`await requireAdmin()` first, outside the try) and currently
   returns `{ ok: true }` WITHOUT the new Client's id. `createClient()` in
   `src/services/clients.ts` selects the row back after insert, so the id IS
   available — the action simply discards it. You will need it.
4. ⚠️ `client_services.client_id` HAS A FOREIGN KEY TO `clients(id)`. The Client
   must exist before its services can be written. Order is not a preference.
5. ⚠️ `requireAdmin()` DENIES BY THROWING (it calls `redirect()`). It goes first
   and OUTSIDE every `try`. `src/app/(app)/settings/roles/actions.ts` documents
   this in a ⚠️ block; `src/app/(app)/settings/services/page.tsx` shows the
   correct shape when a read must also be caught.
6. `src/app/(app)/clients/[id]/page.tsx` is the Client Overview. It already reads
   `getRole()` / `isAdmin()` and passes `isAdmin` into `ReportLinkCard`, so the
   admin-vs-analyst split has an established pattern on this exact page. Follow it.
7. ⚠️ `CONTEXT.md`'s **Immutability** entry says Clients and Uploads are never
   edited or deleted and that "ArcBase exposes no edit/delete affordances for
   these records." S1 already added a cross-reference there. Read what it now says
   before you touch it, and EXTEND rather than duplicate.

SCOPE

CREATE — `src/components/dashboard/client/client-services-card.tsx` + test.
  The Client's Services, on the Overview. Admin-editable; read-only for analysts
  (take `isAdmin: boolean` as a REQUIRED prop, as `ReportLinkCard` does — an
  optional one defaults to the permissive value when someone forgets to pass it).

  ⚠️ **THE REPLACE-THE-SET TRAP, WHICH IS THE WHOLE POINT OF THIS SLICE.**
  `setClientServices` replaces everything. If this form renders only ACTIVE
  Services, then an ARCHIVED Service the Client still holds is not in the
  submitted set — and saving anything at all silently removes it. No error, no
  trace, and the archive design in S2 exists precisely so that history survives.

  The form must therefore submit the COMPLETE intended set:
    • Active Services → normal checkboxes.
    • A Service the Client HOLDS that is now archived → rendered visibly, labelled
      archived, and INCLUDED in the submitted set. Show it; do not let it be added
      fresh, because an archived Service is retired and must not be newly
      assigned; and do not let an unrelated save drop it.
    • Archived Services the Client does NOT hold → not offered at all.
  Write a test that saves a change while the Client holds an archived Service and
  asserts the archived Service is STILL THERE afterwards. That test is the
  deliverable this slice is judged on.

  Render a NULL-handler Service the same way S2 does — "No data pipeline", never
  an em dash (em dash means "could not be read"; this is a fact on record).

  ⚠️ A CLIENT WITH NO SERVICES IS A REAL, VALID STATE and must read as one:
  "No services assigned. This client cannot receive uploads until one is added."
  Not an empty box, and not an error.

CREATE — `src/app/(app)/clients/[id]/services-actions.ts` + test.
  `setClientServicesAction`. `zod`-validated, `requireAdmin()` first and outside
  the try (fact 5), `revalidatePath` on success, database refusals surfaced
  verbatim.

MODIFY — `src/app/(app)/clients/[id]/page.tsx` + test: read the Client's services
and render the card. Pass `isAdmin` explicitly.

MODIFY — `src/app/(app)/clients/actions.ts` + test, and the Add-Client form
component + its test: let an admin pick Services while registering a Client.

  ⚠️ **ORDER: CREATE THE CLIENT, THEN ASSIGN (fact 4).** Capture the id
  `createClient()` returns instead of discarding it (fact 3).

  ⚠️ **PARTIAL SUCCESS IS A REAL OUTCOME AND MUST BE REPORTED AS ONE.** If the
  Client is created and the service write then fails, the Client EXISTS with no
  Services — and once S4 lands, that means it cannot be uploaded to. Return a
  state that says exactly that and points at the Client's Overview to fix it.
  Not a blanket success, not a blanket error. `ClientFormState` will need a third
  shape; ADR 0014's invite flow is the precedent for this three-way result.

  ⚠️ SERVICES ARE NOT REQUIRED AT REGISTRATION — a Client may be registered before
  the engagement is finalised. But submitting with none selected must state
  plainly that the Client cannot receive uploads until a Service is assigned.
  Silence here would be the same silent-outage failure the S1 backfill exists to
  prevent.

MODIFY — `CONTEXT.md`: extend the **Immutability** entry (fact 7) to state that a
Client's SERVICES are assignable while the Client RECORD stays immutable — the
assignment lives in a separate relation and changes nothing about the Client's
identity, name, or URL. One or two sentences; do not restructure the entry.

DO NOT TOUCH: `client-tabs.tsx` and the client tab set (S5), `/upload` and
anything under `src/components/dashboard/ingest/` (S4), any SQL (S1's twins are
final — if you believe a function is wrong, STOP AND FLAG), `/settings/services`
(S2), `src/middleware.ts`, `src/lib/auth/*`, the report-link functions, or the
`bi.*` views.

APPROACH

1. Report real git state. HEAD is `ed817fb`; S1's and S2's work is uncommitted and
   is NOT yours. Surface, never rewrite, any commit you did not make.
2. Capture the `pnpm test` baseline count first (S2 finished at 110 files / 1,667).
3. Card → action → Overview wiring → Add-Client flow → CONTEXT.md.
4. Mutation-verify and report what went red:
   • Submit only the ACTIVE services from the card — the archived-service
     survival test must fail. This is the one that matters most.
   • Assign services BEFORE creating the Client — a test must fail (FK order).
   • Return `{ ok: true }` on the partial-success path — a test must fail.
   • Make `isAdmin` optional with a default of `true` — a test must fail.

ACCEPTANCE CRITERIA

- Saving the card while a Client holds an ARCHIVED Service leaves that Service
  assigned. Proven by a test that fails if only active services are submitted.
- An archived Service the Client does not hold cannot be assigned.
- An analyst sees the assignment read-only, with no save control. `isAdmin` is a
  required prop.
- Registering a Client creates it FIRST, then assigns; a failed assignment reports
  partial success naming the consequence, not success and not a blanket error.
- Registering with no Services succeeds and says the Client cannot receive uploads
  until one is assigned.
- "No services assigned" renders as a stated fact; no em dash on that path.
- `CONTEXT.md` reconciles assignable Services with Client immutability.
- Gate green; test count strictly up; no existing assertion weakened or deleted.

VERIFICATION

Run and paste real output:

    pnpm lint && pnpm type:check && pnpm test && pnpm build

Verification is the automated gate plus unit/component tests ONLY. DO NOT use
Claude-in-Chrome, a dev server, or any live-browser runtime walk.

⚠️ Report whether S1's `supabase/arcbound-services.sql` has been applied to the
live project. If it has not, say plainly that nothing in this slice works against
a real database regardless of the gate.

GUARDRAILS

- DO NOT APPLY OR EDIT SQL. No `db push`, no CLI, no database connection.
- LEAVE ALL WORK UNCOMMITTED. No commit, push, branch, tag, or PR. Never commit
  to `main`.
- DO NOT run `graphify update`.
- If you cannot satisfy an acceptance criterion, DO NOT silently drop it. Finish
  everything else and report exactly what is undone and why.

REPORT BACK

1. Git state at start and end.
2. `git diff --stat` plus new files.
3. Baseline and final test counts.
4. Full gate output.
5. The archived-service survival test, verbatim, so it can be checked that it
   would actually catch a form submitting only active services.
6. The Add-Client ordering and the partial-success branch, verbatim.
7. Whether `listServices()` excludes archived Services, and what you did about it.
8. What the four mutation checks broke, and that you restored them.
9. FLAGS: anything in this brief wrong about the repo, anything you decided that
   it did not settle, and the SQL apply status.
```

---

## Feedback & revisions log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-02 | Emitted. Not yet run by an executer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-02 | **Run and planner-verified.** Independently re-ran the full gate from a clean start: lint clean, `tsc --noEmit` clean, **114 files / 1,710 tests**, `pnpm build` succeeded. Git state confirmed — HEAD still `ed817fb`, work uncommitted, no commit rewritten.                                                                                                                                                                                                                                                                                                                    |
| 2026-08-02 | **Mutation M1 re-applied by the planner, not taken on trust.** Replacing `offered = [...active, ...heldArchived]` with `[...active]` turned **4** tests red, the archived-service survival test first. The executer reported 3 — the true blast radius is larger (the analyst read-only test also depends on `offered`), so the claim was understated, not overstated. Restored; 14/14 green.                                                                                                                                                                                     |
| 2026-08-02 | **Mutation M4 re-applied by the planner.** `isAdmin?: boolean` + `isAdmin = true` in the destructuring turned both source-guard assertions red. Confirms the executer's own correction was real: M4 initially caught nothing because requiredness is compile-time, and the source guard is the right instrument. The guard's negative lookahead `(?!\{)` correctly spares `isAdmin={isAdmin}` — verified by the guard-the-guard test, which proves comment-stripping did not empty the file.                                                                                      |
| 2026-08-02 | **Survival test verified sound, not just present.** It reads `input[name="service_id"]:checked` off the DOM — literally the POST body — and `setClientServicesAction` consumes `formData.getAll("service_id")`. Proxy and action agree, so the test measures what it claims to. `requireAdmin()` confirmed first and outside every `try` in BOTH `services-actions.ts` and `clients/actions.ts`.                                                                                                                                                                                  |
| 2026-08-02 | **`listServices()` confirmed unfiltered** — no `status` predicate, orders by `sort_order` only. The executer's decision to partition in the component (`active` + `heldArchived`) rather than filter at the seam is correct: the card cannot protect a held archived Service it never receives.                                                                                                                                                                                                                                                                                   |
| 2026-08-02 | **DEFECT (residual, carried to S4) — the Add-Client dialog can still create a duplicate.** On `created_without_services` and `created_services_failed` the dialog correctly stays open so the message survives, but the submit button remains live (`disabled={pending}` only). An admin who clicks "Add client" again creates a SECOND Client — exactly the duplicate the executer cited as the reason not to close, since `clients` has no unique constraint (ADR 0009). The message mitigates it; the control does not. Fix: disable submit once `state` carries a `clientId`. |
| 2026-08-02 | **DEFECT (cosmetic) — orphaned comment.** `src/app/(app)/clients/[id]/page.tsx:218-222`, the "Sits right after the report/posts nav… private link + Access Code" block, now sits directly above `ClientServicesCard`, separated from the `ReportLinkCard` it describes. A reader attributes it to the wrong component.                                                                                                                                                                                                                                                            |
| 2026-08-02 | **INCONSISTENCY (cosmetic) — `pipelineLabel` diverges from S2.** S2's renders the pipeline's NAME (`HANDLER_LABELS[handler]`); S3's renders a generic `"Has a data pipeline"`. Neither is dishonest and both avoid the em dash, but the same fact reads two ways in two places — and S4 is where handler identity starts to matter (it decides which upload tab appears). Reconcile in S4.                                                                                                                                                                                        |
| 2026-08-02 | **Scope addition accepted.** `src/app/(app)/clients/page.tsx` was not in Scope, but a client component cannot fetch its own registry, so the page must pass it. Three lines (import, guarded `listServices().catch(() => null)`, prop), correctly flagged rather than slipped in. The `null`-never-`[]` degradation was extended to BOTH client screens on the executer's initiative — the right call, and the reason an unapplied migration does not blank two working screens.                                                                                                  |
| 2026-08-02 | **Two existing assertions changed, verified NOT weakened.** `ClientFormState` moved from `{ ok: boolean }` to a four-way discriminated union, so `toEqual({ ok: true })` became `toMatchObject({ status: "created", clientId })`. Equally strong, and the old shape could not express partial success at all.                                                                                                                                                                                                                                                                     |
| 2026-08-02 | **⚠️ SQL STILL NOT APPLIED — now blocking three slices, not one.** `supabase/arcbound-services.sql` has not been pasted into the Supabase SQL editor. S1, S2 and S3 are all green against a database where `public.services` does not exist. Nothing in any of them works at runtime until it is applied and its verification queries run ONE AT A TIME (the editor renders only the last statement's result set).                                                                                                                                                                |
