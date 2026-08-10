# Handoff — Arcbound Services S1: the data model (INERT)

**Date:** 2026-08-02
**Branch:** `feat--implement-RBAC` (or a fresh branch off it — see Guardrails)
**Shaping doc:** [`docs/decisions/2026-08-02-arcbound-services-registry.md`](../decisions/2026-08-02-arcbound-services-registry.md)
**Slice:** S1 of five (S1 data model · S2 Settings screen · S3 per-client assignment · S4 `/upload` reshape · S5 client tabs).
**Status:** 🟡 emitted, not yet run.

**Why this lands inert.** Nothing reads the registry in S1. Tables, guards, seed
and backfill exist and are applied, and every screen keeps behaving exactly as it
does today. The schema gets verified against the live database before anything
depends on it — the same shape as RBAC S1, which is the reason the zero-admin seed
failure was caught before it could break a screen.

---

## The prompt as issued

```
ROLE

You are a world-class Postgres and TypeScript engineer whose defining trait is
that you never let a schema assert something the data cannot back up. You know
the difference between a row that says "this Client receives this service" and a
row that says "somebody ran a migration", and you only write the first kind. You
treat a seed that matches zero rows as a bug, not a no-op, and you finish every
apply with a query that proves what happened.

Working style, binding:
- READ BEFORE WRITE. Verify every fact below; if one is wrong, STOP and report it.
- ⚠️ comments in this codebase are BINDING CONSTRAINTS. Never delete or weaken one.
- RED-first (superpowers:test-driven-development) for everything testable.
- DO NOT WIDEN SCOPE. If a change needs a file outside Scope, STOP and FLAG.
- Report honestly with real command output, and be explicit about what CANNOT be
  verified without a live database.

GOAL

Create the Arcbound Services data model — a registry of the services Arcbound
sells, plus which Services each Client receives — and land it COMPLETELY INERT.
No screen reads it. No existing behaviour changes. `/upload`, the client pages,
and the settings pages must all render exactly as they do today.

CONTEXT

The repo IS ArcBase: an internal, auth-gated, single-tenant Next.js app. Read
`AGENTS.md` and `CONTEXT.md` first.

Arcbound sells services to its Clients. Two of them have real ingestion pipelines
in this codebase — LinkedIn post metrics and the Outreach System — and both are
currently HARD-CODED: `/upload` renders two literal tabs, and every Client shows
all four detail tabs whether or not Arcbound does that work for them. This
workstream makes the registry data instead of code. This slice builds the data.

THE CENTRAL RULE, WHICH EVERY OTHER DECISION FOLLOWS FROM:

    VISIBILITY IS DATA. CAPABILITY IS CODE.

A Service row carries a `handler` naming an ingestion pipeline that EXISTS in
code. The set of valid handlers is a code-side constant; admins choose from it and
can never invent one. A Service with NO handler is a real, listed offering — it
appears on the Client, it is countable and reportable — but it has no upload path
and no data tab, and the UI will say so plainly in a later slice. "Has a pipeline"
and "listed but not ingestible" must never collapse into one another, exactly as
"absent" never collapses into "zero" anywhere else in this product.

REPO FACTS YOU MUST USE (verify each):

1. **⚠️ THE WORD "SERVICE" IS ALREADY TAKEN, TWICE OVER, AND YOU MUST NOT MAKE IT
   WORSE.** `CONTEXT.md` defines **Service Seam** as "the boundary between the UI
   and its data source", and `src/services/` is that seam's directory. The new
   concept is an *Arcbound offering*. Therefore:
     • the service-seam module is `src/services/arcbound-services.ts`, NEVER
       `src/services/services.ts`;
     • the TypeScript type is `ArcboundService`, never bare `Service`;
     • `CONTEXT.md` gets an explicit disambiguation (see Scope).
   This repo already carries one unresolved collision of exactly this kind — two
   different "Admin"s, an Engineer/Admin and a Staff Role — recorded as an open
   glossary defect. Do not add a second.
2. `supabase/outreach-system.sql` is your closest precedent for a new table: a
   `create table if not exists`, `enable row level security`, a
   `<table>_select_authenticated` policy, deliberately NO write policies, and all
   writes through `SECURITY DEFINER` functions. Follow its comment density too —
   that file explains WHY every choice was made.
3. EVERY SCHEMA CHANGE IS TWO FILES held identical on executable SQL by
   `supabase/sql-sync.test.ts` via its `PAIRS` array. Latest existing timestamp is
   `20260802140000`. Use `20260802150000` and register the new pair.
4. `public.is_admin()` exists: `stable`, `security definer`, granted to
   `authenticated`, true only for a caller with an admin row in
   `public.staff_roles`. Guard admin-only functions with it, exactly as
   `supabase/staff-roles-admin.sql` guards `list_staff()`.
5. `public.clients` columns are `id` (uuid), `name`, `linkedin_url`, `created_at`.
   ⚠️ It has NO migration in this repo — it was created out-of-band. Reference it;
   never alter it.
6. `public.uploads` has `client_id`; `public.outreach_uploads` has `client_id`
   (see `supabase/outreach-system.sql`). These two tables are how the backfill and
   the reference counts are derived.
7. ⚠️ **`staff_roles.updated_at` HAS NO TRIGGER**, and the same will be true here.
   Any function that mutates a row must set `updated_at = now()` explicitly or the
   column will lie.
8. ⚠️ **`create or replace` REPLACES A FUNCTION WHOLE.** One definition per
   function, in one file, always current. A second definition elsewhere leaves a
   stale version that silently wins on the wrong apply order.

SCOPE

CREATE — SQL twins `supabase/arcbound-services.sql` AND
`supabase/migrations/20260802150000_arcbound_services.sql`, byte-identical on
executable SQL, and register the pair in `supabase/sql-sync.test.ts` `PAIRS`.

  TABLE `public.services`
    id          uuid primary key default gen_random_uuid()
    slug        text not null unique
    name        text not null
    description text
    handler     text     -- NULL, or one of the two code-backed pipelines
    status      text not null default 'active'
    sort_order  int  not null default 0
    created_at  timestamptz not null default now()
    updated_at  timestamptz not null default now()

    check (handler is null or handler in
             ('linkedin_post_metrics','outreach_prospects'))
    check (status in ('active','archived'))

    ⚠️ PARTIAL UNIQUE INDEX ON `handler` WHERE `handler IS NOT NULL`. Two Services
    both claiming `linkedin_post_metrics` would render two identical upload tabs
    writing to the same table, and nothing downstream could tell them apart.
    NULL handlers must stay freely duplicable — "no pipeline" is not an identity.

  TABLE `public.client_services`
    client_id  uuid not null references public.clients(id) on delete cascade
    service_id uuid not null references public.services(id)   -- NO cascade
    created_at timestamptz not null default now()
    created_by uuid references auth.users(id)
    primary key (client_id, service_id)

    ⚠️ NO `on delete cascade` ON `service_id`, DELIBERATELY. The FK's default
    RESTRICT is what makes the delete guard real: a Service that any Client holds
    cannot be deleted even if the application layer is bypassed. Comment this.

  RLS on both: enable, plus `<table>_select_authenticated`
  (`for select to authenticated using (true)`). NO insert/update/delete policies —
  writes go only through the SECURITY DEFINER functions below. Mirror
  `outreach_uploads`.

  FUNCTIONS — all `security definer`, `set search_path = public`, each opening
  with the S2 guard, each `revoke all … from public` + `grant execute … to
  authenticated`:

      if not public.is_admin() then
        raise exception 'admin role required' using errcode = '42501';
      end if;

    • create_service(p_name text, p_slug text, p_description text,
                     p_handler text) returns uuid
    • update_service(p_id uuid, p_name text, p_description text,
                     p_sort_order int)
      ⚠️ NO `p_handler`. THE HANDLER IS SET AT CREATION AND IS IMMUTABLE.
         Repointing a live Service at a different pipeline would silently
         reinterpret every existing engagement's data. To change it, archive and
         create a new one. Record this reasoning in a comment.
    • set_service_status(p_id uuid, p_status text)   -- archive / restore
    • delete_service(p_id uuid)
      Refuses when ANY `client_services` row references it, raising a message
      naming the count, errcode '23503'. Hard-delete is a typo eraser only.
    • set_client_services(p_client_id uuid, p_service_ids uuid[])
      Replaces the whole set for one Client (idempotent). Stamps `created_by` from
      `auth.uid()`.
    • list_services_admin() returns table(... , client_count bigint,
                                          upload_count bigint, can_delete boolean)
      ⚠️ `upload_count` IS DERIVED FROM THE HANDLER, NOT FROM A COLUMN. There is
      no `service_id` on `uploads` and this workstream does not add one (that
      would change the `ingest_metrics` signature, which requires DROP FUNCTION
      first — a documented trap in this repo). Map
      `linkedin_post_metrics` → count of `public.uploads`,
      `outreach_prospects`   → count of `public.outreach_uploads`,
      NULL handler           → 0. Comment the mapping and why it is not a join.

  SEED — exactly the two code-backed Services, idempotent
  (`on conflict (slug) do nothing`):
      ('linkedin-growth',  'LinkedIn Growth',  'linkedin_post_metrics', 10)
      ('outreach-system',  'Outreach System',  'outreach_prospects',    20)

  BACKFILL — derived from data that already exists, so every assignment states
  something TRUE:

      insert into public.client_services (client_id, service_id)
      select distinct u.client_id, s.id
        from public.uploads u, public.services s
       where s.slug = 'linkedin-growth'
      union
      select distinct o.client_id, s.id
        from public.outreach_uploads o, public.services s
       where s.slug = 'outreach-system'
      on conflict do nothing;

  ⚠️ END THE SCRIPT WITH VERIFICATION QUERIES, EACH ON ITS OWN, IN A COMMENT
  BLOCK LABELLED "RUN THESE ONE AT A TIME". Two reasons, both learned the hard
  way in this repo: an `insert … select … where …` that matches nothing is a
  SILENT NO-OP (a seed against a non-existent email once left ArcBase with no
  admin at all, reporting no error), and **the Supabase SQL editor renders only
  the LAST statement's result set**, so a multi-statement verification block hides
  everything above it. At minimum:
      select slug, name, handler, status from public.services order by sort_order;
      select count(*) from public.client_services;
      select count(distinct client_id) from public.uploads;
      select count(distinct client_id) from public.outreach_uploads;
  State in a comment what the second must equal (the sum of the third and fourth,
  minus any Client appearing in both).

CREATE — `src/services/arcbound-services.ts` + its test. The service-seam face of
the above: typed reads via plain `.from("services").select()` /
`.from("client_services").select()` (RLS already permits authenticated SELECT), and
typed RPC wrappers for the six functions. Follow `src/services/staff.ts` exactly,
including its discipline of NOT re-implementing a database invariant in TypeScript
— the delete guard lives in the function body and this module only reports what it
said.

MODIFY — `src/services/types.ts`: add `ArcboundService`, `ServiceHandler`, and
`ClientServiceAssignment`. Document on the type, not in a commit message, that a
NULL handler is a real state meaning "listed offering, no pipeline" and is not an
error or an absence.

MODIFY — `CONTEXT.md`: add **Arcbound Service**, **Handler**, and **Engagement**
to the Domain section, and add one sentence to the existing **Service Seam** entry
disambiguating the two senses of "service" (fact 1).

CREATE — `docs/adr/0015-arcbound-services-registry.md`. (Verify 0014 is the
highest existing number; `docs/adr/0014-arcbase-staff-invitations.md` should
exist. If not, use the next free number and FLAG it.) It must record:
  • The capability-bound model and the "visibility is data, capability is code"
    rule, with the reason a registry alone cannot make a pipeline.
  • That this is the FIRST mutable, deletable entity in ArcBase — `CONTEXT.md`
    says Clients and Uploads are never edited or deleted, Posts change only
    through re-ingestion, and Resources carries an explicit "no update or delete"
    comment. Say plainly that Services deliberately breaks that streak, and that
    archive-not-delete is how the break is contained.
  • The honest cost: once `/upload` filters by Services (S4), a Client with no
    Services has NO upload path. The derived backfill is what stops that being a
    silent outage on day one.
  • That it does NOT supersede the deferred Service→Dataset north star recorded in
    `docs/decisions/2026-07-27-multi-service-dashboard-and-connection-count.md` —
    this builds the Service level only.

DO NOT TOUCH: `/upload` and anything under `src/components/dashboard/ingest/`,
`client-tabs.tsx`, any client page, any settings page, `nav-config.ts`,
`src/paths.ts`, `src/middleware.ts`, `src/lib/auth/*`, `ingest_metrics`,
`ingest_outreach`, `public.uploads`, `public.clients`, the report-link functions,
or the `bi.*` views. THIS SLICE CHANGES NO SCREEN.

APPROACH

1. Report real git state. RBAC S5 is uncommitted and is NOT yours; S1–S3 are
   committed (`f379882`, `50f65c8`). Surface, never rewrite, any commit you did
   not make.
2. Capture the `pnpm test` baseline count first.
3. SQL twins → `sql-sync` registration → types → service seam → CONTEXT.md → ADR.
4. Mutation-verify and report what went red:
   • Drop the partial unique index on `handler` — a SQL source test must fail.
   • Make `delete_service` succeed when a `client_services` row references it — a
     test must fail.
   • Remove `updated_at = now()` from `update_service` — a test must fail.

ACCEPTANCE CRITERIA

- `pnpm dev` renders `/upload`, `/clients/<id>`, and `/settings` IDENTICALLY to
  before. This slice is inert; if any screen changed, you widened scope.
- The SQL twins are byte-identical on executable SQL and registered in `PAIRS`.
- Every mutating function is guarded by `is_admin()` AND sets `updated_at`.
- `handler` is immutable after creation — `update_service` has no handler param.
- A partial unique index prevents two Services sharing a non-null handler, while
  allowing many NULL handlers.
- `client_services.service_id` has NO cascade, so the FK enforces the delete guard
  independently of the application layer.
- The script ends with verification queries marked to be run ONE AT A TIME.
- Nothing in `src/` imports the new seam module yet except its own test.
- `CONTEXT.md` disambiguates Arcbound Service from Service Seam.
- Gate green; test count strictly up; no existing assertion weakened or deleted.

VERIFICATION

Run and paste real output:

    pnpm lint && pnpm type:check && pnpm test && pnpm build

Verification is the automated gate plus unit tests ONLY. DO NOT use
Claude-in-Chrome, a dev server walkthrough, or any live-browser runtime walk.

⚠️ **NO POSTGRES RUNS IN THIS TEST SUITE.** Your SQL tests are SOURCE assertions —
they check that the script SAYS the right thing, not that the database DOES it.
The guards, the constraints, the seed and the backfill are all unverified until a
human applies the script. SAY THIS EXPLICITLY in your report. Do not let a green
gate imply the schema works.

GUARDRAILS

- DO NOT APPLY THE SQL. No `db push`, no `supabase` CLI, no database connection.
  A human applies it by pasting into the Supabase SQL editor.
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
5. The `services` and `client_services` DDL, verbatim, so the constraints can be
   checked by eye.
6. The verification queries you appended, and what each one must return for the
   apply to be considered successful.
7. What the three mutation checks broke, and that you restored them.
8. FLAGS: anything in this brief wrong about the repo, anything you decided that
   it did not settle, and an explicit statement that no SQL behaviour is verified
   by the gate.
```

---

## Feedback & revisions log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-02 | Emitted. Not yet run by an executer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-08-02 | 🟢 **LANDED, planner-verified.** `pnpm test` → **107 files / 1,625 tests, exit 0** (baseline 105 / 1,569). SQL twins re-diffed with comments stripped: **identical**. Inertness re-checked: `arcbound-services` appears nowhere in `src/` outside its own module and test (one doc-comment mention in `types.ts`). All three mutation checks went red and were restored. **SQL NOT APPLIED** — awaiting a human paste.                                                                                                                                                                                                                     |
| 2026-08-02 | **The brief was wrong about git state; the executer was right.** It claimed RBAC S5 was uncommitted. In fact `ed817fb` (authored by RafaelIIIPrudente, 16:08) carries **S4 and all of S5** — including `supabase/functions/invite-staff/index.ts`, ADR 0014, and both RBAC handoff docs — under the message _"feat: add Settings nav item and update navigation tests"_, which names roughly a tenth of its contents. Recorded so a future session does not trust that message.                                                                                                                                                            |
| 2026-08-02 | **The executer's glossary FLAG was itself wrong, and the brief was right.** It reported the Engineer/Admin vs Admin-Staff-Role collision as "not recorded anywhere". It IS recorded twice in `docs/decisions/2026-08-02-rbac-admin-and-data-analyst.md` (lines 269 and 283) as an open item; the executer checked only `CONTEXT.md`. Re-recording it in ADR 0015 is additive and harmless. **Lesson for later briefs: say WHERE a fact is recorded, not just that it is.**                                                                                                                                                                 |
| 2026-08-02 | **Two executer calls the brief did not settle, both correct and both kept.** (a) `create_service` wraps inputs in `nullif(trim(…), '')` because an HTML form posts an unset optional field as `''`, not `NULL` — without it the most common case (no pipeline) is rejected by the handler CHECK. (b) `set_client_services` needs an explicit `p_service_ids is null` branch, because **`service_id <> all(null)` evaluates to NULL, not true** — so clearing a Client's services would have touched no rows and raised nothing. Same silent-no-op family as the S1 seed; invisible until someone noticed a removed service still attached. |
| 2026-08-02 | The executer also cross-referenced the **Immutability** entry in `CONTEXT.md`, which Scope did not name. The entry was not false (it lists only Clients, Uploads, Posts) but invited the inference that ArcBase records are immutable generally, which Services now breaks. Correct call.                                                                                                                                                                                                                                                                                                                                                  |
