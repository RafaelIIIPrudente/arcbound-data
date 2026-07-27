# Decision — Multi-service dashboard (north star) + LinkedIn Connection Count (first slice)

- **Type:** Shaping / decision record (planning session, `/grill-with-docs`)
- **Date:** 2026-07-27
- **Branch:** `feat-additonal-features-for-linkedin-report`
- **Session role:** Planner (shape + `/handoff`; no implementation here).
- **Artifacts produced:** this doc; the `Connections` term in `CONTEXT.md`; the
  executer handoff `docs/handoffs/2026-07-27-linkedin-connection-count.md`.

## Origin

Bryan opened the `/upload` screen ("Add LI post metrics") and framed a future:
**ArcBase should become the dashboard for _all_ Arcbound services, not just
LinkedIn.** The upload page should let you upload "based on what service it is" —
LinkedIn Post Metrics is one; an **Outreach System Dashboard** is another — and
the first concrete addition should be a **Connections** figure on the LinkedIn
upload. We grilled it (grilling + domain-modeling) one decision at a time.

## Current state at the time of this decision (facts)

- `/upload` is **single-service, hard-wired to LinkedIn post metrics**. The only
  "type" control on the page is the CSV-vs-JSON _source format_ toggle. There is
  **no notion of "service" or "dataset"** anywhere — UI, `uploads` table, types,
  or the RPC.
- Pipeline is LinkedIn-post-shaped end to end: `postRowSchema` (15 cols) → RPC
  `ingest_metrics` → writes `linkedin_posts_staging` + `post_attributes` + one
  `uploads` audit row → analytics read from `bi.linkedin_post_latest`.
- Attribution is two mechanisms: the **Upload** is tied to a Client by
  `client_id` FK (staff pick the client); the **Posts** are attributed
  downstream by a name-match inside the `bi.*` view. Staging has no `client_id`.
- `uploads` has one discriminator only: `source_type ('csv'|'json')`.
- **Follower Count** already exists as a per-scrape count: required on the form,
  stored in `uploads.follower_count`, and surfaced across ~14 files (upload
  history, a Follower Trend chart, cross-client comparison, the client Report on
  screen + print, and the public Report Link).

## The north star (design only — NOT being built now)

A two-level model above the existing spine, with **Client** staying universal:

```
Service ─┬─ LinkedIn ─── Dataset: Post Metrics (rows) [exists]
         └─ Outreach System ─── Dataset: per-client outreach summary [deferred]

Client stays the single subject: every Service's data attaches to a Client;
each Client's report grows to span multiple services.
```

Vocabulary settled this session:

- **Service** — the top level (LinkedIn, Outreach System); each has its own
  dashboard. (Bryan's own word — "add a service for the Outreach System.")
- **Dataset** — a category of data within a Service (e.g. "Post Metrics"). The
  upload page's future selector reads "choose a service → choose a dataset"; the
  future DB discriminator is `uploads.dataset`.
- **Scrape → Upload → rows** stay as they are, one level below a Dataset.

These three terms are **recorded here, deliberately NOT added to `CONTEXT.md`**,
because `CONTEXT.md` is a glossary of the _live_ product and Service/Dataset are
not yet built. They graduate to the glossary when the reshape ships.

## Decisions (grilling, in order)

1. **Scope of this workstream — "Frame now, build the first slices."** Design the
   Service→Dataset model as the north star, but only _introduce_ the Service
   dimension and ship the first concrete additions. Not a full-platform spec.
2. **Inner-level term = "Dataset."** (Over "Metric type" — strains once data
   isn't metric-shaped — and "Feed" — implies streaming, but ArcBase ingests
   discrete weekly uploads.)
3. **Client stays the universal subject.** Every Service's data attaches to a
   Client; no new "Subject" abstraction. Working read of the domain: Outreach ≈
   the Apollo-based outreach run _for_ each client; Connections = per-client
   connection growth.
4. **Connections is a COUNT snapshot** (a single integer per scrape), not a
   row-level export. (Bryan's call — declined the LinkedIn connections-CSV
   "rows" shape.)
5. **Connections lives as a FIELD on the LinkedIn Post Metrics upload**, beside
   Follower Count — **not** as its own Dataset. Bryan chose this knowing it
   sidesteps the Service→Dataset selector for Connections; the selector earns its
   keep at the LinkedIn-vs-Outreach boundary instead. (Declined both the
   "Profile Metrics dataset" generalisation and a standalone "Connections"
   dataset.)
6. **Connection Count display scope = FULL PARITY with Follower Count** — it
   appears everywhere followers do (upload capture, Upload History, a Connections
   Trend chart on client detail, cross-client comparison, the client Report on
   screen + print, and the public Report Link). ~14 files. "Wherever you see
   followers, you now see connections."
7. **Connection Count is OPTIONAL at capture.** Blank → the post-metrics upload
   still succeeds (decoupled from a number that isn't always on hand). Every
   _existing_ upload has no connections value regardless, so history shows honest
   gaps either way. **Missing → gap / em dash, NEVER coerced to 0** (the
   four-state honesty discipline).

### Layout choice carried into the handoff (planner's call, vetoable)

- Fold the connections input into **step 03**, relabeled "Follower & connection
  counts" (follower required, connections optional), rather than adding a 5th
  step.

## What we are building now (the Connection Count slice)

- **Capture:** optional connections input on the LinkedIn upload, beside
  Follower Count.
- **Storage:** new nullable `public.uploads.connections_count int`, parallel to
  `follower_count`. The `ingest_metrics` RPC gains a 5th param
  `p_connections_count int`.
- **Display:** full parity with Follower Count across the ~14 files.
- **Honesty:** absent connections render as a gap / em dash, never 0; four
  states never collapse.

### Migration gotchas (hard-won, carried from the Report Links go-live)

- **Signature change ⇒ `DROP FUNCTION` first.** `ingest_metrics` currently is
  `(uuid, text, jsonb, int)`; a `create or replace` with the added arg makes a
  NEW overload, not a replacement. The migration must
  `drop function public.ingest_metrics(uuid, text, jsonb, int)` and recreate the
  **current** body — the live definition is `supabase/post-attributes.sql`
  (writes staging + `post_attributes` + `uploads`) — with the new param and the
  updated `comment`/`grant`/`revoke` on the new signature.
- **Fresh-timestamp migration.** Do NOT edit an already-applied migration
  (`db push` skips it). New `supabase/migrations/<fresh-ts>_uploads_connections_count.sql`.
- **SQL-pair convention.** Add a new paste-script `supabase/uploads-connections-count.sql`
  and register the pair in `supabase/sql-sync.test.ts` `PAIRS`.
- **Apply via the Supabase SQL editor** (idempotent), not `db push`.

## Deferred (recorded, not built)

- The Service→Dataset model itself (DB discriminator + a service/dataset
  selector on `/upload`).
- The **Outreach System** service and its first Dataset (per-client outreach
  summary: requests sent/accepted, messages, replies, positive replies, meetings
  booked — count semantics per-period vs cumulative was **not resolved**; Bryan
  paused Outreach to finish Connections first).
- Promoting Connections (or Follower Count) to a first-class "Profile Metrics"
  Dataset.

## Feedback & revisions

- **2026-07-27 — v1 (this session).** Grilled scope → vocabulary → subject spine
  → Connections shape → model placement → display scope → required/optional.
  Landed the Connection Count slice at full parity, optional, field-not-dataset;
  deferred the multi-service reshape and Outreach. Handoff authored.
  _(Append dated entries as the executer reports back; edit in place if revised.)_

- **2026-07-27 — v2: decisions 8 & 9 (after the first executer run).**
  - **8. NO derived per-1K connections figures.** The executer mirrored Follower
    Count's ratio treatment ("Per 1K connections" / "Avg interactions per 1K
    connections") in the comparison table and report. Bryan ruled it out:
    **connections is a RAW count on every surface.** The comparison table returns
    to 6 columns. Followers KEEP their per-1K figure — the asymmetry is
    intentional and accepted.
  - **9. Connections stays CLIENT-FACING as a raw count.** Planner found (and
    verified in code) that `perThousandConnections` was the ONLY path by which
    connections reached the client Report and the public Report Link — deleting
    it would silently have made connections staff-only, contradicting decision 6
    (full parity). Bryan ruled: **replace the ratio with a plain raw
    "Connections" count** in the Report + public Report Link.
  - **Two traps recorded for the revision pass:** (a) the raw count must NOT
    render through `AverageLine` — that appends "· all time" and an approximation
    mark, both false for a point-in-time captured count; (b) the count is sourced
    from the newest upload that CARRIES one (`client-report.ts` ~line 630), which
    may be OLDER than the latest scrape, so the label must not overclaim currency.
  - **Also this run:** branch drift surfaced (PR #14 merged the old branch; work
    now sits on `feat-outreach-system-dashboard`), and the DB migration is
    **built but NOT applied** — uploads fail until staff paste
    `supabase/uploads-connections-count.sql` into the Supabase SQL editor.
  - Revision handoff: `docs/handoffs/2026-07-27-connection-count-raw-figure-trim.md`.
