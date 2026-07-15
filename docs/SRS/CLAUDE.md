# ArcBase Dashboard

Internal web app for Arcbound staff to register clients, upload scraped LinkedIn post metrics into Supabase, and view the resulting analytics. It is one stage of a pipeline: an external scraper feeds this app, which writes to Supabase; Shay builds views + Power BI downstream.

**Full build spec:** see `SPEC.md` — data model, per-feature acceptance criteria, ingestion algorithm, build order, and open decisions. Read it before implementing. It derives from _SRS v0.2_. Visual design lives in the ArcBase design brief.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS (light default + dark toggle)
- Supabase (Postgres + Auth), via `@supabase/ssr`

## Non-negotiable rules

- **Secrets are server-side only.** The service-role key / bearer token must never reach the browser. Privileged writes go through server actions or route handlers.
- **Clients and uploads are immutable** — no edit or delete in the UI (or DB policies). Do not add those affordances.
- **Every route except `/login` is auth-gated** (middleware redirects to `/login`).
- **Ingestion is all-or-nothing** — staging rows and the `uploads` record commit together, or the upload fails. No partial writes; recompute counts server-side.
- **Don't guess on items marked `[OPEN]` in SPEC.md** — use the documented default and flag it, or ask.

## Data model (see SPEC.md §4 for full DDL/types)

- `clients` (app-owned) — id, name, linkedin_url
- `uploads` (app-owned) — one row per scrape: counts, source_type, follower_count, uploaded_by
- staging/posts table — **owned by Shay**; the app only upserts into it, keyed on `linkedin_post_id`

## Routes

`/login` (UC-01) · `/` analytics (UC-05) · `/clients` list + add (UC-03/02) · `/clients/[id]` detail (UC-07) · `/upload` ingestion (UC-04, core) · `/resources` (UC-06)

## Out of scope

The scraper, Supabase views, Power BI, and credential provisioning are external systems — do not build them.
