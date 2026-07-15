# ArcBase Dashboard — Build Spec

> **Audience:** Claude Code (and human engineers).
> **Source of truth:** _SRS – Arcbound LinkedIn Post Metrics Dashboard v0.2_. This file is the implementation-ready translation of that SRS.
> **Design reference:** `ArcBase Dashboard - Design Brief for Claude Design.md` (visual language, screens, states).
> **How to use:** Implement in the order in §10. Anything marked **[OPEN]** must not be guessed — use the stated provisional default and flag it, or ask.

---

## 1. What we're building

An internal web dashboard for Arcbound staff to (1) register clients, (2) upload scraped LinkedIn post metrics into a Supabase table, and (3) view the resulting analytics. It is the middle of a pipeline:

`Scraper (external)` → **`this app: ingest + view`** → `Supabase (staging → views, Shay)` → `Power BI (Shay)`

Only this app is in scope. See §11 for what is explicitly out of scope.

**Actors / roles:** Data Input Specialist (primary user; runs the weekly upload per client) and Engineer/Admin (setup + maintenance). Both are authenticated users; there is no public access.

---

## 2. Stack & hard invariants

- **Framework:** Next.js (App Router) + **TypeScript**.
- **Styling:** Tailwind CSS. Follow the design brief (light default + dark toggle; red accent; grotesque + monospace type).
- **Data/Auth:** Supabase (Postgres + Auth + JS client). Use `@supabase/ssr` for server/client session handling.

**Invariants — these must always hold:**

1. **Secrets are server-side only.** The service-role key and any bearer token never reach the browser. All privileged writes happen in server actions / route handlers.
2. **Immutability.** Clients and uploads cannot be edited or deleted through the UI. Do not build edit/delete endpoints or affordances for them.
3. **Auth-gated.** Every route except `/login` requires an authenticated session (middleware redirects unauthenticated users to `/login`).
4. **No silent partial writes.** Ingestion either fully succeeds (staging rows written + upload record created) or reports failure; never a partial commit.

---

## 3. Environment / config

```
NEXT_PUBLIC_SUPABASE_URL=            # client + server
NEXT_PUBLIC_SUPABASE_ANON_KEY=       # client + server (RLS-scoped)
SUPABASE_SERVICE_ROLE_KEY=           # SERVER ONLY — never prefix NEXT_PUBLIC
SUPABASE_STAGING_TABLE=              # exact identifier of Shay's staging table (see [OPEN] in §11)
```

Expose the staging table name via config (not hardcoded), because its exact identifier is owned by Shay and unconfirmed.

---

## 4. Data model

Two tables are app-owned (`clients`, `uploads`); the staging/posts table is **owned by Shay** — the app only writes into it. Coordinate the `uploads` table creation with Shay since he owns the Supabase schema.

### 4.1 SQL (Postgres / Supabase)

```sql
-- App-owned ------------------------------------------------------------

create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  name         text        not null,
  linkedin_url text        not null,
  created_at   timestamptz not null default now()
);

-- One row per scrape upload, per client. First-class + immutable.
create table if not exists public.uploads (
  id              uuid        primary key default gen_random_uuid(),
  client_id       uuid        not null references public.clients(id),
  uploaded_at     timestamptz not null default now(),
  source_type     text        not null check (source_type in ('csv','json')),
  inserted_count  integer     not null default 0,
  updated_count   integer     not null default 0,
  unchanged_count integer     not null default 0,
  follower_count  integer     not null,          -- followers captured with this scrape
  uploaded_by     uuid        references auth.users(id)  -- [OPEN] OI-06: confirm from session
);

create index if not exists uploads_client_recent_idx
  on public.uploads (client_id, uploaded_at desc);

-- Owned by Shay — reference shape only; confirm exact identifier -------
-- The app UPSERTS into this table keyed on linkedin_post_id.
-- Expected columns:
--   linkedin_post_id text primary key        -- dedup/update key
--   client_id        uuid references clients(id)
--   post_url         text
--   author_name      text
--   post_content     text
--   posted_date      date
--   impressions      integer
--   likes            integer
--   comments         integer
--   reposts          integer
--   engagement_rate  numeric
--   saves            integer
--   post_format_type text check (post_format_type in
--                      ('image','carousel','link','text','video'))
--   scrape_timestamp timestamptz
```

> Note: `follower_count` lives on `uploads` (per scrape), **not** on each post row — this is the resolution of SRS OI-03 and gives a follower history.

### 4.2 TypeScript types

```ts
export type SourceType = "csv" | "json";
export type PostFormatType = "image" | "carousel" | "link" | "text" | "video";

export interface Client {
  id: string;
  name: string;
  linkedin_url: string;
  created_at: string;
}

export interface Upload {
  id: string;
  client_id: string;
  uploaded_at: string;
  source_type: SourceType;
  inserted_count: number;
  updated_count: number;
  unchanged_count: number;
  follower_count: number;
  uploaded_by: string | null;
}

export interface PostMetric {
  linkedin_post_id: string;
  client_id: string;
  post_url: string;
  author_name: string;
  post_content: string;
  posted_date: string;
  impressions: number;
  likes: number;
  comments: number;
  reposts: number;
  engagement_rate: number;
  saves: number;
  post_format_type: PostFormatType | null;
  scrape_timestamp: string;
}

export interface IngestSummary {
  inserted: number;
  updated: number;
  unchanged: number;
}
```

---

## 5. Routes (App Router)

| Route           | Screen                           | UC            | Notes                        |
| --------------- | -------------------------------- | ------------- | ---------------------------- |
| `/login`        | Login                            | UC-01         | Public. Supabase Auth.       |
| `/`             | Dashboard / Post Analytics       | UC-05         | Auth home.                   |
| `/clients`      | Client List (+ Add Client modal) | UC-03 / UC-02 | Row click → `/clients/[id]`. |
| `/clients/[id]` | Client Detail                    | UC-07         | KPIs + upload history.       |
| `/upload`       | Add LI Post Metrics              | UC-04         | Core ingestion.              |
| `/resources`    | Resources                        | UC-06         | Minimal for v1.              |

- `middleware.ts` protects everything except `/login`.
- Reads run in server components via the Supabase server client (RLS-scoped to the session).
- Writes run in **server actions**: `addClient(...)`, `ingestMetrics(...)`.

---

## 6. Features & acceptance criteria

Each feature lists behavior and a testable acceptance-criteria checklist. Build all three states everywhere: **loading**, **empty**, **error** (errors say what happened and how to fix it).

### UC-01 — Login (`/login`)

- Email + password → Supabase Auth → session → redirect to `/`.
- [ ] Valid credentials create a session and land on `/`.
- [ ] Invalid credentials show an inline error and allow retry.
- [ ] Auth service error is reported; no session created.
- [ ] An already-authenticated user visiting `/login` is redirected to `/`.
- [ ] Unauthenticated access to any other route redirects to `/login`.

### UC-02 — Add new client (modal on `/clients`)

- Inline modal with **Name** and **LinkedIn URL**; "Add client" + "Cancel".
- [ ] Submitting valid inputs inserts a `clients` row (via server action) and the list refreshes to include it.
- [ ] Blank name or malformed LinkedIn URL blocks submit with an inline message.
- [ ] Cancel closes the modal with no change.
- [ ] Duplicate handling per **[OPEN] OI-01** (default: block on exact `linkedin_url` match, inline error).
- [ ] Supabase error is reported; nothing is written.
- [ ] No edit/delete affordances anywhere.

### UC-03 — View client list (`/clients`)

- Table of clients: Name, LinkedIn URL, plus the Add-Client entry point.
- [ ] All clients load and display Name + LinkedIn URL.
- [ ] Clicking a client **row** navigates to `/clients/[id]`; the Client List nav item stays active.
- [ ] Clicking the LinkedIn URL opens the profile in a new tab and does **not** trigger row navigation.
- [ ] Empty state when no clients exist.
- [ ] Fetch error shows an error state.

### UC-04 — Submit post metrics (`/upload`) — CORE

- See the full algorithm in §7.
- [ ] Client selector is populated from `clients`.
- [ ] Source toggle CSV | JSON; CSV shows a file input, JSON shows a monospace textarea.
- [ ] Follower count field (numeric, required).
- [ ] Submit is blocked unless client + payload + follower count are all present (E2).
- [ ] Malformed CSV/JSON or missing required fields rejects the whole batch and lists the failing rows/fields; nothing is written (E1).
- [ ] On success, staging is upserted AND one `uploads` row is created with counts, source, follower count, and uploader.
- [ ] The result summary shown to the user (`inserted / updated / unchanged`) matches the persisted `uploads` row.
- [ ] Re-uploading the same scrape yields 0 inserted (updates only) and is not treated as an error (E4).
- [ ] Supabase error is reported with no partial commit (E3).
- [ ] Format-type review appears per **[OPEN] OI-02** (default: only for new posts whose `post_format_type` is empty/invalid; already-stored posts are never re-prompted).

### UC-05 — Post analytics (`/`)

- KPI stat cards + trend chart + recent-posts table, filterable by client and date range.
- [ ] KPI cards show impressions, likes, comments, reposts, engagement rate, saves (with a delta vs. prior period).
- [ ] Client and date-range filters update the view.
- [ ] Trend chart shows metrics over time (historical timeline).
- [ ] Recent-posts table shows content, date, format-type badge, and core metrics.
- [ ] Empty state when no metrics exist (links to `/upload`).
- [ ] Read source per **[OPEN] OI-04** (default: read staging directly).

### UC-06 — Resources (`/resources`)

- Minimal list + add. Keep flexible — model is unconfirmed.
- [ ] Resources list loads and displays.
- [ ] A resource can be added (validated, stored, list refreshes).
- [ ] Shape per **[OPEN] OI-05** (default: `{ id, title, url, created_at }`, global, view + add).

### UC-07 — Client detail (`/clients/[id]`)

- Header: 3 KPI stat cards. Body: upload-history table, most-recent-first.
- [ ] Back link ("← Client list") returns to `/clients`; nav keeps Client List active.
- [ ] **Uploads** KPI = total count of `uploads` for this client (display zero-padded, e.g. `002`).
- [ ] **Posts** KPI = total posts on record for this client.
- [ ] **Followers** KPI = `follower_count` from the most recent upload.
- [ ] History table rows (newest first) show: `#` (sequence index), Uploaded (date + time), Source (CSV/JSON badge), Inserted / Updated / Unchanged (Inserted shown in red), Followers, By (uploader).
- [ ] No-uploads state: KPIs read zero and the history shows an empty state.
- [ ] Fetch error shows an error state.
- [ ] `By` (uploader identity) per **[OPEN] OI-06**.

---

## 7. Ingestion algorithm (UC-04 detail)

Server action `ingestMetrics({ clientId, sourceType, payload, followerCount, resolvedFormatTypes? })`:

1. **Validate inputs** — `clientId`, `payload`, and numeric `followerCount` all present, else return a validation error (E2). Nothing written.
2. **Parse** — CSV via `papaparse`; JSON via `JSON.parse`. On parse failure → E1 (reject batch, return error).
3. **Validate rows** — each row must have the required post fields (at minimum `linkedin_post_id`, the core metrics, `scrape_timestamp`). Any invalid row → reject the **entire** batch and return the failing rows/fields (E1). No partial writes.
4. **Format-type review (conditional, OI-02)** — collect new posts with missing/invalid `post_format_type`. If any and not yet resolved, return them to the client for classification; the client re-submits with `resolvedFormatTypes`. (Design as an optional pre-write step; skippable if the scraper's values are trusted.)
5. **Dedup + upsert** — upsert all rows into the staging table on conflict `linkedin_post_id`. Compute:
   - `inserted` = rows whose `linkedin_post_id` did not exist,
   - `updated` = existing rows where any metric changed,
   - `unchanged` = existing rows identical.
6. **Persist upload record** — insert one `uploads` row: `client_id`, `source_type`, the three counts, `follower_count`, `uploaded_by` (session user id).
7. **Return** `{ inserted, updated, unchanged }` for the UI summary.

**Atomicity:** steps 5–6 must be atomic. Prefer a single Postgres function (RPC) that performs the upsert, returns the counts, and inserts the `uploads` row in one transaction, so a failure can't leave staging written without an upload record (invariant #4). Call the RPC from the server action.

---

## 8. Client-detail aggregates (UC-07)

- `uploadsCount` = `count(*) from uploads where client_id = $1`
- `postsCount` = `count(*) from <staging> where client_id = $1`
- `latestFollowers` = `follower_count from uploads where client_id = $1 order by uploaded_at desc limit 1`
- `history` = `select * from uploads where client_id = $1 order by uploaded_at desc`
- `#` is a display sequence index derived from ordering (e.g. oldest = 1 … newest = N), rendered newest-first.

---

## 9. Data-access / security notes

- App tables (`clients`, `uploads`): enable RLS; allow authenticated users to read/insert; **no update/delete policies** (enforces immutability at the DB layer too).
- Staging table writes: use whichever credential Shay's RLS requires; if the service role is needed, keep it strictly server-side.
- Validate and sanitize all user input server-side; never trust client-provided counts (recompute on the server).

---

## 10. Build order

1. Scaffold Next.js + TypeScript + Tailwind; add Supabase clients (`@supabase/ssr`); wire env vars (§3).
2. Auth: `/login`, session handling, `middleware.ts` route protection (UC-01).
3. Migrations: `clients`, `uploads` (+ index), RLS policies; confirm staging identifier with Shay.
4. Global shell: sidebar nav, top bar, light/dark toggle (per design brief).
5. Clients: list + Add-Client modal (UC-03, UC-02).
6. **Ingestion (core):** `/upload` form + `ingestMetrics` RPC/server action + result summary (UC-04, §7).
7. Client detail: KPIs + upload history (UC-07, §8).
8. Analytics dashboard: KPI cards + trend + recent posts (UC-05).
9. Resources: minimal list + add (UC-06).
10. Cross-cutting pass: loading/empty/error states everywhere, accessibility (focus, keyboard, contrast, reduced motion), responsive.

---

## 11. Open decisions — DO NOT GUESS

Each has a provisional default so you can proceed unblocked; treat defaults as assumptions to confirm, and note where you relied on one.

| Ref   | Decision                                               | Provisional default                                                    |
| ----- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| OI-01 | Duplicate client handling                              | Block on exact `linkedin_url` match; inline error.                     |
| OI-02 | When the format-type review step fires                 | Only for new posts with empty/invalid `post_format_type`.              |
| OI-04 | Analytics read source                                  | Read the staging table directly.                                       |
| OI-05 | Resource data model                                    | `{ id, title, url, created_at }`; global; view + add.                  |
| OI-06 | Uploader identity (`By`)                               | Capture `auth.uid()` from the session; store on `uploads.uploaded_by`. |
| —     | Exact staging table identifier + who creates `uploads` | Coordinate with Shay (owns the Supabase schema).                       |
| —     | RLS policies / service-role usage                      | Per §9; confirm with Shay.                                             |
| —     | Hosting / deploy target                                | TBD.                                                                   |

## 12. Out of scope

Do not build UI or logic for these — they are external systems (per the SRS): the LinkedIn scraper/bookmarklet (upstream), Supabase views (Shay), Power BI (downstream), and credential/VPN provisioning (Sid). Final CSS polish is Anton's; prioritize functional correctness.
