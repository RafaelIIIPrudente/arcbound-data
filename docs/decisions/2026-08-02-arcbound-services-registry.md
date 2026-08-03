# Decision — Arcbound Services: an admin-managed, capability-bound service registry

- **Type:** Shaping / decision record (planning session, `/grill-with-docs`)
- **Date:** 2026-08-02
- **Branch at shaping time:** `feat--implement-RBAC` (RBAC S1–S5 landed; S5 uncommitted)
- **Session role:** Planner (shape + `/handoff`; no implementation here).
- **Status:** 🟢 **SHAPED** — D1–D9 settled. S1 handoff emitted; S2–S5 to follow.

## Origin

Immediately after the RBAC invite-staff slice (S5) landed, Bryan wrote:

> "implemented! I want to add here also Arcbound Services which the admin can
> CRUD. under the settings, let's add Services."

…attached to a screenshot of `/settings/roles`, i.e. the new Services screen is a
sibling of Staff Roles under Settings. A follow-up message added the two surfaces
that consume it:

> "this is where we can add the selection of services per client and also in the
> uploads … the selection in the ingestion appears if they have that service"

…attached to a screenshot of `/upload` showing the hard-coded
`[LinkedIn Metrics] [Outreach System]` tabs sitting **above** step 01 "Select
client".

## Repo facts established before any question was asked

| #   | Fact                                                                                                                                                                                                                                                                                                                  | Where                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| F1  | **"Service" is already a settled ArcBase term, and it is Bryan's own word.** The Service → Dataset → Scrape → Upload → rows model was shaped on 2026-07-27 and deliberately kept OUT of `CONTEXT.md` because it was not built: "they graduate to the glossary when the reshape ships."                                | `docs/decisions/2026-07-27-multi-service-dashboard-and-connection-count.md` |
| F2  | **The two live Services are code, not data.** `/upload` hard-codes the two tabs; each has bespoke parsing, a bespoke RPC, and a bespoke dashboard.                                                                                                                                                                    | `src/components/dashboard/ingest/upload-tabs.tsx`                           |
| F3  | **Nothing links a Client to a Service.** `Client` is `{ id, name, linkedin_url, createdAt, postsCount }`.                                                                                                                                                                                                             | `src/services/types.ts:13`                                                  |
| F4  | **`/settings` is deliberately unguarded**, and only the Staff Roles _link_ is role-aware. A ⚠️ block explains why: guarding the page to hide one panel would lock analysts out of their own profile and password. Services therefore gets **its own route**, exactly as roles did.                                    | `src/app/(app)/settings/page.tsx`                                           |
| F5  | **ArcBase has no mutable, deletable entity today.** Clients, Uploads, Posts and Outreach Snapshots are immutable by rule; the only CRUD in the repo (`customers.ts`, `resources.ts`) is mock, in-memory template leftovers, and Resources carries "IMMUTABLE (SRS OI-05): there is deliberately no update or delete." | `CONTEXT.md`, `src/services/resources.ts`                                   |
| F6  | **Add Client is already admin-only.** RBAC S2 put `requireAdmin()` on `createClientAction` and `is_admin()` on the `arcbase add clients` policy — so whoever registers a Client may also assign its Services.                                                                                                         | `src/app/(app)/clients/actions.ts:41`                                       |
| F7  | **Twin-SQL convention**: every schema change is a paste script `supabase/<name>.sql` plus a CLI twin `supabase/migrations/<ts>_<name>.sql`, held identical on executable SQL by `supabase/sql-sync.test.ts` via `PAIRS`. Latest timestamp: `20260802140000`.                                                          | `supabase/sql-sync.test.ts`                                                 |
| F8  | Admin governance actions follow the S2 pattern: `requireAdmin()` in the Server Action **outside any `try`** (it denies by throwing), plus an independent DB-side guard.                                                                                                                                               | `src/app/(app)/clients/[id]/report-link-actions.ts`                         |

## Decisions

### D1 — A Service record drives the upload/dashboard wiring

Rejected: a purely descriptive catalogue; a per-Client-only engagement record.

**Planner's concern, stated once and overruled:** ArcBase can ingest exactly two
shapes today, both with bespoke parsers and RPCs, so a registry that "drives the
wiring" can produce a tab that leads nowhere. Bryan chose it anyway. D2 is how
that is made honest rather than a reason to shrink the feature.

### D2 — Capability-bound: a Service with no pipeline says so

A Service row carries a **`handler`** naming a pipeline that **exists in code**
(`linkedin_post_metrics`, `outreach_prospects`, or **none**). With no handler the
Service is a real, listed offering — visible on the Client, countable, reportable
— but shows **no upload tab and no data tab**, and states why.

```
SERVICES
───────────────────────────────────────
LinkedIn Growth      Post Metrics    ● active
Outreach System      Prospects       ● active
Podcast Production    — no pipeline  ● active

/upload tabs:  [LinkedIn Metrics] [Outreach System]
               (Podcast Production: no upload path)

Client detail: Podcast Production listed as an
engagement; tab reads "No data pipeline yet."
```

**Visibility is data. Capability is code.** The handler set is a code-side
constant; admins choose from it, never invent one.

This is the four-state honesty discipline applied to services: _"has a pipeline"_
and _"listed but not ingestible"_ must never collapse into one another, exactly as
_absent_ never collapses into _zero_ elsewhere in this product.

### D3 — Services attach to Clients, and `/upload` puts the Client first

A Client has a set of Services (`client_services`). `/upload` shows only the
Services that Client actually has — which **inverts the page's current
dependency**, since the tabs presently sit above the client picker.

```
01  SELECT CLIENT
    [ Choose a client…        ▾ ]

02  SELECT SERVICE
    ─ no client chosen ─
    Choose a client to see their services.

─── after choosing "Jane Doe" ───

02  SELECT SERVICE
    [LinkedIn Metrics]        ← she has this
                              (no Outreach tab —
                               not signed up)

03  CHOOSE INPUT   …
```

Rejected: keeping the tabs on top and filtering the _client list_ instead;
rendering every tab with non-subscribed ones disabled.

**Accepted cost, recorded deliberately:** this re-orders a screen analysts use
weekly. Every step number shifts by one. That is a chosen price for making the
dependency visible, not an incidental side effect.

**Immutability is not violated.** `CONTEXT.md` says Clients are never edited;
`client_services` is a separate relation, so assigning a Service does not mutate
the Client row.

### D4 — Backfill is derived from data already in the database

Every existing Client has zero Services, and D3 makes Services a precondition for
uploading. A migration that leaves the join table empty would silently disable the
weekly upload for every Client — the same shape as the RBAC S1 zero-admin seed,
with a larger blast radius.

A Client gets a Service **iff they already have data for it**:

```sql
insert into client_services (client_id, service_id)
select distinct u.client_id, s.id
  from uploads u, services s
 where s.slug = 'linkedin-growth'
union
select distinct o.client_id, s.id
  from outreach_uploads o, services s
 where s.slug = 'outreach-system';
```

Every assignment therefore states something **true**: Arcbound has actually
delivered that service to that Client. Registered-but-never-uploaded Clients get
nothing, and an admin assigns on first use (cheap, per F6).

Rejected: blanket-assigning both Services to everyone (asserts engagements that do
not exist); treating "no Services" as "all Services" (collapses _not configured_
into _signed up for everything_).

⚠️ **The apply step must END with a verification query**, per the S1 lesson that an
`insert … select … where …` matching nothing is a silent no-op:
`select count(*) from client_services;` against
`select count(distinct client_id) from uploads;`.

### D5 — Archive always; hard-delete only when nothing references it

Two distinct actions, because Services is the first destroyable entity in ArcBase
(F5) and history will point at it.

- **Archive** retires a Service: it vanishes from pickers and upload tabs, while
  existing Client assignments and upload history keep pointing at it. Nothing is
  destroyed. Reversible via Restore.
- **Delete** is offered **only** when no Client has it and no upload used it — a
  typo eraser. Otherwise the control explains what references it rather than
  failing.

```
Podcast Production        ● active
  0 clients · no uploads
  [ Archive ]  [ Delete ]

Outreach System           ● active
  6 clients · 41 uploads
  [ Archive ]  [ Delete ]  ← disabled
     "Used by 6 clients and 41 uploads.
      Archive it instead — history keeps
      pointing at it."

LinkedIn Growth          ○ archived
  9 clients · 214 uploads
  [ Restore ]
  Hidden from pickers. History intact.
```

Rejected: archive-only with no delete at all (a typo lives forever); hard delete
with a confirm dialog (the past changes because someone tidied a list).

### D6 — Client detail tabs filter too; no-pipeline Services live on Overview

`Overview` is always present. `Posts` and `LinkedIn Report` appear only if the
Client has a `linkedin_post_metrics` Service; `Outreach` only if they have
`outreach_prospects`. A Service with **no** handler is listed on Overview under
**Engagements** rather than claiming its own tab — so the tab row stays short
however many offerings Arcbound adds.

```
JANE DOE
OVERVIEW   POSTS   LINKEDIN REPORT
──────────────────────────────────────
(no Outreach tab — not signed up)

ENGAGEMENTS
  LinkedIn Growth        · Post Metrics
  Podcast Production     · no pipeline yet

─── direct URL /clients/jane/outreach ───
Jane Doe is not signed up for Outreach
System. Assign it in Settings → Services.
```

Direct URLs still resolve — this is **not** a security boundary, and staff may
legitimately want to look. The route states the truth instead of rendering data.

⚠️ **THIS FIXES AN EXISTING HONESTY BUG.** `client-tabs.tsx` renders all four tabs
unconditionally today, so a Client Arcbound has never run outreach for still gets
an Outreach tab loading an **empty funnel** — which reads as _"we ran outreach and
got nothing"_ rather than _"we don't do outreach for them."_ That is the
absent-vs-zero collapse this repo refuses everywhere else, currently in production.

Rejected: giving every Service its own tab including no-pipeline ones (tab row
grows unboundedly, and tabs exist to announce nothing is there); leaving the
Client tabs alone this round (the Client page would keep contradicting `/upload`
about what Services a Client has).

### D7 — Code backstops the table; archiving a live pipeline is loud

Three ways the registry could take the weekly upload offline: the read fails, the
table is empty after a bad apply, or an admin archives a code-backed Service.

```
READ OK, both active:
  [LinkedIn Metrics] [Outreach System]

READ OK, Jane has only LinkedIn:
  [LinkedIn Metrics]

READ FAILED / TABLE EMPTY:
  [LinkedIn Metrics] [Outreach System]
  ⚠ Service registry unavailable — showing
    built-in defaults.

ARCHIVE "LinkedIn Growth":
  ⚠ This removes the LinkedIn upload path
    for all 9 clients and hides Posts and
    LinkedIn Report on every client page.
    Existing data is untouched.
    Type LINKEDIN GROWTH to confirm.
```

**The ability to ingest never depends on a table read succeeding.** Archiving a
code-backed Service stays possible — Arcbound may genuinely retire one — but
behind a typed confirmation matching the Service name exactly, and a sentence
naming the blast radius.

Rejected: making code-backed Services permanently un-archivable (safest, but
retiring one would need a SQL edit); no backstop at all (a silent no-op apply
darkens ingestion with no error — the exact failure that cost ArcBase its only
admin during RBAC S1).

### D8 — Planner's calls (stated, not asked; vetoable)

1. **Reads for everyone, writes admin-only.** Analysts upload, and `/upload` now
   filters by `client_services`, so an analyst must be able to READ services and
   assignments. Only mutations carry `requireAdmin()` plus a DB-side `is_admin()`
   guard. Exact parallel to `staff_roles`.
2. **No `service_id` column on `uploads`.** D5's reference count is derivable from
   the handler→table mapping (`linkedin_post_metrics` → `uploads`,
   `outreach_prospects` → `outreach_uploads`). Adding the column would change the
   `ingest_metrics` signature, which per the 2026-07-27 runbook requires
   `DROP FUNCTION` first plus a full re-create of the live body — real risk, no
   benefit this round. The Service→**Dataset** discriminator stays deferred.
3. **Seeded names: "LinkedIn Growth" (`linkedin-growth`) and "Outreach System"
   (`outreach-system`).** Once the registry supplies the `/upload` tab label, the
   current "LinkedIn Metrics" tab reads "LinkedIn Growth" — a _dataset_ name
   giving way to a _service_ name, consistent with F1's vocabulary. Renameable in
   the UI on day one.

### D9 — Five sequenced slices, S1 inert

```
S1  Data model          — INERT
    services + client_services, RLS,
    admin RPCs, seed + derived backfill

S2  Settings → Services
    CRUD screen, archive/restore,
    delete-guard, blast-radius confirm

S3  Per-client assignment
    Add Client form + Client detail

S4  /upload reshape
    client-first order, tabs from
    registry, fallback banner

S5  Client tabs + Overview engagements
    filtering, honest direct-URL states
```

S1 lands **completely inert** — tables, guards, seed and backfill exist but no
screen reads them — so the schema is applied and verified before anything depends
on it. The `/upload` re-order (D3's accepted cost) is isolated in S4, reviewable
on its own.

Rejected: three larger slices (the `/upload` re-order would ride along with the
client-tab work); two slices (schema would land already wired to screens).

### D10 — A Client with no Services gets no tabs, and assigns them inline

**Asked after S3 landed, once a trap in S1's backfill became visible.**

The backfill attributes Services only to Clients that ALREADY have rows in
`uploads` / `outreach_uploads`:

```sql
select distinct u.client_id, s.id from public.uploads u, public.services s
 where s.slug = 'linkedin-growth'
union
select distinct o.client_id, s.id from public.outreach_uploads o, public.services s
 where s.slug = 'outreach-system'
```

Correct as far as it goes — but a Client registered and **never uploaded to gets
nothing**. Once `/upload` filters by assigned Services, that Client has no upload
path at all. And that is exactly the _first upload_ case, which every Client
passes through once. S3 closed it going forward (assign at registration); every
Client registered before S3 is exposed.

**Chosen:** `/upload` shows no pipeline tabs for such a Client, states the fact
plainly, and renders the assignment checkboxes **right there**, reusing S3's
`setClientServicesAction`. Staff fix it in place and carry on.

Rejected: linking out to the Client's Overview (turns every first upload into a
two-page detour mid-routine); showing all tabs with a notice (the registry would
then gate nothing, and D3/D6 lose their point — the tabs would say one thing and
the Client's record another).

### D11 — An archived Service a Client still holds KEEPS its upload tab

The S3 archived-Service question, pushed into the capability layer: a Client
holds `Outreach System`, an admin has since archived it. Does the tab appear?

**Chosen:** yes, rendered and labelled `ARCHIVED`, with the tab body saying the
Service is archived but still assigned so uploads for the existing engagement
work.

The engagement is live until someone un-assigns it, and D5 made archiving
explicitly non-destructive. Hiding the tab would let a registry-level retirement
overrule a fact about the Client, and would silently strip a live engagement of
its upload path with no signal but a tab that is no longer there — the exact
absent-vs-zero failure this product refuses everywhere else. A final scrape still
lands.

Rejected: hide it (silent capability loss); hide it with a notice (honest about
the absence, but still leaves a live engagement unable to record a final scrape).

### D12 — Planner's calls for S4 (stated, not asked; vetoable)

- **Unreadable registry → render BOTH pipeline tabs, with a notice.** Follows
  directly from D7's "code backstops the table". The alternative takes the entire
  weekly ingestion routine offline over an unapplied migration — which is the live
  state of this repo right now.
- **The page owns the Client selection, presented as Step 01;** the two forms
  renumber their own steps to start at 02. Staff-facing numbering is unchanged
  from today, and the lift is forced by D3 (you cannot filter tabs by Client
  without a page-level Client).
- **A form reset keeps the selected Client.** Uploading two Services for the same
  person back-to-back is the common case; clearing it would re-ask a question
  already answered.

## Out of scope / not decided here

- The Service → **Dataset** second level (F1's north star). This registry is the
  Service level only; Dataset remains deferred.
- Retiring the mock `customers.ts` / `resources.ts` template leftovers.

## Side matter handled this session (not part of this workstream)

Bryan deployed the RBAC S5 `invite-staff` Edge Function to Supabase project
`jozdugwmmyxacmksqjdl` and asked the planner to finish setup in the Supabase
console. **Declined as not-possible, not refused:** this session has no Supabase
management tooling (the available connector performs an OAuth handshake only), and
both changes are live-console edits. Click-paths supplied instead:

1. Edge Functions → Secrets → `ARCBASE_SITE_URL = https://arcbound-data.vercel.app`
   (no trailing slash — the function appends `/auth/callback?next=…`, and a double
   slash will not match the allow-list).
2. Authentication → URL Configuration → Redirect URLs →
   `https://arcbound-data.vercel.app/auth/callback`, plus
   `http://localhost:3000/auth/callback` for local testing.

**Project ref verified:** `.env` points `NEXT_PUBLIC_SUPABASE_URL` at
`jozdugwmmyxacmksqjdl.supabase.co` — the same project the function was deployed
to. ⚠️ Open check for Bryan: confirm Vercel's _production_
`NEXT_PUBLIC_SUPABASE_URL` is that project too; if not, the secret lands on a
project the deployed app never calls and the invite fails silently.

The "Function is not configured" message visible in the `/settings/roles`
screenshot is the app correctly reporting the un-deployed state, and should clear
once the secret is set.

## Feedback & revisions

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-02 | Created. Facts F1–F8 established by repo lookup before questioning. Decisions D1–D5 grilled and settled. D6–D9 open. No implementation.                                                                                                                                                                                                                                                                               |
| 2026-08-02 | D6–D9 settled. Doc marked 🟢 SHAPED. S1 handoff emitted.                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-02 | **S1 LANDED and planner-verified** at 107 files / 1,625 tests, exit 0. Inert as specified. See the S1 handoff's revisions log for the four corrections that came out of the run. **SQL NOT YET APPLIED.**                                                                                                                                                                                                             |
| 2026-08-02 | ⚠️ **APPLY ORDER IS NOW LOAD-BEARING.** S2's screen calls `list_services_admin()` and the five mutating RPCs. Until a human pastes `supabase/arcbound-services.sql` into the Supabase SQL editor, `/settings/services` will error against the live database no matter how green the gate is. S2's brief must say so, and S2 must render a distinguishable state for "registry unavailable" rather than an empty list. |
| 2026-08-02 | **Housekeeping carried forward from the RBAC workstream, still open:** `graphify-out/cache/last_query_stamp` is dirty on every `graphify query` and still has no `.gitignore` entry — it was swept into `f379882` once already.                                                                                                                                                                                       |
