# Context

The shared vocabulary for this repository. This file is a glossary and nothing
else — no implementation details, no decisions. Decisions live in `docs/adr/`.

This repository is the **ArcBase** product: a clone of a web-app starter template
specialized into an internal tool. Terms inherited from the template survive here
only where they remain true; tenancy vocabulary (Organizations, Memberships, Org
Roles, Superadmin) has been retired — see [ADR 0007](docs/adr/0007-arcbase-single-tenant.md).

## Glossary

### Product & people

- **ArcBase** — the product this repository builds: an internal web dashboard for
  Arcbound staff to register Clients, ingest scraped LinkedIn post metrics, and
  view the resulting analytics. It is the middle stage of a pipeline
  (`external scraper → ArcBase → Supabase views + Power BI`).

- **Arcbound** — the company. Its staff are the only users; there is no public
  access.

- **Data Input Specialist** — the primary user, who runs the weekly upload for
  each Client.

- **Engineer/Admin** — sets up and maintains ArcBase and provisions staff
  accounts. There is no self-serve signup.

### Domain

- **Client** — an individual LinkedIn profile (a person) whose post metrics
  Arcbound tracks, identified by a normalized LinkedIn profile URL. This is the
  domain sense of "client" (a tracked subject), never the browser/server sense.

- **Scrape** — one capture of a Client's LinkedIn post metrics at a point in
  time, produced by the external scraper. A Scrape is the input to an Upload and
  arrives as CSV or JSON.

- **Upload** — a first-class, immutable record of one ingested Scrape for one
  Client: when it happened, its source (CSV/JSON), the insert/update/unchanged
  counts, the Follower Count at capture, and who uploaded it. Uploads give a
  Client a history.

- **Post** (a.k.a. **Post Metric**) — the latest-known metrics for a single
  LinkedIn post, keyed by its LinkedIn post id and belonging to one Client.
  Re-ingesting a Scrape updates a Post in place rather than creating a new one.

- **Ingestion** — turning a Scrape into Posts plus one Upload record, atomically,
  and reporting how many Posts were **inserted**, **updated**, or **unchanged**.

- **Attribution** — the linking of a scraped Post to a Client, performed
  DOWNSTREAM of ArcBase by a name match on the Client's name. ArcBase submits
  Posts and can only observe, afterwards, whether they came back attributed; it
  cannot perform or correct the match itself.

- **Follower Count** — a Client's follower total captured with a Scrape. Stored
  per-Upload, which gives a follower history over time.

- **Format Type** (a.k.a. **Asset Type**) — how a Post was published, as reported
  by the Scrape: `IMAGE`, `DOCUMENT`, `VIDEO`, `TEXT`, `POLL`, `ARTICLE`,
  `SLIDE_SHOW`, `SHARE`, `INSTANT_SHARE`, or `UNKNOWN`. ArcBase stores the value
  exactly as received and never rewrites it. A Post whose Format Type is absent,
  unrecognised, or `UNKNOWN` goes to **Format Review**.

- **Format Review** — the step in an Upload where staff assign a Format Type to
  Posts that arrived without a usable one. Staff may instead trust the Scrape and
  skip, which leaves the value as it arrived. No Post is written until review is
  resolved or skipped.

- **Resource** — a team reference link (a title and a URL) shown on the Resources
  screen.

- **Immutability** — the rule that Clients and Uploads are never edited or
  deleted, and Posts change only through re-Ingestion. ArcBase exposes no
  edit/delete affordances for these records.

### Application

- **Posts Table** (a.k.a. **Staging**) — the table Posts live in. ArcBase owns it
  for local development and testing, but its identifier is configurable so a
  deployment can point at the analytics team's own table. See
  [ADR 0006](docs/adr/0006-app-owned-posts-table.md).

- **Service Seam** — the boundary between the UI and its data source. Screens read
  and write through it and never touch a data source directly. Some features are
  wired to a real Supabase backend; un-wired features return mock data.

- **Auth Strategy** — the pluggable authentication-provider abstraction. ArcBase
  wires exactly one strategy (**Supabase**).

- **Dashboard Shell** — the authenticated application frame (sidebar, top bar,
  theme toggle, user menu) that hosts feature screens.

- **Guard** — a mechanism that permits or denies access based on whether the
  current visitor is an authenticated user. A _route Guard_ protects a URL; a
  _component Guard_ protects a region of a screen. In ArcBase every route except
  the login page is guarded.
