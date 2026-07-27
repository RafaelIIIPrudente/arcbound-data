# Outreach System Dashboard — implementation spec

> **For agentic workers:** each slice below ships as its own `/handoff` to a
> fresh executer session. Slices are dependency-ordered; S1 must land first.

**Goal:** Bring Arcbound's LinkedIn outreach pipeline into ArcBase as a
per-Client, staff-facing dashboard fed by CSV snapshot uploads, with
aggregate-only exposure to clients.

**Architecture:** Staff select a Client and upload the whole "Master DB" CSV. Each
upload is stored as one immutable snapshot (all rows, tagged with the upload id,
attributed by `client_id` FK). Current state is the latest snapshot; movement is
snapshot-over-snapshot. Values are stored raw and canonicalised only at read.

**Decisions:** [ADR 0012](../adr/0012-outreach-system-per-client-snapshots.md).
**Shaping:** [decision doc](../decisions/2026-07-27-multi-service-dashboard-and-connection-count.md).

## Global Constraints

- **ADR 0009 — raw values are never rewritten.** Every CSV value is stored
  verbatim. Grouping/canonicalisation happens at READ time only.
- **ADR 0012 — client exposure is aggregate-only.** Prospect rows must never
  leave the database on the public Report Link path; aggregation happens INSIDE
  the SECURITY DEFINER function.
- **No name-matching.** Attribution is the `client_id` FK chosen by staff at
  upload. `Owner` is stored but never used to attribute.
- **Four-state discipline.** could-not-read / truncated / genuinely-zero /
  not-applicable never collapse. An absent value is never rendered as 0.
- **No scores, grades, rankings, or benchmarks.** Descriptive counts only.
  Meetings booked is 7 of 1,230 — low-N honesty is mandatory.
- **Paged reads.** PostgREST caps responses at 1000 rows; every whole-table read
  goes through `src/lib/supabase/paged.ts` with a UNIQUE `.order()`. A snapshot
  is ~1,435 rows, so this is load-bearing from day one, not a future concern.
- **SQL pair convention.** Every schema change ships as a paste-script
  `supabase/<name>.sql` + a fresh-timestamp `supabase/migrations/<ts>_<name>.sql`,
  registered in `supabase/sql-sync.test.ts` `PAIRS`. Applied by staff via the
  Supabase SQL editor — never `db push`, never by an agent.
- **Verification** = `pnpm lint && pnpm type:check && pnpm test && pnpm build`
  plus hermetic unit/component tests. No Claude-in-Chrome, no dev-server walk.
- **Leave all work uncommitted** for the user to review and commit.

## Source data (observed 2026-07-27, 1,435 rows)

24 columns, exact header order:

```
Full Name, Title, Company, ICP Seg, Why They Fit (signal), What They Lack,
What Arcbound Offers (tier + hook), Matching Client Archetype, LinkedIn URL,
Location, Source / Citation, Rationale (1-line), LinkedIn Message,
Connection Status, Date Sent, Reply Status, Follow-up Count,
Last Follow-up Date, Next Touch Date, Meeting Booked (date), Stage, Owner,
Notes, Qualified (ICP)
```

Fill rates and observed values:

| Column                                                                                                                             | Fill | Notes                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------- |
| Full Name, Title, Company, ICP Seg, Why They Fit, LinkedIn URL, Rationale, Connection Status, Reply Status, Follow-up Count, Stage | 100% |                                                                               |
| Matching Client Archetype                                                                                                          | 99%  | **750 distinct free-text values** — NOT a key                                 |
| Owner                                                                                                                              | 99%  | single value "Bryan"; 3 blank                                                 |
| Qualified (ICP)                                                                                                                    | 99%  | Yes 1406 / No 19                                                              |
| Source / Citation                                                                                                                  | 99%  |                                                                               |
| Location                                                                                                                           | 96%  |                                                                               |
| Notes                                                                                                                              | 94%  | **contains email addresses**                                                  |
| Date Sent                                                                                                                          | 85%  | 44 distinct; range `2020-12-04` → `2026-07-23` (the 2020 value is an outlier) |
| What They Lack / What Arcbound Offers                                                                                              | 83%  |                                                                               |
| LinkedIn Message                                                                                                                   | 56%  | **drafted personal messages**                                                 |
| Last Follow-up Date                                                                                                                | 8%   | 116 rows                                                                      |
| Meeting Booked (date)                                                                                                              | 0.6% | **8 rows**                                                                    |
| Next Touch Date                                                                                                                    | 0.1% | **2 rows**                                                                    |

Controlled-ish vocabularies:

- **Connection Status** (2): `Pending` 1218, `Connected` 217.
- **Stage** (10): `Requested` 1216, `Connected` 177, `Replied` 25,
  `Meeting Booked` 7, `Closed - Low Fit` 4, `Passed` 2, `Client` 1,
  `Closed - Disqualified` 1, `Closed - Rejected` 1, `In Conversation` 1.
- **Reply Status** (15 — DIRTY): `No Reply` 1396, `Replied - Positive` 17,
  `Replied - Neutral` 4, `Replied` 3, `Replied - Interested` 2,
  `Not Interested` 1, `Replied - Negative` 1, plus **8 DISTINCT VALUES carrying a
  date in the status field, across 11 ROWS**: `Replied 2026-07-13` (3),
  `Replied 2026-07-14` (2), `Replied 2026-06-30`, `Replied 2026-07-01`,
  `Replied 2026-07-02`, `Replied 2026-07-06`, `Replied 2026-07-09`,
  `Replied 2026-07-16` (1 each). Rows reconcile as 1,424 + 11 = 1,435; the column
  is 100% filled, so no blank cell exists in today's export.
  _(Corrected 2026-07-27 — earlier drafts read "8 rows", conflating distinct
  values with rows. The funnel is unaffected either way: 1,435 − 1,396 = 39
  replies. Caught by the S3 executer.)_
- **Follow-up Count** (3): `0` 1320, `1` 103, `2` 12.

⚠️ **Stage and Connection Status do not contradict each other.** `Stage` is the
furthest point reached; `Connection Status` is a binary accepted/pending flag.
217 accepted ≈ 177 still at Connected + 40 further along. Do not "reconcile" them.

⚠️ **No `Date Connected` / `Date Replied` column exists.** Connection- and
reply-movement over time is derivable ONLY by comparing snapshots.

⚠️ **`LinkedIn URL` is not a unique key.** 1,419 distinct of 1,435; normalising
(lowercase, strip scheme/`www.`/trailing slash) collapses it to 1,408. The source
contains genuine duplicate prospects. Snapshots must NOT deduplicate.

## File-Structure Map

| File                                                                            | Responsibility                                                                                        |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `supabase/outreach-system.sql` + `supabase/migrations/<ts>_outreach_system.sql` | `outreach_uploads`, `outreach_prospects`, `ingest_outreach` RPC                                       |
| `src/lib/parse-outreach.ts` (+ test)                                            | Pure CSV→rows parse + Zod validation (24 columns)                                                     |
| `src/lib/outreach-vocab.ts` (+ test)                                            | **S3, not S1.** Read-time canonicalisation of Reply Status / Stage; `parseCount`; unmapped disclosure |
| `src/services/outreach.ts` (+ test)                                             | Seam: `ingestOutreach`, `latestSnapshot`, `listOutreachUploads`                                       |
| `src/services/outreach-analytics.ts` (+ test)                                   | Pure: KPIs, funnel, breakdowns, snapshot movement                                                     |
| `src/components/dashboard/ingest/outreach-upload-form.tsx` (+ test)             | The Outreach upload tab                                                                               |
| `src/app/(app)/upload/page.tsx`, `upload-tabs.tsx`                              | Tabbed "Add Data" host                                                                                |
| `src/app/(app)/clients/[id]/outreach/page.tsx`                                  | The Outreach client tab                                                                               |
| `src/components/dashboard/outreach/*`                                           | KPI row, funnel, breakdown charts, trend                                                              |
| `src/components/dashboard/layout/nav-config.ts`                                 | Rename to "Add Data"                                                                                  |
| `src/components/dashboard/client/client-tabs.tsx`                               | Add the Outreach tab                                                                                  |

## Interfaces

```sql
-- One row per upload (immutable audit + snapshot header)
create table public.outreach_uploads (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id),
  row_count    int  not null,
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

-- One row per prospect PER SNAPSHOT. All source columns stored as raw text.
-- No unique key on any source field: duplicates are preserved by design.
create table public.outreach_prospects (
  id                       bigint generated always as identity primary key,
  outreach_upload_id       uuid not null references public.outreach_uploads(id) on delete cascade,
  client_id                uuid not null references public.clients(id),
  row_index                int  not null,          -- position in the source file
  full_name                text, title text, company text, icp_seg text,
  why_they_fit             text, what_they_lack text, what_arcbound_offers text,
  matching_client_archetype text, linkedin_url text, location text,
  source_citation          text, rationale text, linkedin_message text,
  connection_status        text, date_sent text, reply_status text,
  follow_up_count          text, last_follow_up_date text, next_touch_date text,
  meeting_booked_date      text, stage text, owner text, notes text,
  qualified_icp            text
);
```

```ts
// src/services/types.ts additions
export interface OutreachUpload {
  id: string;
  clientId: string;
  rowCount: number;
  createdAt: string;
}
export interface OutreachProspect {
  /* camelCase mirror of the 24 columns */
}

// src/lib/outreach-vocab.ts
export type ReplyBucket =
  "no-reply" | "positive" | "neutral" | "negative" | "replied-unspecified" | "unrecognised";
export function canonicalReply(raw: string): ReplyBucket;
export function canonicalStage(raw: string): string;
// Numeric columns are STORED as text (ADR 0009); interpretation lives here.
// Returns null for anything unparseable, so an unreadable value is DISCLOSED
// the same way an unrecognised reply status is — never silently 0 or NaN.
export function parseCount(raw: string | null): number | null;

// src/services/outreach-analytics.ts
export interface OutreachAnalytics {
  totalProspects: number;
  funnel: { label: string; count: number }[];
  connectionStatus: { label: string; count: number }[];
  replyStatus: { label: string; count: number; raw?: string }[];
  stage: { label: string; count: number }[];
  unrecognisedReplyValues: string[]; // disclosed, never dropped
  sentOverTime: { date: string; count: number }[];
  undatedSent: number; // counted-but-excluded
}
export interface OutreachMovement {
  previousAt: string | null; // null ⇒ only one snapshot: honest empty state
  deltas: { label: string; from: number; to: number }[];
}
```

## Slices

### S1 — Data model + ingest

Tables + `ingest_outreach(p_client_id uuid, p_rows jsonb)` RPC (SECURITY DEFINER,
inserts one `outreach_uploads` row + all prospect rows in ONE transaction,
returns `{upload_id, row_count}`). Pure `parse-outreach.ts` with a Zod schema over
the 24 headers (only `Full Name` + `LinkedIn URL` required; everything else
optional, blank ⇒ null). Seam `src/services/outreach.ts`. **No UI.**

### S2 — "Add Data" reshape + Outreach upload tab

Rename the nav item to **Add Data** (`nav-config.ts` + `resolvePageTitle`). Make
`/upload` a tabbed host: `[LinkedIn Metrics] [Outreach System]`. The LinkedIn tab
renders the EXISTING form unchanged. The Outreach tab is a new form: select
client → drop CSV → submit → result summary (rows ingested).

⚠️ **Use the shadcn `<Tabs>` primitive, mirroring `settings-tabs.tsx` — NOT the
link-tabs of `client-tabs.tsx`.** The repo documents this rule in
`client-tabs.tsx`: link-tabs are for separate SERVER routes with their own data
fetch and search params. Both upload tabs are forms sharing ONE
`listClientRegistry()` read on one route, which is exactly the `settings-tabs.tsx`
case. (Corrected 2026-07-27 — an earlier draft of this spec asked for
deep-linkable tab state, which would have forced the wrong primitive.)

⚠️ **`serverActions.bodySizeLimit` MUST be raised.** `next.config.ts` sets none,
so the limit is Next's default **1 MB**; the real export is **1.42 MB** and grows
with the prospect list. Left alone, the first real Outreach upload fails. Set it
explicitly with a comment recording the measured size. Note the ceiling: Vercel
caps a serverless request body at ~4.5 MB, so this transport has finite headroom —
past that, ingest needs a different path (direct-to-storage upload), which is a
future decision, not this slice.

⚠️ **Surface the 25th-column risk** (S1 flag): a column added to the source sheet
is currently dropped silently. Extend the parser to report unknown headers and
attach them as a NON-BLOCKING warning on success — mirroring how
`ingestMetricsAction` attaches `nameMatchWarning`.

### S3 — Outreach client tab (current state)

**Opens with `src/lib/outreach-vocab.ts`** (`canonicalReply`, `canonicalStage`,
`parseCount`) — it is read-time work, so it belongs here, NOT in S1. ⚠️
`latestSnapshot` returns three states (unavailable / empty / ok) and carries
`truncated` + `total`; S3 must render the truncated case rather than ignoring the
flag.

Add the 4th client tab. Read the latest snapshot (paged). Render: KPI row (total
prospects, sent, connected, replied, meetings booked), the funnel with descriptive
counts, and the three breakdowns using read-time canonicalisation. Disclose
unrecognised reply values verbatim. Honest empty state when a Client has no
snapshot.

### S4 — Prospect table (viewer parity)

_Added 2026-07-27, ahead of Trends. Supersedes "prospect table deferred" in the
[decision record](../decisions/2026-07-27-multi-service-dashboard-and-connection-count.md)._

The row-level table, modelled on Bryan's `Arcbound_Master_DB_Viewer.html`:
free-text search + Connection / Reply / Stage / ICP filters + click-any-column
sort, all **24 columns**, sticky header, status pills, `profile ↗` link, 3-line
clamp with full text on hover. Sits **below** the S3 aggregates on the same
Outreach tab. Filtering and sorting run **client-side over every row** — the page
already fetches them all for the analytics, so no new read.

⚠️ **Aggregates never rescope to the filter.** Each funnel step is captioned with
the column and rule that produced it; recomputing those over a filtered subset
makes the caption false unless the filter is stated beside every figure.

⚠️ **Do NOT port the viewer's pill logic.** Its reply regex
(`/Positive|Interested/` before `/Negative|Not Interested/`) paints
`Not Interested` **green as a positive reply** — the first branch matches on the
substring "Interested" and wins. `Replied - Interested` goes green the same way.
Those are the exact two guesses S3 refused; copying the regex would silently undo
that work. Both are `unrecognised` and must read as unclassified.

### S5 — Trends

Snapshot-over-snapshot movement (`OutreachMovement`) and requests-sent-over-time
from `Date Sent`, dated rows only, with undated counted-but-excluded and
disclosed. ⚠️ Fewer than two snapshots ⇒ an honest "needs another upload" state,
never a zeroed chart. Filter or disclose the `2020-12-04` outlier — do not
silently drop it.

### S6 — Report Link aggregate exposure

Extend the public read with an **aggregate-only** outreach path. ⚠️ The
aggregation MUST happen inside the SECURITY DEFINER function — return counts
only (`{sent, connected, replied, meetings_booked}`), never rows. No names,
messages, notes, URLs, or emails may appear in the returned jsonb. Render an
outreach summary block in the public report.

## Self-Review

- **Spec coverage:** every ADR 0012 decision maps to a slice — per-client
  attribution (S1/S2), snapshots (S1), raw storage + read canonicalisation
  (S1/S3), aggregate-only client exposure (S6), nav rename + tabs (S2),
  dashboard v1 (S3/S4).
- **Type consistency:** `OutreachAnalytics`/`OutreachMovement` are consumed only
  by S3/S4; `canonicalReply`/`canonicalStage`/`parseCount` are defined and used in
  **S3** (corrected 2026-07-27 — an earlier draft of this spec placed the vocab
  module in S1 while S1's own slice text and handoff scope excluded it; the S1
  executer correctly stayed in scope and flagged the contradiction).
- **Known gaps, deliberate:** the prospect-row table on screen, a Service→Dataset
  discriminator, and any richer client-facing view are out of scope (ADR 0012).
- **Data-quality items surfaced, not fixed:** ~27 duplicate prospects, the
  `2020-12-04` outlier, and the 2-row `Next Touch Date` / 8-row `Meeting Booked`
  sparsity.
