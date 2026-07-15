# ArcBase — SRS input notes (design build, 15 Jul 2026)

Notes captured from the UI build for lifting into the SRS. Two parts: (A) the new
Client Detail / upload-history feature, (B) the scrape file schema confirmed from a
real sample (`linkedin_posts_*.csv`, author: Bryan Wish).

---

## A. New feature — Client Detail + Upload History (extends UC-03)

**Navigation**

- Each row in the Client List is clickable and opens that client's detail page.
- The "Client List" nav item stays active while drilled in; a "← Client list" back
  link returns to the list. LinkedIn URL link opens in a new tab without triggering
  the row navigation.

**Header summary (KPI stat treatment):** Uploads (count), Posts (count),
Followers (from most recent upload).

**Upload history table (most-recent-first):** one row per scrape upload, fields —
`#` sequence · Uploaded (timestamp) · Source (CSV / JSON) · Inserted · Updated ·
Unchanged · Followers (at capture) · By (uploader).

**Data-model implications**

- An upload/scrape is now a **first-class persisted record** per client, not just a
  transient result. Stores: timestamp, source type, insert/update/unchanged counts,
  follower count at capture, uploader identity.
- Resolves **OI-03**: follower count is stored **per-scrape** (gives follower history).
- Requires query: "uploads for client X ordered by date desc" + per-client aggregates.
- **New field — uploader identity ("By")**: confirm it is captured from the
  authenticated session (UC-01). Not in the original brief.
- Records remain immutable / view-only (no edit or delete) — unchanged from brief.

---

## B. Confirmed scrape file schema (CSV & JSON)

15 columns, in order:

| Column             | Notes                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| `linkedin_post_id` | Numeric activity id. Same value embedded in `urn`. Natural **dedup key**. |
| `urn`              | e.g. `urn:li:activity:7482826683478081536`                                |
| `post_url`         | Feed permalink (or Pulse article URL for long-form)                       |
| `analytics_url`    | LinkedIn post-summary analytics link                                      |
| `post_name`        | **The author**, e.g. `Bryan Wish • You` → maps to the client, not a title |
| `post_content`     | Full post body (long, may contain quotes/commas/newlines/emoji)           |
| `post_date`        | **Relative string** — `23h`, `4d`, `1w` — NOT a timestamp                 |
| `impressions`      | integer                                                                   |
| `likes`            | integer                                                                   |
| `comments`         | integer                                                                   |
| `reposts`          | integer                                                                   |
| `engagement_rate`  | **Pre-computed** per post (e.g. `6.23`)                                   |
| `saves`            | **Often blank** in sample                                                 |
| `post_format_type` | **Blank in every sample row**                                             |
| `scraped_at`       | ISO 8601 UTC timestamp (e.g. `2026-07-15T15:25:39.889Z`)                  |

**Decisions this raises for the SRS**

1. **OI-02 (post_format_type):** blank for every row in the sample — so under current
   data the format-type review step fires for all new posts. Decide: always prompt on
   blank, or infer (e.g. Pulse `post_url` → `link`) and only prompt on low confidence.
2. **`post_date` normalization:** relative values must be resolved to an absolute date
   (against `scraped_at`) on ingest, or the analytics timeline can't be built reliably.
   Recommend storing a derived `posted_at` timestamp.
3. **`engagement_rate`:** decide whether to trust the scraped value or recompute from
   raw counts + impressions for consistency.
4. **`saves` blank handling:** store as null vs 0 — affects the Saves KPI and deltas.
5. **Dedup key:** use `linkedin_post_id`; re-uploading the same scrape → 0 inserts (normal).
6. **CSV robustness:** `post_content` contains commas, quotes, and newlines — parser must
   handle RFC-4180 quoting.

**Out of scope reminder (unchanged):** scraper/bookmarklet, Supabase schema/views,
Power BI, credential/VPN provisioning.
