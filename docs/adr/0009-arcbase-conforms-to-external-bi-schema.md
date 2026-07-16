# 9. ArcBase conforms to the external BI schema

Date: 2026-07-16

## Status

Accepted. Confirms [ADR 0006](0006-app-owned-posts-table.md) against the live
project and replaces the withdrawn
[ADR 0008](0008-arcbase-owns-analytics-schema.md).

## Context

The hosted Arcbound project already runs a live BI pipeline owned by the analytics
engineer (Shay):

- `public.linkedin_posts_staging` — the raw all-text scrape landing table (the 15
  scrape columns + `uploaded_at`; every column `text` and nullable; **no primary
  key, no unique constraint, no `client_id`**).
- `public.clients` — `id uuid pk, name text, linkedin_profile_url text, created_at`.
- a `bi` schema of views (`bi.linkedin_post_latest`,
  `bi.linkedin_monthly_summary`, `bi.linkedin_unmatched_staging_clients`) that
  clean/type/match/aggregate staging.

Crucially, **client attribution is a downstream NAME MATCH**, not a foreign key:
`bi.linkedin_post_latest` INNER JOINs `clients c ON c.name =
TRIM(regexp_replace(s.post_name, '\s*•\s*You\s*$', '', 'i'))`. Posts whose cleaned
author label doesn't exactly equal a `clients.name` are excluded from analytics.

ADR 0008 wrongly proposed ArcBase own/replace this schema. Applying it would have
dropped Shay's staging table and cascaded his views. It was never applied and is
now withdrawn.

## Decision

ArcBase **conforms to the external schema** — it is the feed, not the owner:

- **Writes raw rows into `public.linkedin_posts_staging`** via an atomic
  `ingest_metrics` RPC — a **constraint-free upsert on `linkedin_post_id`**
  (SELECT-then-UPDATE/INSERT, since staging has no unique key), storing every
  value as **raw text exactly as received**. ArcBase does NOT clean, resolve
  relative dates, coerce numbers, or match names — Shay's `bi.*` views do all of
  that.
- **Adds NOTHING to staging** — no unique constraint, no `client_id`, no columns.
- **Adds only one app-owned table, `public.uploads`** (an immutable per-ingest
  audit written by the RPC).
- **Manages `public.clients`** — the app inserts (`name`, `linkedin_profile_url`)
  and reads it; `clients.name` is the **attribution key** the BI join depends on.
- **Reads the `bi.*` views** for analytics (e.g. per-client post counts from
  `bi.linkedin_post_latest`).

## Consequences

- **`clients.name` is a matching key — exactness matters.** It must equal the
  cleaned LinkedIn author label (`post_name` minus a trailing " • You"). The
  Add-Client form guides staff to enter the exact display name, and the upload
  result shows a **non-blocking** warning when scraped authors don't match the
  selected client ("N of M posts … won't appear in analytics until the names
  align"). ArcBase does not block the write on a mismatch.
- **Unmatched authors are invisible** in analytics until the names align (the BI
  join is INNER).
- **No dedup constraint exists** on `clients` or staging in this external schema,
  so ArcBase does not fabricate one; if a duplicate `name`/URL matters it is
  surfaced in the UI, not enforced by a DB constraint.
- **Coordinate with Shay** if a `linkedin_post_id` unique key (to make the upsert
  a true single-statement `ON CONFLICT`), an explicit `client_id`, or exposing the
  `bi` schema to the app API is ever wanted.
- No service-role key is introduced: the RPC is SECURITY DEFINER, called by the
  authenticated session.
