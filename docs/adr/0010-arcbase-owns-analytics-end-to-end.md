# 10. ArcBase owns analytics end-to-end (Power BI retired)

Date: 2026-07-25

## Status

Accepted. **Supersedes [ADR 0009](0009-arcbase-conforms-to-external-bi-schema.md)**
and adopts the design of the previously-withdrawn
[ADR 0008](0008-arcbase-owns-analytics-schema.md), whose premise (no downstream
consumer) is now the confirmed direction.

## Context

ADR 0009 made ArcBase _the feed, not the owner_: it wrote raw text into Shay's
`public.linkedin_posts_staging` and read analytics from his `bi.*` views, which
own cleaning, typing, relative-date resolution, aggregation, and a **downstream
name-match attribution** (`bi.linkedin_post_latest` INNER JOINs
`clients c ON c.name = TRIM(regexp_replace(post_name, '\s*•\s*You\s*$', ''))`).
Power BI was the intended downstream consumer of that layer.

Two facts have changed the calculus:

- **Power BI is being retired.** The decision is to do all reporting inside
  ArcBase; there is no downstream BI consumer to protect. (ADR 0008 anticipated
  exactly this — _"When Power BI is built, it reads these tables"_ — but Power BI
  was never built.)
- **ArcBase `/upload` is the sole ingest path.** No separate scraper writes
  staging; staff upload the weekly scrape through ArcBase, which means the
  `ingest_metrics` RPC **already knows each row's `client_id`** and currently
  discards it only because ADR 0009 delegated attribution downstream.

With no external consumer and the client known at ingest, conforming to an
external schema is pure cost: a fragile exact-string name-match, an
un-keyed all-text staging table, and a transform ArcBase does not control or
version.

## Decision

**ArcBase owns the full analytics chain**, as version-controlled migrations:

- A typed, app-owned **`public.posts`** — real `client_id` FK, **unique
  `linkedin_post_id`**, and NULLABLE typed metric columns. Attribution is the
  **foreign key stamped at ingest**, not a name-match. The scraped author label is
  kept (`post_name`) for provenance and a non-blocking upload warning.
- `ingest_metrics` types and resolves at write time: metrics coerced to numbers
  with **unparseable → NULL, never 0** (preserving the four-state distinction the
  reporting layer depends on); the relative age resolved to a nullable
  `estimated_post_date` **anchored to `scraped_at`** (hour-grained ages → NULL, as
  before); `interactions` and `calculated_engagement_rate` derived. The upsert is
  a real `ON CONFLICT (linkedin_post_id)`.
- An app-owned VIEW emits the **identical `BiPostRow`** the three read seams
  (`analytics.ts`, `bi-posts.ts`, `clients.ts`) already consume, so the entire
  reporting layer is untouched by the source swap.
- Shay's `bi.*` views and `linkedin_posts_staging` are **retired** after a
  sequenced cutover (dual-write → equivalence-verify → repoint → confirm
  non-consumption → drop), coordinated with Shay — never a hard swap.
- `post_format_type` folds from the standalone `public.post_attributes` into
  `posts`; that table and its backfill are retired.

## Consequences

- **Attribution stops being a lottery.** The operator's client selection is
  authoritative; a mismatched scraped author no longer silently vanishes from
  analytics. As a wrong-file guard, the existing non-blocking `nameMatchWarning`
  is kept at upload — repurposed from an attribution mechanism to a validation
  nudge. `src/lib/author-match.ts` shrinks to just that warning.
- **The "unmatched authors" concept disappears.** The Data Quality screen's
  unmatched surface is removed (rate reconciliation stays).
- **ArcBase owns the relative-date resolver.** A new, unit-tested pure function
  (`src/lib/post-date.ts`) replaces Shay's resolver; its correctness is validated
  against `bi.*` output during cutover.
- **One-time historical backfill** maps existing staging rows into `posts` by a
  FINAL name-match — the last use of the name-match — reproducing exactly what
  `bi.*` attributed, so no analytics regression. Unmatched rows are skipped and
  counted, not silently dropped.
- **Coordinate the drop with Shay**, and confirm nothing else reads `bi.*` before
  retiring it. Until S3, the new ingest dual-writes staging so `bi.*` stays live.
- No service-role key: the RPC stays SECURITY DEFINER, called by the authenticated
  session. SQL is applied by staff with Supabase auth, not by the agent.
- The schema-drift/cutover risk ADR 0009 deferred to Shay now lives entirely in
  ArcBase's versioned migrations.
