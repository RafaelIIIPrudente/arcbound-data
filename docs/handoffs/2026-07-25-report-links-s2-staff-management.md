# Handoff — Report Links S2: staff management UI (Create / Rotate / Revoke)

- **Type:** Executer handoff (feature slice, S2 of the Report Links workstream)
- **Date:** 2026-07-25 (finalized against the LIVE S1 service — supersedes the pre-S1 draft)
- **Branch:** `feat-additonal-features-for-linkedin-report` (S1/S3/S4/S5 sit here UNCOMMITTED)
- **Status:** Ready to run. S1 is applied to the DB and its code is in the working tree,
  so this handoff is written against the ACTUAL committed signatures.
- **Brief:** [spec §Slice S2](../specs/2026-07-25-client-report-links.md) + [ADR 0011](../adr/0011-client-report-links.md).

## Decision & rationale

A "Report Link" card on the client detail page lets staff Create the one active link,
copy its URL, see the Access Code ONCE, and Rotate/Revoke. Server actions wrap the S1
service. The Access Code is hashed at rest (`ReportLinkStatus` carries no code by
construction), so it is surfaced exactly once at Create/Rotate and never re-rendered.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class Next.js (App Router) + React + TypeScript engineer who treats a
one-time secret as one-time: you surface it exactly when it is generated, make it easy to
copy, and never re-render it afterward. You read before you write; ⚠️ comments in this
repo are binding; you write failing tests first and prove they fail for the right reason;
you never widen scope silently; you report with real command output.

GOAL
Add a staff-facing "Report Link" card to the client detail page so staff can Create /
Rotate / Revoke a Client's single Report Link, copy its URL, and see the Access Code once.

CONTEXT — read FIRST:
- `docs/specs/2026-07-25-client-report-links.md` §"Global Constraints" + §"Slice S2".
- `docs/adr/0011-client-report-links.md` — a Report Link is a capability (not a user); the
  Access Code is shown once and is unrecoverable thereafter.
- `AGENTS.md`, `CONTEXT.md` (vocabulary: Report Link, Access Code).
- THE LIVE S1 SERVICE (uncommitted in the tree; the DB schema is already applied) — use
  these ACTUAL signatures from `src/services/report-links.ts`:
    issueReportLink(clientId: string): Promise<IssuedReportLink>   // { url, accessCode }
    rotateReportLink(clientId: string): Promise<IssuedReportLink>  // { url, accessCode }
    revokeReportLink(clientId: string): Promise<void>
    getReportLink(clientId: string): Promise<ReportLinkStatus | null>
  and the types in `src/services/types.ts`:
    ReportLinkStatus = { clientId, url, createdAt, lastAccessedAt: string|null, active }
      — ⚠️ carries NO access code and NO hash, BY CONSTRUCTION; it cannot re-display the code.
    IssuedReportLink = { url, accessCode }  — the raw code, surfaced ONCE.
- MOUNT POINT: the client detail page `src/app/(app)/clients/[id]/page.tsx` — a server
  component (`export default async function ClientDetailPage`) that already renders
  `<ClientTabs>`, `<FollowerTrendPanel>`, `<UploadHistory>`. Read `getReportLink(client.id)`
  there (server-side) and pass the status into the card as a sibling panel.
- SERVER-ACTION PRECEDENT: `src/components/dashboard/client/add-client-dialog.tsx` uses
  `useActionState(createClientAction, INITIAL)` + `<form action={formAction}>` over an
  actions file. Follow that exact idiom for Create/Rotate/Revoke.

STEPS — TDD throughout (RED-first):
1. Actions. Create the server actions (`"use server"`) wrapping the service:
   `createReportLinkAction` / `rotateReportLinkAction` (return the `IssuedReportLink`
   `{url, accessCode}`) and `revokeReportLinkAction` (void). Revalidate the client detail
   path so the card reflects the new state. Co-locate per the repo's actions-file pattern.
2. Card. `src/components/dashboard/client/report-link-card.tsx` (client component): given
   `status: ReportLinkStatus | null` —
     • no active link (`null` or `!active`) → a **Create client link** button;
     • active → the copyable `url`, `created` + `last accessed`, and **Rotate** / **Revoke**.
   Wire the actions with `useActionState` per the precedent.
3. One-time code. After Create/Rotate returns `{url, accessCode}`, render the Access Code
   ONCE with a clear "copy it now — it won't be shown again" affordance. A plain render of
   an active link must NOT contain the code (it isn't in `ReportLinkStatus`) — assert this.
4. Revoke. Use an INLINE confirm affordance (it kills the client's live link). Do NOT call
   the native `confirm()` dialog. On success the card flips to the "Create" state.
5. Mount. Render the card on the client detail page from the server-read `getReportLink`.

ACCEPTANCE
- Card shows Create when there is no active link; shows the URL + Rotate/Revoke when active.
- The Access Code renders exactly once after Create/Rotate; a test asserts it is ABSENT on
  a normal render of an active link.
- Copy affordances for both URL and code. Revoke uses an inline (not native-dialog) confirm.
- No new service functions; no DB read beyond `getReportLink`. Test count strictly up; no
  existing assertion weakened; every new test RED-first and mutation-verified.

VERIFICATION (the whole gate — nothing else)
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output pasted.
- Mutation table (real runs): (a) render the code on the active-link view → the "code
  absent on re-render" test fails; (b) drop the revoke confirm → its test fails.
- No Claude-in-Chrome / dev-server walk — assert through component markup + action logic.

GUARDRAILS
- READ THE ACTUAL GIT STATE AT START and report it. S1/S3/S4/S5 are UNCOMMITTED in the
  tree — build ADDITIVELY; do NOT revert, stash, reset, commit, or reimplement them. Stay
  on `feat-additonal-features-for-linkedin-report`; never commit to `main`; SURFACE (never
  self-heal) any unexpected commit.
- LEAVE ALL WORK UNCOMMITTED. The Access Code is shown once and never re-rendered from
  `ReportLinkStatus`. If a change needs a file outside SCOPE, STOP and FLAG.
- Conventional Commits only if later asked; keep the tree green.

SCOPE — create/modify ONLY: `src/components/dashboard/client/report-link-card.tsx` (+ its
test) and its server-actions file; the client detail page `src/app/(app)/clients/[id]/
page.tsx` (mount the card + server-read `getReportLink`). Do NOT touch the S1 service/SQL,
the public route/gate/view (S3/S4/S5), or other client screens.

REPORT BACK
- Git state at start; files changed; final `git status --porcelain`.
- How the one-time Access Code is surfaced and PROVEN absent on a plain re-render.
- Full gate output + the mutation table (real runs); test count before/after.
- FLAGS: anything you stopped short of; whether the card's placement on the detail page
  reads well relative to the existing panels.
```

## Feedback & revisions

- **2026-07-25 — v1 (pre-S1 draft).** Authored from the spec before S1 existed; said
  "verify against S1's committed signatures."
- **2026-07-25 — v2 (finalized).** Rewritten against the LIVE S1 service (`issue/rotate/
revoke/getReportLink` signatures, `ReportLinkStatus` carrying no code by construction),
  the real mount point (`clients/[id]/page.tsx`), and the `useActionState` precedent
  (`add-client-dialog.tsx`). Ready to run.
  _(Append dated entries as the executer reports back; edit the prompt in place if revised.)_

- **2026-07-25 — executer run: S2 built, gate green, uncommitted. Workstream COMPLETE.**
  - **Files:** `src/app/(app)/clients/[id]/report-link-actions.ts` (+ test) — three
    `"use server"` actions (create/rotate/revoke) over the S1 service, each
    `revalidatePath(paths.clients.details(clientId))`, `clientId`-bound. Split the card
    into a pure `ReportLinkCardView` (fully unit-testable) + a thin `ReportLinkCard`
    `useActionState` wrapper (`src/components/dashboard/client/report-link-card.tsx` +
    test). Mounted on `clients/[id]/page.tsx` right after `ClientTabs` (added a
    fail-soft `getReportLink(id)` to the existing parallel read).
  - **One-time code:** the Access Code lives ONLY in the transient action result
    (`issued`), never in `ReportLinkStatus`; the code panel renders solely when
    `issued` is present (Create/Rotate), with a "copy it now — it won't be shown
    again" affordance. A revoke clears `issued`; a `revalidatePath` re-render reads
    `getReportLink` (no code) so the code cannot reappear. Revoke uses an INLINE
    confirm (no native `confirm()`). Copy affordances for URL and code.
  - **Gate:** lint ✔, type:check ✔, test ✔ (811→**823**, 68→**70** files), build ✔.
    Mutations: (a) render the code on the active view → the "code absent on re-render"
    test CAUGHT ✔; (b) drop the inline revoke confirm → CAUGHT ✔.
  - **Scope:** only the card (+test), its actions file (+test), and the detail page
    mount. Did NOT touch S1/S3/S4/S5. `clientId` is passed to the card separately
    because `ReportLinkStatus` is `null` when no link exists (can't carry the id).
  - **End-to-end loop now closed:** staff Create a link on the client page (see the
    Access Code once) → client opens `/r/<token>` → enters the code → sees their live
    report + status. (Needs the S5 SQL applied — done.)
