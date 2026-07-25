# Handoff — Report Links: the client-side public experience (S3 + S4 combined)

- **Type:** Executer handoff (feature slice — consolidates spec §Slice S3 + §Slice S4)
- **Date:** 2026-07-25
- **Branch:** the Report Links feature branch created in S1
- **Status:** Run AFTER S1 lands (needs `report-links.ts` `resolveReportLink` + the
  `report_links` table applied). Supersedes the separate
  `…-report-links-s3-public-gate.md` and `…-report-links-s4-client-view.md` for
  execution — they remain the granular design record.
- **Framework:** RISEN (Role · Instructions/Steps · End-goal · Narrowing), authored
  with `/prompt-architect`.
- **Brief:** [ADR 0011](../adr/0011-client-report-links.md) +
  [spec §S3/§S4](../specs/2026-07-25-client-report-links.md).

## Decision & rationale

The gate and the view share the same `/r/<token>` route and are tightly coupled, so
they ship as one client-facing handoff: the public route + Access Code gate + signed
gate cookie + lockout in front of the live client report view (reuse the existing
report sections, strip staff chrome) topped by the Report Status strip. Fails closed,
gives no auth oracle, leaks no staff chrome or cross-Client data, and never grades.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class Next.js (App Router) + React + web-security engineer. Two
instincts define you. First, you build public gates that FAIL CLOSED and give an
attacker no oracle — a wrong URL and a wrong code produce the identical generic error,
and repeated failures lock out. Second, on a client-facing page you describe state and
never grade it, and you never leak staff-only chrome, internal diagnostics, or another
Client's data. You read before you write; ⚠️ comments in this repo document real past
defects and are binding; you write failing tests first and prove they fail for the
right reason; you never widen scope silently; you report with real command output.

GOAL
Build the entire CLIENT-FACING Report Link experience: the public route `/r/<token>`
that gates on an out-of-band Access Code (verify → set a short-lived signed cookie →
lock out on repeated failure) and, once past the gate, renders the Client's LIVE report
— the existing report sections in a public wrapper stripped of staff chrome — topped by
a Report Status strip (freshness + a plain, non-graded activity/trend line). No account,
no role tier: the viewer is a capability holder, never an authenticated user.

CONTEXT — read these FIRST; they are your brief (do not restate them, follow them):
- `AGENTS.md` (every stack + architecture rule), `CONTEXT.md` (the pinned vocabulary:
  Report Link, Access Code, Report Status; a Client is a tracked SUBJECT, not a user).
- `docs/adr/0011-client-report-links.md` — the decision: URL + Access Code, code hashed,
  lockout, live-not-snapshot, noindex/no-referrer, read-only single-Client payload, and
  that this NARROWS ADR 0007 (the viewer is not a second user class).
- `docs/specs/2026-07-25-client-report-links.md` — §"Global Constraints", §"Slice S3",
  §"Slice S4" are your step-by-step brief and the shared interfaces.
- DEPENDENCY — Slice S1 must already be committed: `src/services/report-links.ts`
  exposes `resolveReportLink(token, code): Promise<{ok:true, clientId} | {ok:false,
  reason:"invalid"|"locked"}>`, and `public.report_links` + its functions are applied.
  Use the ACTUALLY-committed `resolveReportLink` signature; if S1 is not present, STOP
  and FLAG (or stub the seam behind an interface and flag it loudly) — do NOT reimplement
  S1 here.
- `src/lib/route-access.ts` — the `PUBLIC_ROUTES` / `isPublicRoute` seam you extend, and
  its test. `src/middleware.ts` applies `routeAccess` + the CSP; do not fight it.
- `src/app/(app)/clients/[id]/report/page.tsx` — the staff report page: the SAME section
  components you reuse (Key performance, Engagement trends incl. the fixed weekday chart,
  Posting cadence, Content mix, Content composition) AND the staff chrome you must OMIT
  (`ClientTabs`, the staff back-link, the staff print button, the raw `AnalyticsTruncated`
  "read X of Y" banner).
- `src/services/client-report.ts` — `buildClientReport(...)`; reuse it, add NO analytics
  read. It already reads uploads (for freshness) and rows (for cadence/trend).

INSTRUCTIONS / STEPS — TDD throughout (RED-first, prove the failure, then implement):
1. Public-route seam. Add the `/r` base to `PUBLIC_ROUTES` in `route-access.ts`; extend
   its test so `/r/<token>` is public AND every other non-login route stays gated (prove
   no regression).
2. Gate cookie. Create `src/lib/report-link-session.ts`: mint + verify a signed, httpOnly,
   short-lived (≈2 h) cookie scoped to ONE token (HMAC over `{token, exp}` with a server
   secret read from `env`; add the var to the env schema). RED-first sign / verify /
   expiry / tamper-rejection.
3. Route + gate. `src/app/r/[token]/page.tsx`: if a valid gate cookie for THIS token
   exists → render the report view (step 5); else render the gate (`src/app/r/[token]/
   gate.tsx`). Emit `noindex` (robots meta / `X-Robots-Tag`) and `Referrer-Policy:
   no-referrer` on the route.
4. Gate action + lockout. The gate's server action calls `resolveReportLink(token, code)`:
   `ok` → set the gate cookie and redirect to the view; `invalid` → ONE generic error
   (never reveal whether the URL or the code was wrong); `locked` → a "try again later"
   message. Add a belt-and-suspenders app-layer attempt cap on top of the S1 DB lockout.
   RED-first: wrong code → error + no cookie; correct → cookie set; locked → lockout msg.
5. Client view. `src/components/report-link/public-report.tsx`: given the resolved
   `clientId`, call `buildClientReport` (NO new analytics read) and render the report
   SECTIONS inside a public wrapper that OMITS all staff chrome (ClientTabs, back-link,
   print button); keep the period picker; the truncation state is omitted or reworded
   into plain client language (no "read X of Y" dev-tell). RED-first: sections present,
   staff chrome ABSENT.
6. Report Status strip. `src/components/report-link/report-status.tsx`: freshness
   (`current as of` = latest Upload's scrape/capture date; `tracked since` = earliest
   Upload) + a plain NON-GRADED activity/trend line (from `cadence`: last-post age +
   posts in the last 30 days; impressions trend DIRECTION vs the prior period). Reuse
   figures already computed. RED-first: renders freshness + activity, contains NO
   grade/score/advice word (grep-guard `/\b(best|optimal|recommended?|top|score|grade)\b/i`
   over the rendered text), honest empty/low-N states.
7. Wire the view into the route behind the gate; run the full gate + mutations.

END GOAL / ACCEPTANCE
- `/r/<token>` is public; all other non-login routes stay gated (test proves both).
- Wrong Access Code → generic error, NO cookie; correct → signed gate cookie + the view;
  locked → lockout message. The cookie is signed, httpOnly, short-lived; tampering is
  rejected. No auth oracle (bad URL and bad code look identical).
- The route is noindex + no-referrer.
- The view renders the report sections and the Report Status strip; a test asserts
  `ClientTabs`/staff back-link/staff print button are ABSENT and no "read X of Y" banner
  shows. The Report Status strip contains no grade/score/advice word (grep-guarded).
- No new analytics DB read (reuses `buildClientReport`); the staff report page and the
  report section components are unchanged.
- Test count strictly up; no existing assertion weakened; every new test RED-first and
  mutation-verified.

VERIFICATION (the whole gate — nothing else)
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output pasted.
- Mutation table (real runs): (a) different errors for invalid-vs-wrong-code → the
  "no oracle" test fails; (b) skip the cookie signature check → the tamper test fails;
  (c) omit `/r` from PUBLIC_ROUTES → the route-access test fails (redirects to /login);
  (d) render `ClientTabs` in the wrapper → the "no staff chrome" test fails; (e) add a
  grade/score word to the status strip → the grep-guard test fails. Revert each after.
- Do NOT use Claude-in-Chrome, a dev server, or any browser/print walk — assert through
  route-access unit tests, pure cookie/gate logic, and component markup.

NARROWING / GUARDRAILS
- READ THE ACTUAL GIT STATE AT START and report it. Stay on the Report Links feature
  branch created in S1; never commit to `main`; build additively; SURFACE (never
  self-heal, rebase, or reset) any unexpected commit.
- LEAVE ALL WORK UNCOMMITTED for the user to review and commit.
- Fail closed everywhere. No Supabase service-role key. Never leak cross-Client data or
  staff chrome; never grade or advise — describe state only.
- Do NOT reimplement or modify S1's service/SQL, the S2 staff UI, the staff report page,
  or the report section components. If a change seems to need a file outside SCOPE, STOP
  and FLAG.
- Conventional Commits vocabulary only if later asked to commit; keep the tree green.

SCOPE — create/modify ONLY: `src/lib/route-access.ts` (+ test); `src/lib/
report-link-session.ts` (+ test); `src/app/r/[token]/page.tsx`; `src/app/r/[token]/
gate.tsx` (+ its action); `src/components/report-link/public-report.tsx` (+ test);
`src/components/report-link/report-status.tsx` (+ test); the env schema for the signing
secret. Nothing else.

REPORT BACK
- Git state at start (and whether S1 was present or you stubbed its seam, with the flag);
  files changed; final `git status --porcelain`.
- The cookie design (claims, TTL, signing) and the app-layer attempt cap you chose.
- What the wrapper omits vs keeps; the exact Report Status wording, with confirmation it
  contains no grade/advice term.
- Full gate output + the mutation table (real runs); test count before/after.
- FLAGS: how you handled truncation for clients; whether a client PDF download is wanted
  (deferred by the spec); anything you stopped short of, with the reason.
```

## Feedback & revisions

- **2026-07-25 — v1 emitted (prompt-architect, RISEN).** Consolidates S3+S4 into one
  client-facing handoff at Bryan's request. Runs after S1.
  _(Append dated entries as the executer reports back; edit the prompt in place if revised.)_

- **2026-07-25 — executer run: S1 was ABSENT, built S1→S3→S4 per Bryan's call.**
  On start the executer found the DEPENDENCY gate tripped: commit `7aaaf8c`
  ("implement client report links feature slices S1-S4") was **docs-only** — no
  `report-links.ts`, no `report_links` table/migration, no `ReportLink*` types, no
  `paths.reportLink`. Also flagged: the misleading commit message (surfaced, not
  self-healed) and that the "Report Links branch created in S1" never existed
  (work sits on `feat-additonal-features-for-linkedin-report`, the only branch
  that has the reused sections — Content composition + Posting cadence are not on
  `main`). Bryan chose **"Build S1 first, then S3/S4."**
  - **Built (all TDD, RED-first, uncommitted):** S1 — `supabase/report-links.sql`
    - migration twin + `REPORT-LINKS-APPLY.md` + `sql-sync` pair; `report-links.ts`
      service (issue/rotate/revoke/get/**resolve**, mocked-RPC tests); `ReportLink*`
      types; `paths.reportLink`. S3 — `/r` in `PUBLIC_ROUTES` (+ `/r`-vs-`/resources`
      collision guard); `report-link-session.ts` (signed httpOnly clientId-bound gate
      cookie + signed app-layer attempt cap); `env.server.ts` (first server secret,
      split per env.ts's own note); `/r/[token]/page.tsx` (noindex + no-referrer) and
      `gate.tsx` + `actions.ts`. S4 — `public-report.tsx` (reuses the sections, strips
      all staff chrome) + `report-status.tsx` (non-graded, grep-guarded).
  - **Key decisions:** `resolve_report_link` returns `jsonb {status, client_id}`
    (not bare uuid) to keep the TS `invalid|locked` split while both wrong-URL and
    wrong-code stay `invalid` (no oracle); the gate cookie **binds the resolved
    clientId** so the view needs no re-resolve/second read; a grep-guard test was
    hardened after a real `textContent`-abutment miss (join text nodes with spaces).
  - **Gate:** lint ✔, type:check ✔, test ✔ (750→**802**, 61→**68** files), build ✔.
    7/7 mutations caught. Work left UNCOMMITTED.
  - **FLAGS (open):** (1) **Anon read-path gap** — the public route is anonymous,
    but `getClientReport` reads `bi.*` + `uploads`, both RLS-restricted to
    `authenticated`; as anon it returns `unavailable`, so a real client sees the
    neutral "not available" state until a SECURITY-DEFINER-backed public read
    lands (a data-layer follow-up; NOT built here to respect scope). Gate/session/
    route/view/status are all real and tested regardless. (2) **S2 staff UI** (Create/
    Rotate/Revoke card) not built — issue/rotate/revoke exist as service + SQL; use
    the APPLY.md SQL smoke test to mint links meanwhile. (3) **Freshness** in the
    status strip is derived from the report's cadence dates, not upload scrape dates
    (surfacing true upload freshness would be a small additive change to
    `client-report.ts`, deliberately not made to stay in scope). (4) **SQL not
    applied** by the agent — staff apply `report-links.sql` per `REPORT-LINKS-APPLY.md`.
    (5) Client PDF download deferred (per spec).
