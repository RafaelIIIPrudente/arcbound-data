# 6. App-owned posts table with a configurable identifier

Date: 2026-07-16

## Status

Accepted. Implements a decision from the ArcBase build (see the SRS at
[`docs/SRS/SPEC.md`](../SRS/SPEC.md) §4 and the v1 plan at
[`docs/specs/2026-07-16-arcbase-v1.md`](../specs/2026-07-16-arcbase-v1.md)).

## Context

The SRS states that the LinkedIn post-metrics **staging table is owned by Shay**
(the analytics engineer): ArcBase only upserts into it (keyed on
`linkedin_post_id`), must reference it by a configurable identifier, and must not
create it. Shay is not available in this planning loop, and the exact table
identifier is unconfirmed.

That stance conflicts with how this repository works: data lives in app-owned
Postgres migrations, and the ingestion path — the CORE feature — is developed and
tested against a local Supabase instance ([ADR 0003](0003-mock-first-service-seam.md),
[ADR 0005](0005-multi-tenancy.md)). If the posts table is purely external, the
CORE feature cannot be built or tested locally at all.

## Decision

ArcBase **owns the posts table** via its own migration (a `public.posts` table
matching the SRS's expected shape), **and** references it through a configurable
identifier (`SUPABASE_STAGING_TABLE`) rather than a hardcoded name.

- Local development and the integration test seam run against the app-created
  table.
- A deployment can repoint `SUPABASE_STAGING_TABLE` at the analytics team's real
  table without a code change.
- The table is written **only** through the ingestion RPC (upsert on
  `linkedin_post_id`); there are no UI or policy affordances to update or delete
  Posts directly.

Alternatives considered: treat the table as external-only and never create it
(rejected — blocks building and testing the CORE ingestion feature locally, and
breaks the local-Supabase test model); own the table but hardcode its name
(rejected — contradicts the SRS's "don't hardcode the identifier" and cannot be
pointed at the analytics team's production table).

## Consequences

- The CORE ingestion feature is buildable and testable end-to-end with zero
  external coordination.
- The posts schema in our migration is our best reconstruction of Shay's shape;
  it must be reconciled with the real table before or during production cutover,
  and the column mismatches noted in the SRS input notes
  (`post_name` vs author, relative `post_date`, `scraped_at` vs `scrape_timestamp`)
  are resolved on our side (see the v1 plan).
- Pointing at a foreign production table assumes that table's columns and the
  `linkedin_post_id` conflict key match ours; a schema drift check belongs in the
  cutover runbook.
