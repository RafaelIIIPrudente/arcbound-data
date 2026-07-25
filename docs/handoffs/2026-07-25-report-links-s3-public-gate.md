# Handoff — Report Links S3: public route + Access Code gate + rate-limit

- **Type:** Executer handoff (feature slice, S3 of 4)
- **Date:** 2026-07-25
- **Branch:** the Report Links feature branch created in S1
- **Status:** Run AFTER S1 lands — needs S1's `resolveReportLink`. Independent of S2.
- **Brief:** [spec §Slice S3](../specs/2026-07-25-client-report-links.md) + [ADR 0011](../adr/0011-client-report-links.md).

## Decision & rationale

The public `/r/<token>` route: gate on the out-of-band Access Code, set a short-lived
signed httpOnly cookie on success, and only then admit the viewer. Fail closed, never
reveal whether the URL or the code was wrong, and lock out on repeated failure. Adds
`/r` to the `PUBLIC_ROUTES` allowlist — the one non-login public app route.

## The handoff prompt (as emitted, verbatim)

> Paste the block below verbatim into a fresh executer session.

```text
ROLE
You are a world-class Next.js (App Router) + web-security engineer. You build public
gates that fail closed, give attackers no oracle (one generic error for a bad URL OR a
bad code), rate-limit and lock out brute force, and never index or leak a private page.
You read before you write; ⚠️ comments bind; RED-first; no silent scope widening; real
command output.

GOAL
Implement Slice S3: the public `/r/<token>` route with an Access Code gate, a
short-lived signed gate cookie, and rate-limit/lockout — the door in front of the client
report view (S4).

CONTEXT — read FIRST:
- `docs/specs/2026-07-25-client-report-links.md` §"Global Constraints" + §"Slice S3" —
  your step brief.
- `docs/adr/0011-client-report-links.md` — the security posture (URL + Access Code;
  hashed code; lockout; noindex/no-referrer; viewer is NOT an authenticated user).
- `src/lib/route-access.ts` — the `PUBLIC_ROUTES` / `isPublicRoute` seam you extend, and
  its test. `src/middleware.ts` — how it applies `routeAccess` + CSP (do not fight it).
- `src/services/report-links.ts` AS COMMITTED by S1 — use its real `resolveReportLink(
  token, code)` returning `{ok:true, clientId}` | `{ok:false, reason:"invalid"|"locked"}`.

KEY REQUIREMENTS:
- Add the `/r` base to `PUBLIC_ROUTES`; extend `route-access.ts`'s test so `/r/<token>`
  is public and every other non-login route STAYS gated (prove no regression).
- `src/lib/report-link-session.ts`: mint + verify a signed, httpOnly, ~2h gate cookie
  scoped to ONE token (HMAC over `{token, exp}` with a server secret from `env`; add the
  var to the env schema). TDD sign / verify / expiry / tamper-rejection.
- `/r/[token]/page.tsx`: valid gate cookie for THIS token → render the report view
  (import the S4 component; stub/placeholder acceptable if S4 not yet landed, and FLAG
  it); else render the gate. Set `noindex` (robots meta / `X-Robots-Tag`) and
  `Referrer-Policy: no-referrer` for the route.
- Gate + server action: submit → `resolveReportLink(token, code)`. `ok` → set the gate
  cookie, redirect to the view. `invalid` → ONE generic error (never reveal which of
  URL/code failed). `locked` → a "try again later" message. Add a belt-and-suspenders
  app-layer attempt cap on top of the DB lockout.

SCOPE — create/modify ONLY: `src/lib/route-access.ts` (+ test), `src/app/r/[token]/
page.tsx`, `src/app/r/[token]/gate.tsx` (+ its action), `src/lib/report-link-session.ts`
(+ test), and the env schema for the signing secret. Do NOT touch the S1 service/SQL,
the staff UI (S2), or the report sections. If a change needs a file outside this, STOP
and FLAG.

APPROACH — skills: `test-driven-development` (session sign/verify + gate decision logic
RED-first, RPC seam mocked); `verification-before-completion`. Follow the spec's S3
checklist.

ACCEPTANCE
- `/r/<token>` is public; all other non-login routes remain gated (test proves both).
- Wrong code → generic error, NO cookie; correct code → gate cookie set + redirect;
  locked → lockout message. Cookie is signed, httpOnly, short-lived; tampering rejected.
- The route is noindex + no-referrer. No auth oracle (URL-wrong and code-wrong look
  identical). Test count strictly up; no existing assertion weakened.

VERIFICATION
- `pnpm lint && pnpm type:check && pnpm test && pnpm build`, real output.
- Mutation table (real runs): (a) different errors for invalid-vs-wrong-code → the
  "no oracle" test fails; (b) skip cookie signature verification → the tamper test
  fails; (c) forget to add `/r` to PUBLIC_ROUTES → the route-access test fails (it
  would redirect to /login).
- No Claude-in-Chrome / dev-server walk — assert through pure logic + route-access unit
  tests.

GUARDRAILS
- READ THE GIT STATE AT START and report it; stay on the Report Links feature branch;
  never commit to `main`; SURFACE unexpected commits; build additively on S1.
- LEAVE ALL WORK UNCOMMITTED. Fail closed everywhere. No service-role key.
- Conventional Commits only if later asked; keep the tree green.

REPORT BACK
- Git state at start; files changed; final `git status --porcelain`.
- The cookie design (claims, TTL, signing) and the app-layer attempt cap you chose.
- Gate output + mutation table; test count before/after.
- FLAGS: whether S4 existed yet (and what you stubbed); any drift from S1's committed
  `resolveReportLink`; anything you stopped short of.
```

## Feedback & revisions

- **2026-07-25 — v1 emitted.** Authored from the spec; to run after S1 (independent of
  S2). Verify S1's committed `resolveReportLink` before running.
  _(Append dated entries as feedback arrives; edit the prompt in place if revised.)_
