# 15. The Arcbound Services registry: visibility is data, capability is code

Date: 2026-08-02

## Status

Accepted. Introduces `public.services` and `public.client_services`.

It does **not** supersede the deferred Service→Dataset north star recorded in
[`docs/decisions/2026-07-27-multi-service-dashboard-and-connection-count.md`](../decisions/2026-07-27-multi-service-dashboard-and-connection-count.md).
That design has two levels — a Service, and the Datasets a Service produces. This
ADR builds **only the Service level**. Datasets remain deferred, and nothing here
forecloses them: a `datasets` table hanging off `services` is an additive change.

## Context

Arcbound sells services to its Clients. Two of them have real ingestion pipelines
in this codebase — LinkedIn post metrics and the Outreach System — and both are
**hard-coded**. `/upload` renders two literal tabs. Every Client shows all four
detail tabs whether or not Arcbound does that work for them. A Client who has
never had an outreach campaign still gets an Outreach tab, and a staff member
cannot tell "no data yet" from "we do not do this for them".

The obvious fix is a registry: a table of Services, and a join table saying which
Clients receive which. The non-obvious part is what a row in that table is allowed
to _mean_.

### The trap: a registry that promises what code cannot deliver

If a Service row simply carried a name, an admin could add "Email Marketing"
tomorrow and the app would have to decide what to do. There is no email-marketing
ingestion pipeline. Nobody wrote one. A row cannot conjure one into existence.

The failure mode is that the registry starts asserting things the system cannot
back up: an upload tab with nothing behind it, a data tab that renders an empty
state indistinguishable from a broken query, a count over a table that does not
exist. The registry would look complete while being a promise the code never made.

## Decision

**Visibility is data. Capability is code.**

A Service row carries a `handler` naming an ingestion pipeline that **exists in
code**. The legal set is a CHECK constraint in the database, mirrored by the
`ServiceHandler` union in `src/services/types.ts`. Admins choose from that set and
can never invent a value. Adding a pipeline means editing both **and writing the
pipeline** — the registry can never get ahead of the implementation.

A Service with **no** handler is a first-class, real offering. It is listed, it
appears on the Client, it is countable and reportable. It simply has no upload
path and no data tab, and a later slice will say so plainly on screen. **"Has a
pipeline" and "listed but not ingestible" must never collapse into one another**,
exactly as this product refuses to collapse "absent" into "zero" everywhere else.

Supporting decisions, each with a reason that outlives the code:

- **One Service per pipeline**, via a partial unique index on `handler` where it
  is not null. Two Services claiming `linkedin_post_metrics` would render two
  identical upload tabs writing to one table, with nothing downstream able to tell
  their data apart. The index is _partial_ so that no-pipeline Services stay
  freely duplicable — Arcbound may list many non-ingesting offerings; it may not
  sell the same pipeline twice.
- **The handler is immutable after creation.** `update_service` takes no handler
  parameter. Repointing a live Service would silently reinterpret every engagement
  already attached to it: Clients recorded as receiving one service would, with no
  row changing, be recorded as receiving another, and every historical count
  derived from it would change meaning retroactively with nothing to show it had
  happened. To change a pipeline: archive, and create a new Service.
- **`client_services.service_id` has no `on delete cascade`.** The foreign key's
  default RESTRICT is what makes the delete guard real — a Service any Client
  holds cannot be deleted even if the application layer is bypassed entirely.
  `delete_service` raises a friendlier message naming the count, but the database
  refuses on its own.
- **`upload_count` is derived from the handler, not from a join.** Neither uploads
  table carries a `service_id`, and this workstream does not add one: that would
  change the `ingest_metrics` signature, which requires `DROP FUNCTION` first — a
  trap this repo has already been bitten by. The mapping is exact _because_ of the
  partial unique index: at most one Service claims a handler, so "uploads through
  this Service" and "all rows in that pipeline's table" are the same set.
- **Writes are admin-only, through `SECURITY DEFINER` functions.** Neither table
  has an insert/update/delete policy, so there is no route to them for a non-admin
  even with a valid session and their own Supabase token.

## Consequences

- **⚠️ This is the FIRST mutable, deletable entity in ArcBase, and it deliberately
  breaks a streak the product has held until now.** `CONTEXT.md` records that
  Clients and Uploads are never edited or deleted, that Posts change only through
  re-ingestion, and `resources.sql` carries an explicit "no update or delete"
  comment. Every entity so far has been append-only, and that uniformity has been
  a real safety property: nothing can be quietly rewritten under a reader.

  Services breaks it because a registry that cannot be corrected is worse than one
  that can — a typo'd offering would be permanent, and an offering Arcbound stops
  selling would clutter every Client for ever. The break is **contained** by
  making archive the normal path and delete the exceptional one: archiving is
  reversible and preserves every engagement, while `delete_service` is refused the
  moment anyone receives the Service. Hard delete is a typo eraser, not a
  retirement tool.

  The honest risk is that "editable" spreads. A future slice that lets an admin
  edit a Client because Services set the precedent would be a different and much
  worse decision, and this ADR is not authority for it.

- **⚠️ Once `/upload` filters by Services, a Client with no Services has NO upload
  path.** That is the correct behaviour — it is the entire point of the registry —
  but it means the day that slice ships, any Client whose Services were never
  recorded silently loses the ability to receive data. **The derived backfill is
  what stops that being an outage**: it assigns Services from real upload history,
  so every existing Client arrives already correct, and every assignment states
  something true rather than something assumed.

  This also makes the apply step consequential in a way most migrations are not. A
  backfill that matches zero rows is a **silent no-op** — `insert … select … where`
  raises no error when nothing matches, exactly as a staff-roles seed against a
  non-existent email once left ArcBase with no admin at all. The script therefore
  ends with verification queries, marked to be run one at a time, and states what
  the engagement count must equal.

- **The registry is inert on arrival.** This slice changes no screen. `/upload`,
  the client pages and the settings pages render exactly as before; nothing in
  `src/` imports the new seam module except its own test. That is deliberate: the
  data model lands and can be applied, inspected and corrected before any screen
  depends on it.

- **⚠️ None of the schema is verified by the test suite.** No Postgres runs in
  `pnpm test`. The tests over the SQL are **source assertions** — they check that
  the script says the right thing, not that the database does it. The constraints,
  the guards, the seed and the backfill are unverified until a human applies the
  script and runs the verification queries.

- **Two words named "service" now coexist**, and `CONTEXT.md` disambiguates them
  explicitly. The seam module is `arcbound-services.ts` and the type is
  `ArcboundService`; bare `Service` is not used for the offering anywhere. This
  repo already carries one unresolved collision of the same kind — the
  Engineer/Admin of ADR 0007 versus the Admin Staff Role of ADR 0013 — which is
  _not_ recorded anywhere as a known defect and remains open.
