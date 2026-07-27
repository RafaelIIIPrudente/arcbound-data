# 12. The Outreach System: per-Client prospect snapshots, staff-only detail

Date: 2026-07-27

## Status

Accepted. **Extends ArcBase beyond LinkedIn post metrics** to a second service,
and **narrows [ADR 0011](0011-client-report-links.md)** by drawing an explicit
line around what a Report Link may expose: outreach reaches a client as
aggregate counts only, never as prospect rows.

## Context

ArcBase has been a single-service product: register Clients, ingest scraped
LinkedIn post metrics, view analytics. Arcbound also runs a LinkedIn **outreach**
operation, tracked today in a Google Sheet ("Arcbound LinkedIn Master Database",
1,435 rows at the time of writing) and viewed through a hand-built static HTML
page. That page shows four things: total leads, and breakdowns by connection
status, reply status, and stage.

The sheet is a CRM-style pipeline with one row per **Prospect** — the person
being contacted — carrying 24 columns across three groups:

- **Identity** — name, title, company, LinkedIn URL, location.
- **Qualification** — ICP segment, why they fit, what they lack, what Arcbound
  offers, matching client archetype, qualified (ICP), source/citation, rationale.
- **Pipeline** — connection status, date sent, reply status, follow-up count,
  last follow-up date, next touch date, meeting booked (date), stage, owner,
  notes, and the drafted LinkedIn message.

Bringing this into ArcBase forced four questions that the existing LinkedIn
pipeline does not answer, because outreach data differs from post metrics in
kind, not just in shape (grilling session, 2026-07-27):

1. **Whose data is it?** The file carries no usable client key: `Owner` is
   "Bryan" on all 1,432 filled rows, and `Matching Client Archetype` is free text
   with 750 distinct values (mixing generic archetypes like "Founder / CEO /
   investor" with the names of real Arcbound clients). Read literally, the file
   looks like Arcbound's own business development. Arcbound confirmed the
   opposite intent: **outreach is run _for_ Clients**, and this file is the first
   instance.

2. **How is a row attributed?** Inferring the Client from file content would
   repeat the downstream name-match that [ADR 0009](0009-arcbase-conforms-to-external-bi-schema.md)
   already regrets on the LinkedIn side.

3. **What does a re-upload mean?** The sheet is re-exported whole each time. It
   has no `Date Connected` or `Date Replied` column, so connection- and
   reply-movement over time cannot be derived from row data. It also does not
   have a clean row key: `LinkedIn URL` yields 1,419 distinct values across 1,435
   rows, and normalising collapses it further to 1,408 — i.e. the source contains
   genuine duplicate prospects.

4. **May a Client see it?** Unlike post metrics — a Client's own public
   performance data — outreach rows are **third-party personal data**: prospect
   names, LinkedIn URLs, locations, drafted personal messages (807 rows), and
   email addresses embedded in `Notes`. ADR 0011 established a passcode-gated
   client-facing Report Link; extending it naively would publish that PII to
   anyone holding a URL and a code.

## Decision

ArcBase gains an **Outreach System** service, modelled as follows.

**Per-Client, attributed at upload.** Outreach is a per-Client concern and
appears as a fourth tab on the client detail screen (`Overview · Posts · LinkedIn
Report · Outreach`). Staff select the Client on the upload screen and every row
in that file is written with that `client_id` as a real foreign key — the same
mechanism the LinkedIn upload already uses. `Owner` is stored raw and is never
used for attribution. **No name-matching is introduced.**

**Immutable snapshots, not upserts.** Each upload stores the entire file as one
immutable **Outreach Snapshot**, tagged with that upload's id. Current state is
the latest snapshot; movement over time is computed by comparing snapshots. This
is what makes funnel movement observable despite the absent date columns, and it
sidesteps the duplicate-key problem entirely — rows are never matched, merged, or
rewritten. It also mirrors the existing rule that an Upload is immutable.

**Raw storage, canonicalisation only at read.** Every value is stored exactly as
received, per ADR 0009. The source vocabularies are dirty — `Reply Status` has 15
distinct values for what should be about five states, including eight rows where
a date was typed into the status field ("Replied 2026-07-13") — so grouping for
charts happens at read time: trailing dates are stripped, values map to a
canonical set, and anything unrecognised is shown verbatim and disclosed rather
than silently bucketed or dropped. This is the same store-raw/canonicalise-at-read
rule already applied to `post_format_type`.

**Staff-only detail; aggregate-only for clients.** The full pipeline is visible
only to authenticated staff. A Client's Report Link may show outreach **aggregate
counts only** — requests sent, connections accepted, replies, meetings booked —
with no names, no messages, no notes, no URLs. The aggregation is performed
**inside** the SECURITY DEFINER read function, so prospect rows never leave the
database on the public path.

## Consequences

**Good.**

- Attribution is a real foreign key chosen by a human, not an inferred match —
  the failure mode ADR 0009 documents does not recur here.
- Snapshots make the funnel observable over time without asking anyone to change
  the source sheet, and without ArcBase ever rewriting a value.
- The privacy boundary is enforced in SQL rather than in the UI, so a future
  client-facing screen cannot accidentally widen it by rendering a field.
- The LinkedIn pipeline is untouched: outreach lands in its own tables, so the
  working ingest path carries no risk from this change.

**Costs and risks.**

- **Storage grows linearly with uploads** — roughly 1,400 rows per upload per
  Client (~75k rows/Client/year at weekly cadence). Trivial for Postgres, but it
  is deliberate duplication, not normalisation.
- **Trends need two snapshots.** The first upload for a Client can show current
  state only; movement renders an honest empty state until a second upload lands.
- **Low-N figures are unavoidable.** Meetings booked is 7 of 1,230 sent, and
  `Next Touch Date` is filled on 2 rows. Descriptive counts are honest; anything
  reading as a rate, score, or benchmark is not, and the no-score discipline
  applied to cadence and comparison applies here too.
- **Source data quality is inherited, not repaired.** ~27 duplicate prospects and
  a `Date Sent` outlier of `2020-12-04` are stored as they arrive and surfaced as
  data-quality observations.
- A second upload shape means the upload screen becomes tabbed, and the sidebar
  item is renamed from "Add LI Post Metrics" to the service-agnostic **Add Data**.

**Deliberately deferred.** A generalised Service→Dataset discriminator (one
`uploads` table for every service) remains the north star but is not built:
outreach gets its own tables, and unifying them is a later, separate decision.
The prospect-row table on screen, and any client-facing view richer than
aggregate counts, are also out of scope.
