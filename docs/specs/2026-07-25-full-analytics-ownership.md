# ArcBase Full Analytics Ownership — Implementation Plan

> **Status:** DRAFT for review. Sequencing (features-first vs migration-first) is
> the open decision this plan exists to inform. Each slice below becomes its OWN
> keystroke-level `/handoff` (RISEN, RED-first, mutation-verified) when we drive
> it — this document is the map, not the per-slice execution script. Per the
> standing rule, every handoff leaves work **UNCOMMITTED** for the user; "commit"
> steps in the eventual handoffs read "leave staged/uncommitted."
>
> **Decision record:** [ADR 0010 — ArcBase owns analytics end-to-end](../adr/0010-arcbase-owns-analytics-end-to-end.md)
> (supersedes ADR 0009, revives ADR 0008's design).

**Goal:** Make ArcBase the analytics _terminal_ — own the whole chain from
uploaded scrape rows through typed, FK-attributed, aggregated analytics — and
retire Shay's `bi.*` transform, without disturbing the reporting layer.

**Architecture:** ArcBase already writes every scrape row and already knows the
client at upload time (the `ingest_metrics` RPC receives `p_client_id` and today
discards it). We stop delegating cleaning/attribution downstream: ingest writes a
typed, app-owned `public.posts` (real `client_id` FK, unique `linkedin_post_id`),
an app-owned SQL view emits the **identical `BiPostRow`** shape the three read
seams already consume, and we cut over behind that firewall. The fragile
downstream name-match is replaced by a foreign key.

**Tech stack:** Supabase Postgres (plpgsql RPC, RLS, migrations + paste-script
pairs), Next.js 15 RSC service seam, TypeScript strict, Vitest.

---

## Global Constraints (apply to every slice)

- **`BiPostRow` is the firewall — its shape is FROZEN.** 18 fields:
  `client_id, client_name, linkedin_post_id, post_url, post_content, post_age
(raw relative "23h"/"4d"), estimated_post_date (resolved, NULL for hour-age),
impressions, likes, comments, reposts, saves, interactions,
provided_engagement_rate, calculated_engagement_rate, scraped_at, uploaded_at`.
  The read code (`analytics.ts`, `bi-posts.ts`, `clients.ts`) and every reporting
  feature depend on it. The app-owned source MUST emit exactly these columns with
  the same semantics.
- **Four-state discipline survives typing.** A metric that could not be parsed →
  **NULL** ("could not be read"), NEVER coerced to 0. A real 0 stays 0. NULL and
  0 must never collapse — this is what the whole reporting layer's honesty rests
  on. Typed columns are therefore all NULLABLE.
- **Raw is never rewritten.** Keep the raw relative age (`post_age`) alongside the
  resolved `estimated_post_date`; keep the raw scraped author label (`post_name`)
  for provenance + the mismatch warning.
- **Every schema change is a PAIR** — a paste script `supabase/<name>.sql` and a
  CLI migration `supabase/migrations/<ts>_<name>.sql`, kept in step by
  `supabase/sql-sync.test.ts` (add the pair to its `PAIRS` array). SQL is applied
  by the user (SECURITY DEFINER RPCs, needs Supabase auth) — the agent does not.
- **Cutover is sequenced, never a hard swap.** During transition the new ingest
  DUAL-WRITES (staging as today + `posts`), so Shay's `bi.*` keeps serving reads
  until S2 repoints them. Shay's views/staging are dropped only in S3, after
  equivalence is verified and non-consumption confirmed.
- Standing repo law: reads via `src/services/*` from RSCs; PostgREST 1000-row cap
  → whole-table reads go through `src/lib/supabase/paged.ts` with a unique
  `.order()`; Conventional Commits; branch off `main`, never commit to `main`.

---

## File-Structure Map

**New**

- `supabase/posts-ownership.sql` + `supabase/migrations/<ts>_posts_ownership.sql`
  — `public.posts` table (typed, FK, unique id), rewritten `ingest_metrics`,
  the app-owned read VIEW, and a historical backfill function. (One paste/migration
  pair; add to `sql-sync.test.ts`.)
- `supabase/POSTS-OWNERSHIP-APPLY.md` — runbook (mirrors INGEST-WRITE-APPLY.md).
- `src/lib/post-date.ts` (+ `.test.ts`) — the pure relative-age → timestamp
  resolver. The one genuinely new algorithm.
- `docs/adr/0010-arcbase-owns-analytics-end-to-end.md` — the decision record
  (supersedes 0009, revives 0008's design). ✔ written.

**Modified**

- `src/services/ingest.ts:95` — build the typed/resolved row set (client_id,
  resolved date, coerced-nullable metrics, derived interactions + rate) and pass
  to the reworked RPC.
- `src/services/analytics.ts:514`, `src/services/bi-posts.ts:143`,
  `src/services/clients.ts:63,118` — repoint `.schema("bi").from("linkedin_post_latest")`
  to the app-owned view (S2). Ideally a one-token change per seam if the view
  mirrors `POST_COLUMNS`.
- `src/app/(app)/upload/actions.ts` — the `nameMatchWarning` STAYS (now purely a
  wrong-file guard, no longer an attribution mechanism).
- `src/services/data-quality.ts` + `src/components/dashboard/data-quality/*` (S3)
  — retire the "unmatched authors" surface (concept gone under FK attribution);
  keep rate reconciliation.
- `src/services/post-attributes.ts` + `post-attributes.sql` (S3) — fold
  `post_format_type` into `posts`; retire the standalone table + its backfill.

**Frozen (do NOT touch behind the firewall)**

- The reporting layer: `client-report.ts`, the `report/` + `analytics/`
  components, and all queued features. They read `BiPostRow`; they neither know
  nor care about the source swap.

---

## S0 — Coordination + ADR (not codegen; partly blocking)

**Deliverable:** the decision recorded, and the retire step de-risked.

- Obtain Shay's `bi.*` view DDL (reference only — we DEFINE our own resolver, we
  don't bit-match his; but his DDL de-risks reproducing the dedup + column set).
- **Confirm nothing else reads `bi.*`** (Power BI dead ⇒ should be clean). This
  gates S3 only.
- Land ADR 0010 (written). This can ride the S1 handoff as a doc.

**Open question for the user/Shay:** does the raw `post_date`/`post_age` text ever
carry an ABSOLUTE date (old posts), or is it always relative ("4d","3w","23h")?
The resolver branches on the answer; we also validate it against Shay's
`estimated_post_date` during S2's equivalence diff.

---

## S1 — Typed schema + new ingest (write side) _[dual-write; bi._ untouched]*

**Deliverable:** every new upload writes a typed, FK-attributed `posts` row (and
still writes staging), and all existing rows are backfilled into `posts`.

**`public.posts` shape (sketch — finalized in the handoff):**

```sql
create table public.posts (
  linkedin_post_id  text primary key,                         -- unique at last
  client_id         uuid not null references public.clients(id),
  post_url          text,
  analytics_url     text,
  post_name         text,                                     -- raw author label (provenance + warning)
  post_content      text,
  post_age          text,                                     -- raw relative age (= staging.post_date)
  estimated_post_date timestamptz,                            -- resolved; NULL for hour-age / unparseable
  impressions       bigint,  likes bigint, comments bigint,   -- ALL NULLABLE: NULL = couldn't parse, ≠ 0
  reposts           bigint,  saves bigint,
  interactions      bigint,                                   -- derived; NULL if any component unparseable
  provided_engagement_rate   numeric,                         -- from scrape, nullable
  calculated_engagement_rate numeric,                         -- derived = interactions/impressions, nullable
  post_format_type  text,                                     -- folded in from post_attributes
  scraped_at        timestamptz,
  uploaded_at       timestamptz not null default now(),
  uploaded_by       uuid references auth.users(id)
);
alter table public.posts enable row level security;
-- select to authenticated; writes only via SECURITY DEFINER RPC (no ins/upd/del policy)
```

**Key decisions baked in:**

- **Typing preserves four-state:** valid integer text → number; `"0"` → 0;
  `""`/null/non-numeric → **NULL**. `calculated_engagement_rate` = NULL when
  impressions is NULL or 0 (no divide-by-zero, no fake rate).
- **Attribution = FK:** `ingest_metrics` stamps `p_client_id` on every row.
- **Upsert = real `ON CONFLICT (linkedin_post_id)`** (unique key exists now).
- **Resolver (`src/lib/post-date.ts`, pure, TS, unit-tested):** input `post_age`
  - `scraped_at` → `estimated_post_date | null`. Day/week/month ages subtract from
    `scraped_at`; **hour/minute ages → NULL** (matches Shay; the cadence/weekday
    honesty rules depend on this NULL). Malformed → NULL. Resolving in TS (not
    plpgsql) keeps it Vitest-testable and on ArcBase's "analytics-in-TS" grain; the
    RPC receives already-resolved values.
- **Dual-write:** keep the existing staging write so `bi.*` (and thus current
  reads) stay live through the transition.
- **Historical backfill:** a one-time function maps existing staging rows →
  `posts`, attributing by a FINAL name-match (`clients.name ≈ cleaned post_name`)
  — the last legitimate use of the name-match, reproducing exactly what `bi.*`
  did, so zero analytics regression. Unmatched rows are skipped + counted (they
  were invisible before too).
- `nameMatchWarning` in `upload/actions.ts` is unchanged (wrong-file guard).

**Tests (RED-first in the handoff):** resolver table (`"4d"`→−4d, `"3w"`→−21d,
`"23h"`→NULL, absolute-date passthrough if in scope, malformed→NULL); ingest maps
unparseable metric→NULL not 0; `interactions`/`calculated_engagement_rate`
derivation incl. NULL propagation; backfill idempotency + unmatched-skip count.

---

## S2 — Read side on `posts` (`BiPostRow`-preserving) _[repoint the firewall]_

**Deliverable:** the three seams read app-owned data; output proven equivalent to
`bi.linkedin_post_latest`.

- **App-owned VIEW** (e.g. `public.app_linkedin_post_latest`) selecting exactly
  `POST_COLUMNS` + `client_name` + `uploaded_at` from `posts p join clients c`.
  Because `posts` is already typed, deduped (unique id), and attributed, the view
  is a near-straight projection — no dedup/resolve logic in the view.
- **Repoint** `analytics.ts:514`, `bi-posts.ts:143`, `clients.ts:63,118` to the
  view. Paging + the `POST_COLUMNS`/`BiPostRow` pairing are unchanged.
- **Equivalence diff (verification tool + a live run by the user):** for the same
  clients, compare each `BiPostRow` field old(`bi.*`) vs new(app view). Expected
  deltas are IMPROVEMENTS to eyeball, not regressions: rows `bi.*` dropped for a
  name-mismatch now appear (FK), and resolver edge cases on `estimated_post_date`.
  The diff harness is unit-testable; the live comparison needs the DB (user/Shay).

**Tests:** view projection returns frozen `BiPostRow` columns/types; a fixture
proves NULL metrics and NULL `estimated_post_date` survive the view unchanged; the
diff harness flags a seeded discrepancy.

---

## S3 — Retire _[after equivalence + non-consumption confirmed]_

**Deliverable:** ArcBase is the sole owner; dead machinery gone.

- Stop dual-writing (drop the staging write from `ingest_metrics`; `posts` only).
- Drop Shay's `bi.*` views + `linkedin_posts_staging` — **with Shay**, only once
  S0 confirmed nothing else reads them.
- Fold `post_format_type` fully into `posts`; retire `public.post_attributes`, its
  ingest write, `backfill_post_attributes`, and `src/services/post-attributes.ts`.
- Update the Data Quality screen: remove the "unmatched authors" surface (concept
  no longer exists); keep rate reconciliation.
- Trim `author-match.ts` to just `nameMatchWarning` (the validation nudge).

**Tests:** DQ renders without the unmatched surface; ingest no longer writes
staging; format type reads from `posts`.

---

## Parallel track — reporting features (source-agnostic)

Fix pass 2, cadence, content-composition, and the Posts-KPI + weekday slice all
read `BiPostRow` and are insulated by the firewall — they ship on the current
contract regardless of migration phase and need no rework after cutover.

---

## Open decisions (for the user)

1. **Sequencing:** features-first (land the queued reporting work, then S1→S3) vs
   migration-first (S1→S3, then features) vs both-at-once. Recommendation:
   features-first — nothing is blocked either way, and it avoids a big-bang.
2. **Absolute vs relative dates** (S0 open question above) — affects one resolver
   branch; caught by the S2 equivalence diff regardless.
3. Deferred (not this workstream): client-facing access model (ADR 0007 is
   internal-only), history/monthly-summary need, export + scheduled delivery.

## Self-review notes

- **Spec coverage:** storage, attribution, upsert, dates, derived metrics, read
  seam, retire, DQ, format-type consolidation, backfill, dual-write, equivalence
  — each maps to a slice above. ✔
- **Risks:** (1) resolver format coverage — mitigated by the S2 equivalence diff
  vs Shay; (2) obtaining `bi.*` DDL — reference-only, not blocking the write side;
  (3) historical rows with no client match — skipped + counted, matching today's
  behaviour, surfaced not silent; (4) SECURITY DEFINER SQL applied by the user,
  not the agent.
- **Type consistency:** `BiPostRow` field names/types are copied verbatim from
  `analytics.ts:28` and `POST_COLUMNS` from `bi-posts.ts:46`; the view must match
  them exactly. ✔
