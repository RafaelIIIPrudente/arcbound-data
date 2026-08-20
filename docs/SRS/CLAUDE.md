# ArcBase Dashboard

Internal web app for Arcbound staff to register clients, upload scraped LinkedIn post metrics, and view the resulting analytics. An external scraper feeds this app; ArcBase stores the scrape in its own `public.posts` and computes every figure it shows. ⚠️ **It is the terminal of that pipeline — there is no downstream consumer** (ADR 0010).

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
- `posts` (app-owned) — one row per post, keyed on `linkedin_post_id`, attributed by a real `client_id` foreign key stamped at upload

## Routes

`/login` (UC-01) · `/` analytics (UC-05) · `/clients` list + add (UC-03/02) · `/clients/[id]` detail (UC-07) · `/upload` ingestion (UC-04, core) · `/resources` (UC-06)

## Out of scope

The scraper and credential provisioning are external systems — do not build them. ⚠️ **The downstream analytics layer is not "out of scope"; it no longer exists** (ADR 0010).
