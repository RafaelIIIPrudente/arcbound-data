# Handoff — RBAC S4: put Settings in the sidebar

**Date:** 2026-08-02
**Branch:** `feat--implement-RBAC`
**Shaping doc:** [`docs/decisions/2026-08-02-rbac-admin-and-data-analyst.md`](../decisions/2026-08-02-rbac-admin-and-data-analyst.md)
**Predecessors:** S1 · S2 · S3 — all landed, all SQL applied and live-verified.
**Status:** 🟡 emitted, not yet run.

**Why this exists.** S3 put the Staff Roles link on `/settings` — but `/settings`
is not in the sidebar and nothing anywhere links to it (`top-bar.tsx` has no links
at all; the avatar is decorative). So the roles screen was reachable only by typing
a URL. Planner miss: the S3 brief said "render a link on the settings page" without
checking the settings page was itself reachable.

**User's call (2026-08-02):** add **Settings** to the sidebar for everyone, keeping
the roles link inside it admin-only. This also un-orphans profile and password
management, which are currently unreachable by clicking.

---

## The prompt as issued

```
ROLE

You are a world-class TypeScript/React engineer working in a codebase where header
comments are load-bearing documentation. Your defining trait for this task: when a
change makes a comment false, you UPDATE the comment to the new truth — you never
delete it to avoid the contradiction, and you never leave it lying.

Working style, binding:
- READ BEFORE WRITE. Verify each fact below; if one is wrong, STOP and report it.
- ⚠️ comments are BINDING CONSTRAINTS. Do not delete or weaken one to fit a change.
- RED-first (superpowers:test-driven-development).
- DO NOT WIDEN SCOPE. If a change needs a file outside Scope, STOP and FLAG.
- Report honestly with real command output.

GOAL

Add a sixth sidebar item, **Settings**, linking to `/settings`, visible to every
signed-in staff member. Nothing else changes. The admin-only Staff Roles link stays
where S3 put it — inside `/settings` — and stays admin-only.

This is a small slice. Keep it small.

CONTEXT

The repo IS ArcBase: an internal, auth-gated, single-tenant Next.js app. Read
`AGENTS.md` and `CONTEXT.md` first.

The RBAC workstream (ADR 0013) is complete and applied: `admin` and `analyst` Staff
Roles, enforced in the UI, in Server Actions, and in the database. `/settings/roles`
exists, works, and is admin-gated by `requireAdmin()`. It is simply not reachable by
clicking, because `/settings` is not in the nav — that is what this slice fixes.

REPO FACTS YOU MUST USE (verify each):

1. `src/components/dashboard/layout/nav-config.ts` exports `navItems`, currently
   FIVE entries: Dashboard, Client List, Add Data, Resources, Data Quality.
2. ⚠️ ITS HEADER COMMENT SAYS "the five items are the whole product surface" AND
   carries a ⚠️ block reading "SRS §5 STILL DESCRIBES FOUR. Data Quality was added
   after it was written and the SRS has not caught up — the delta is deliberate and
   flagged, not an oversight." BOTH BECOME FALSE WITH YOUR CHANGE. Update them: the
   count becomes six, and the SRS drift widens from one item to TWO. Say that
   plainly. Do NOT delete the ⚠️ block, and do NOT drop the item to make the old
   comment true again — the block explicitly forbids exactly that move.
3. `src/components/dashboard/layout/nav-config.test.ts` asserts the EXACT title array
   (~L9) and the EXACT href array (~L19). Both must be extended.
4. `src/components/dashboard/layout/side-nav.test.tsx` (~L27) asserts the rendered
   link count via `labels.length`; check whether its `labels` list is hard-coded and
   extend it if so.
5. `src/components/dashboard/layout/mobile-nav.tsx` also renders `navItems` — verify
   whether it or its test hard-codes anything that needs extending.
6. `paths.settings.profile` is `"/settings"`. Use it; never hard-code the path.
7. `isNavItemActive` treats every non-home item as active on its own route AND any
   nested route. So Settings will correctly stay active on `/settings/roles` with NO
   change to that function — add a test proving it rather than new logic.
8. `resolvePageTitle` already handles `/settings` and `/settings/roles` (S3 added the
   roles branch BEFORE the generic one, because `startsWith` ordering is load-bearing
   there — the file documents that trap three times). No change needed.

SCOPE

MODIFY:
- `src/components/dashboard/layout/nav-config.ts` — append
  `{ title: "Settings", href: paths.settings.profile }` as the LAST item (it is a
  utility surface, not a product surface, so it sorts after Data Quality), and
  correct both comments per fact 2.
- `src/components/dashboard/layout/nav-config.test.ts` — extend both array
  assertions; add the `isNavItemActive("/settings", "/settings/roles") === true` case.
- `src/components/dashboard/layout/side-nav.test.tsx` and/or the mobile-nav test —
  only whatever facts 4 and 5 show actually needs extending.

DO NOT TOUCH: `src/paths.ts`, `/settings/page.tsx` (S3's admin-only roles link is
already correct there), `top-bar.tsx`, any RBAC guard, any SQL, any service, any
other component. If you believe one is needed, STOP AND FLAG.

⚠️ SETTINGS IS VISIBLE TO EVERYONE — THAT IS DELIBERATE. Do not make the nav item
role-aware. `/settings` hosts profile and password management, which every staff
member needs. Only the Staff Roles LINK INSIDE it is admin-only, and S3 already
handles that. Adding a role check here would lock analysts out of their own profile.

APPROACH

1. Report real git state (`git status --short`, `git branch --show-current`,
   `git log --oneline -3`). S3's work is uncommitted and is NOT yours; S1+S2 are
   committed as `f379882`. Build additively; surface, never rewrite, any commit you
   did not make.
2. Capture the `pnpm test` baseline count first.
3. RED-first: extend the assertions, watch them fail, then add the item.
4. Mutation-verify: reorder Settings to the top of `navItems` and confirm a test goes
   red (proving the order assertion is real, not incidental). Restore.

ACCEPTANCE CRITERIA

- The sidebar renders six items with Settings LAST, on both desktop and mobile nav.
- Settings is active on `/settings` AND on `/settings/roles`, proven by a test.
- The nav item is NOT role-aware — an analyst sees it. A test asserts it renders
  without any role context.
- Both comments in `nav-config.ts` are true again: the count reads six, and the SRS
  drift is described as TWO items. The ⚠️ block still exists.
- Gate green; test count strictly up; no existing assertion weakened or deleted.

VERIFICATION

Run and paste real output:

    pnpm lint && pnpm type:check && pnpm test && pnpm build

Verification is the automated gate plus unit/component tests ONLY. DO NOT use
Claude-in-Chrome, a dev server, or any live-browser runtime walk.

GUARDRAILS

- No SQL in this slice. Do not connect to the database.
- LEAVE ALL WORK UNCOMMITTED on `feat--implement-RBAC`. No commit, push, branch,
  tag, or PR. Never commit to `main`.
- DO NOT run `graphify update`.
- If you cannot satisfy an acceptance criterion, DO NOT silently drop it. Finish
  everything else and report exactly what is undone and why.

REPORT BACK

1. Git state at start and end.
2. `git diff --stat`.
3. Baseline and final test counts.
4. Full gate output.
5. The updated `nav-config.ts` header comment, verbatim, so the honesty of the SRS
   drift note can be checked by eye.
6. What the mutation check broke, and that you restored it.
7. FLAGS: anything in this brief wrong about the repo, and anything you decided that
   it did not settle.
```

---

## Feedback & revisions log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-02 | Emitted. Not yet run by an executer.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-02 | 🟢 **LANDED, planner-verified.** `pnpm test` → **105 files / 1,545 tests, exit 0** (baseline 104 / 1,540). Six nav items with Settings last; both comments corrected; S3 now committed as `50f65c8` (user's), so only S4 is uncommitted.                                                                                                                                                                                                                                                       |
| 2026-08-02 | **The executer corrected a third comment claim the brief did not list, and was right to.** The header opened _"Single-tenant, so no per-role visibility"_ — a sentence whose conclusion survived ADR 0013 but whose REASONING died with it. It now reads "⚠️ NO PER-ROLE VISIBILITY, AND THAT IS NOW A CHOICE RATHER THAN A CONSEQUENCE", naming the old text and why it stopped being true. That is exactly the failure mode the brief was about, found somewhere the brief was not pointing. |
| 2026-08-02 | **Fact 5 in the brief was half-right and the gap mattered.** `mobile-nav.tsx` hard-codes nothing, so it needed no change — but **no `mobile-nav.test.tsx` existed at all**, so the acceptance criterion "six items on both desktop and mobile nav" had nowhere to be verified. The executer created it (3 tests) and flagged the out-of-scope file rather than burying it.                                                                                                                     |
| 2026-08-02 | Two process notes worth keeping: the executer's first mobile-nav test failed for the WRONG reason (`openMenu()` called `screen` without `render`) and was caught **at the RED step**, which is what watching a test fail is for; and it strengthened its own "not role-aware" assertion after the mutation run, because it keyed off `navItems[5]` positionally and survived the reorder mutation for the wrong reason.                                                                        |
