# 8. ArcBase owns the analytics schema

Date: 2026-07-16

## Status

**Withdrawn.** Premise invalid — the external `bi` layer (Shay's
`linkedin_posts_staging` + `bi.*` views) is live in the hosted project, so ArcBase
must NOT own/replace the schema (applying this ADR's migration would drop the
staging table and cascade the BI views). ArcBase conforms to the external schema
per [ADR 0006](0006-app-owned-posts-table.md); see
[ADR 0009](0009-arcbase-conforms-to-external-bi-schema.md). ADR 0006 is therefore
NOT superseded. Never applied.

## Context

ADR 0006 treated the LinkedIn post-metrics table as **owned by the analytics
engineer (Shay)**: ArcBase would only upsert into it, reference it through a
configurable identifier (`SUPABASE_STAGING_TABLE`), and never create it. That
stance was a hedge against an external consumer we couldn't coordinate with.

Two facts have since changed the calculus:

- **There is no downstream consumer yet.** Power BI has not been built, so no
  report reads the metrics table today — there is nothing to break by owning the
  schema.
- **The out-of-band table can't support the product.** The Arcbound project
  currently has a `clients` table and an all-text `linkedin_posts_staging` (the
  15 raw scrape columns + `uploaded_at`) created by hand via the dashboard — with
  **no `client_id`**, **no `uploads` audit**, and **no types**. Per-client
  analytics (the entire dashboard) and an immutable upload history are impossible
  against that shape. The scrape file maps 1:1 to the metrics but carries **no
  client identity** — the operator picks the client in the UI, so the metrics
  need a `client_id` set at ingest.

## Decision

**ArcBase owns the full analytics schema** in the Arcbound Supabase project, as
version-controlled migrations:

- Typed **`clients`** (reconciled: adds a DB-owned, normalized, unique
  `linkedin_url_key` for case-insensitive dedup, OI-01), **`posts`** (typed, with
  a `client_id` FK and a unique `linkedin_post_id`), and **`uploads`** (an
  immutable per-ingest audit).
- Ingestion runs through a single **`ingest_metrics` RPC** (SECURITY DEFINER, one
  transaction): it upserts posts on `linkedin_post_id`, tallies
  inserted/updated/unchanged, writes one `uploads` row, and rolls the whole call
  back on any bad row (all-or-nothing, invariant #4).
- The raw **`linkedin_posts_staging` is dropped** (it is empty). The
  **`SUPABASE_STAGING_TABLE` indirection from ADR 0006 is retired** — the
  canonical table is `public.posts`, referenced directly.
- **RLS** is enabled on all three tables; `authenticated` may read all three and
  insert `clients`; `posts`/`uploads` are written only through the RPC. No
  update/delete policies anywhere (immutability, invariant #2).
- When Power BI is built, it **reads these tables** (or SQL views over them).

Alternatives considered: keep ADR 0006's external-staging stance (rejected — the
untyped, client-less staging table cannot power per-client analytics or an upload
history, and there is no external consumer to protect); own the table but keep
the `SUPABASE_STAGING_TABLE` indirection (rejected — indirection with no second
target is dead complexity now that ArcBase owns the canonical table).

## Consequences

- The schema is now **version-controlled** in `supabase/migrations/` (with a
  consolidated `supabase/schema.sql` for hand-application); the ADR 0006
  "reconcile our reconstruction with Shay's real table at cutover" risk is
  replaced by a lighter forward task.
- **Reconcile with Shay when he builds Power BI** — he consumes ArcBase's
  `clients`/`posts`/`uploads` rather than ArcBase consuming his table. The
  schema-drift/cutover check from ADR 0006 moves to that future coordination.
- The `posts` schema resolves the input-note mismatches on our side: `post_name`
  is stored as the scraped author label; the relative `post_date` is kept as
  `post_date_raw` and resolved best-effort into a nullable `post_date`
  timestamptz at ingest; `saves`/`post_format_type` stay nullable.
- No service-role key is introduced: the RPC is SECURITY DEFINER and is called by
  the authenticated session, so writes to `posts`/`uploads` need no RLS bypass in
  application code.
