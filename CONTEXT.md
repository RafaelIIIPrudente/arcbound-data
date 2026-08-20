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
  view the resulting analytics. It is the **terminal** of the pipeline
  (`external scraper → ArcBase`): ArcBase stores the scrape in its own
  `public.posts` and computes every figure it shows. Nothing reads downstream of
  it (ADR 0010).

- **Arcbound** — the company. Its staff are the only users; there is no public
  access.

- **Data Input Specialist** — the primary user, who runs the weekly upload for
  each Client.

- **Engineer/Admin** — sets up and maintains ArcBase and provisions staff
  accounts. There is no self-serve signup.

- **Staff Role** — the privilege tier attached to an Arcbound staff Supabase
  account. Two values: **Admin** and **Data Analyst**. A Staff Role is _not_ a
  tenant ([ADR 0007](docs/adr/0007-arcbase-single-tenant.md) stands — all staff
  share one dataset), _not_ a Client (that is the LinkedIn profile being tracked),
  and _not_ the Report Link read grant
  ([ADR 0011](docs/adr/0011-client-report-links.md)), which is not a user account
  at all. See [ADR 0013](docs/adr/0013-arcbase-staff-roles.md).

- **Admin** — a Staff Role that adds the governance surface: registering a
  Client, issuing/rotating/revoking a Report Link, and assigning Staff Roles.

- **Data Analyst** — a Staff Role that uploads data and reads everything. The
  default: a staff account with no assigned role is a Data Analyst.

### Domain

- **Client** — an individual LinkedIn profile (a person) whose post metrics
  Arcbound tracks, identified by a normalized LinkedIn profile URL. This is the
  domain sense of "client" (a tracked subject), never the browser/server sense.

- **Industry** — the line of business a Client is in, chosen from a controlled
  registry an Admin curates rather than typed per Client, so the same industry is
  spelled one way everywhere. An industry may be **archived** — retired from
  being offered to new Clients while every Client already recorded in it keeps
  it. Not recorded is a legitimate and common state, distinct from unreadable.

- **Writer** — the Arcbound staff member who writes for a Client, recorded as a
  row in the admin-managed **writers registry** (`public.writers`), exactly as an
  **Industry** is. ⚠️ An assignment, not a permission: it grants no access and
  withholds none, and every staff member still reads every Client (see **Staff
  Role**).

  ⚠️ **A writer is not an account, and the difference is why the model changed.**
  `clients.writer_id` once referenced `auth.users`, so recording who wrote for a
  Client required issuing that person a login — making a Writer exactly the thing
  this entry denies it is. It is now a foreign key onto a registry of people
  ([ADR 0017](docs/adr/0017-writer-is-a-registry-not-an-account.md)).

  ⚠️ **Two states, and it used to be four.** A Writer is either recorded or not.
  The other two — "assigned to an account that no longer exists" and "the staff
  directory could not be read" — were artefacts of resolving a login through a
  second read that could fail; the writer now rides the client select as an embed
  over the foreign key, so a recorded writer always resolves. **"Not recorded" is
  still a fact and is never an em dash**, which on the Client List means "could
  not be read" and nothing else.

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

- **Connections** — a Client's total LinkedIn connection count captured with a
  Scrape, stored per-Upload alongside Follower Count, which gives a connection
  history over time. Optional at capture: a Scrape may arrive without it, and a
  missing value is recorded as absent — never zero — so it reads as a gap in the
  history rather than a real count.

- **Shares** — a repost of a Client's Post. The Scrape and the BI views call this
  `reposts`; staff always see "Shares". The raw field name is never shown.

- **Format Type** (a.k.a. **Asset Type**) — how a Post was published, as reported
  by the Scrape: `IMAGE`, `DOCUMENT`, `VIDEO`, `TEXT`, `POLL`, `ARTICLE`,
  `SLIDE_SHOW`, `SHARE`, `INSTANT_SHARE`, or `UNKNOWN`. ArcBase stores the value
  exactly as received and never rewrites it. A Post whose Format Type is absent,
  unrecognised, or `UNKNOWN` goes to **Format Review**.

- **Format Review** — the step in an Upload where staff assign a Format Type to
  Posts that arrived without a usable one. Staff may instead trust the Scrape and
  skip, which leaves the value as it arrived. No Post is written until review is
  resolved or skipped.

- **Outreach System** — the Arcbound service that contacts people on a Client's
  behalf on LinkedIn, tracked as a pipeline of Prospects. It is the second
  service ArcBase reports on, alongside LinkedIn post metrics.

- **Prospect** — a person the Outreach System has contacted or intends to contact
  on behalf of one Client. A Prospect is never an ArcBase user and never a
  Client; they are a third party, and their details are staff-only.

- **Outreach Snapshot** — one immutable capture of a Client's entire Prospect
  pipeline at a point in time, ingested as a single Upload. The current pipeline
  is the latest Snapshot; movement over time is read by comparing Snapshots.
  Snapshots are never merged, deduplicated, or rewritten.

- **Stage** — how far a Prospect has progressed in the pipeline, as reported by
  the Outreach System: the furthest point reached (e.g. Requested, Connected,
  Replied, Meeting Booked, or a closed outcome). Distinct from **Connection
  Status**, which only records whether the connection request was accepted.

- **Resource** — a team reference link (a title and a URL) shown on the Resources
  screen.

- **Immutability** — the rule that a Client's **identity** is never edited,
  Uploads are never edited or deleted, and Posts change only through
  re-Ingestion.

  ⚠️ **Identity, not the whole Client record.** A Client's **name** and
  **LinkedIn URL** are unreachable by every write path ArcBase has, at any
  privilege. That is load-bearing rather than tidy: the name is the text the
  reporting pipeline joins scraped Posts on, so editing it silently
  re-attributes or strands a Client's entire history.

  **Attributes recorded _about_ a Client are assignable by an Admin** — its
  **Arcbound Services** ([ADR 0015](docs/adr/0015-arcbound-services-registry.md)),
  and its **Industry** and **Writer**
  ([ADR 0016](docs/adr/0016-client-industry-and-writer.md)). ⚠️ **The line that holds is identity vs
  attribute, not record vs relation.** An earlier wording drew it in the second
  place — Services were "a row in a separate relation, changing nothing about the
  Client record" — and that stopped being true when Industry and Writer landed on
  the Client record itself. What survived the change is the narrower claim: who
  the Client _is_ cannot be edited; what Arcbound records _about_ them can.

- **Arcbound Service** — an offering Arcbound sells to its Clients (e.g. LinkedIn
  Growth, Outreach System). A registry entry, editable and archivable by an Admin.

  ⚠️ **Not the [Service Seam](#application)**, which is the UI↔data boundary and
  the meaning of `src/services/`. The two senses of "service" are unrelated: this
  one is a product Arcbound delivers. Code names it `ArcboundService` and
  `arcbound-services.ts`, never bare `Service`, so the two cannot be confused at a
  call site.

- **Handler** — the identifier on an Arcbound Service naming the ingestion
  pipeline that implements it. The valid set is fixed in code (and mirrored by a
  database constraint), so an Admin chooses from it and can never invent one:
  **visibility is data, capability is code**. A Service with **no** Handler is a
  real, listed offering — countable and reportable — that simply has no upload
  path and no data tab. "Has a pipeline" and "listed but not ingestible" are
  different facts and are never collapsed.

- **Engagement** — the record that one Client receives one Arcbound Service. What
  makes a Service visible on that Client, and what the delete guard protects: a
  Service any Client is engaged with cannot be deleted, only archived.

### Application

- **Posts Table** (a.k.a. **Staging**) — the table Posts live in. ArcBase owns it
  for local development and testing, but its identifier is configurable so a
  deployment can point at the analytics team's own table. See
  [ADR 0006](docs/adr/0006-app-owned-posts-table.md).

- **Service Seam** — the boundary between the UI and its data source. Screens read
  and write through it and never touch a data source directly. Some features are
  wired to a real Supabase backend; un-wired features return mock data.

  ⚠️ **This is the `src/services/` sense of "service", and it is NOT an
  [Arcbound Service](#domain)** — the thing Arcbound sells. Both words appear in
  this codebase and they name unrelated concepts; the offering always carries the
  `Arcbound` prefix in code for exactly this reason.

- **Auth Strategy** — the pluggable authentication-provider abstraction. ArcBase
  wires exactly one strategy (**Supabase**).

- **Dashboard Shell** — the authenticated application frame (sidebar, top bar,
  theme toggle, user menu) that hosts feature screens.

- **Guard** — a mechanism that permits or denies access based on whether the
  current visitor is an authenticated user. A _route Guard_ protects a URL; a
  _component Guard_ protects a region of a screen. In ArcBase every route except
  the login page (and the passcode-gated Report Link) is guarded.

- **Report Link** — a revocable, read-only URL that lets a Client's own viewer see
  that one Client's live report without an ArcBase account. It is a capability
  bound to a single Client, not a user identity: the viewer is never an
  authenticated user and can reach only that Client's data. Exactly one Report Link
  is active per Client at a time.

- **Access Code** — the out-of-band passcode a viewer must supply, together with the
  Report Link URL, to open the report. It gates a Report Link; possession of the
  URL alone is not enough.

- **Report Status** — the at-a-glance state shown atop a Report Link view: how
  current the data is (last Scrape date and tracked-since) and a plain, non-graded
  activity line (recent posting cadence and trend direction). It describes state,
  never a score or grade.
