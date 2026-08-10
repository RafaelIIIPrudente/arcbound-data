# Decision — Outreach System: the Email channel (15 new source columns)

**Status:** 🟡 shaping (planning session, 2026-08-03)
**Branch:** `feat--implement-RBAC` (current working branch; a dedicated branch is likely — see D0)
**Trigger:** Bryan supplied a refreshed `Master DB` export and asked to add the new columns.
**Relates to:** ADR 0009 (raw values never rewritten), ADR 0012 (per-client immutable
outreach snapshots), [`arcbase-outreach-system`] memory.

---

## 1. The source audit (measured, not assumed)

File: `~/Desktop/Master DB-Table 1.csv`, read 2026-08-03.

|             | Previous export | This export      |
| ----------- | --------------- | ---------------- |
| Columns     | 24              | **39**           |
| Data rows   | 1,435           | **1,614** (+179) |
| Ragged rows | —               | 0                |

**The first 24 columns are byte-identical to `OUTREACH_HEADERS`, in the same order** —
compared programmatically, not by eye. Consequence: **this file uploads successfully
today.** `parseOutreachCsv` errors only on MISSING headers; the 15 extras return in
`unknownHeaders` and `unknownColumnWarning` surfaces them non-blockingly. Nothing is
broken right now; the email data is simply dropped.

### The 15 new columns

All are prefixed `Email — ` where the separator is an **EM DASH (U+2014)**, not a hyphen.
Eleven mirror an existing LinkedIn column; four have no twin.

| New column                      | LinkedIn twin           | Filled / 1,614 |
| ------------------------------- | ----------------------- | -------------- |
| `Email — Best Email`            | _(none — new)_          | 630 (39.0%)    |
| `Email — Mobile`                | _(none — new)_          | 15 (0.9%)      |
| `Email — Subject Line`          | _(none — new)_          | 533 (33.0%)    |
| `Email — Message`               | `LinkedIn Message`      | 528 (32.7%)    |
| `Email — Status`                | `Connection Status`     | 650 (40.3%)    |
| `Email — Date Emailed`          | `Date Sent`             | 645 (40.0%)    |
| `Email — Reply Status`          | `Reply Status`          | 651 (40.3%)    |
| `Email — Follow-up Count`       | `Follow-up Count`       | 537 (33.3%)    |
| `Email — Last Follow-up Date`   | `Last Follow-up Date`   | 7 (0.4%)       |
| `Email — Next Touch Date`       | `Next Touch Date`       | 628 (38.9%)    |
| `Email — Webinar Registered`    | _(none — new)_          | 536 (33.2%)    |
| `Email — Meeting Booked (date)` | `Meeting Booked (date)` | 13 (0.8%)      |
| `Email — Stage`                 | `Stage`                 | 651 (40.3%)    |
| `Email — Owner`                 | `Owner`                 | 630 (39.0%)    |
| `Email — Notes`                 | `Notes`                 | 630 (39.0%)    |

### What the app currently misses

The funnel in `src/services/outreach-analytics.ts` reads four LinkedIn-only columns
(`date_sent`, `connection_status`, `reply_status`, `meeting_booked_date`). Booked
meetings, counted across both columns:

- LinkedIn only: **6**
- Email only: **5**
- Both: **8**
- **Union: 19** — the dashboard reports **14**

Five booked meetings are invisible today. **19 is itself a floor**, because
`Email — Reply Status` also records bookings inside free text
(`Replied - Positive (booked 2026-07-27)`), which no column-based count reaches.

### Vocabulary hazards measured in the new columns

- `Email — Reply Status` is **case-split on its two largest buckets**: `'No reply'`
  (471) and `'No Reply'` (144). Naive grouping reports two categories for one meaning.
- `Email — Status` and `Email — Stage` **overlap rather than being independent axes**:
  `'Drafted'` is the top value in both (626 / 469).
- `Email — Status` is `'Drafted'` on 626 of 650 filled cells, yet `Email — Date Emailed`
  is filled on 645. **"Drafted" and "has a send date" contradict each other** — what
  counts as _sent_ on the email side is not answerable from the file (see D2).
- `Email — Next Touch Date` carries **two formats for the same day**: `2026-08-03` and
  `2026-08-03 0:00:00` (38 rows on the timestamped form).
- `Email — Webinar Registered` is **100% `'No'`** across all 536 filled cells — zero
  information content so far. That is "no signal yet", not "nobody registered".
- Dates embedded in status text recur exactly as on the LinkedIn side
  (`'Replied 2026-07-13'`), plus a new form: booking dates inside reply status.

### A new defect in an EXISTING column

`Stage` has acquired **`'Closed – Low Fit'` with an EN DASH (U+2013) on 3 rows**,
alongside `'Closed - Low Fit'` with a plain hyphen on 9. One label, two spellings, in a
column the dashboard already reads. Not caused by this change; surfaced by it.

---

## 2. What "add these columns" touches

Four artefacts move together or the read lies at runtime:

1. `supabase/outreach-system.sql` — `public.outreach_prospects` columns + the
   `ingest_outreach` RPC's insert list. **SQL is applied by staff via the Supabase SQL
   editor, never `db push`, never by an agent.**
2. `src/lib/parse-outreach.ts` — `cellsSchema` (which derives `OUTREACH_HEADERS`) and
   `outreachRowSchema`'s transform.
3. `src/services/outreach.ts` — `ProspectRow`, `PROSPECT_COLUMNS`, `toProspect`.
   ⚠️ `asPage` **asserts** the row type rather than checking it: editing one without the
   others compiles cleanly and lies at runtime.
4. `src/services/types.ts` — `OutreachRow`, `OutreachProspect`.

And, if the funnel changes:

5. `src/services/outreach-analytics.ts` **and** `supabase/outreach-report-link.sql`
   (`public.report_link_read`) — the four funnel rules are implemented **twice, in two
   languages**, with `outreach-analytics.test.ts` pinning each SQL predicate against its
   TypeScript twin. The duplication is deliberate: computing the Client's figure in TS
   would mean shipping prospect rows out of the database on the public path, which
   ADR 0012 forbids.

---

## 3. Open decisions

| #   | Decision                                                                                                                    | Status                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| D0  | Branch                                                                                                                      | planner call — **`feat-outreach-email-channel` off `893d9c7`** (tree clean; Services work committed) |
| D1  | Does the email track get its own funnel, merge into one, or stay unanalysed for now?                                        | ✅ **DECIDED 2026-08-03 — two funnels, side by side, NEVER summed**                                  |
| D2  | What counts as "sent" on the email side, given `Status='Drafted'` (626) vs `Date Emailed` filled (645)?                     | ✅ **DECIDED 2026-08-03 — real send dates; `Email — Status` is stale**                               |
| D3  | Does the OLD 24-column export still upload after the schema grows to 39? (today a missing header is a hard error)           | ✅ **DECIDED 2026-08-03 — record what the file carried; all 39 required going forward**              |
| D4  | Does the Client's public Report Link show the Email funnel? (aggregate only — `report_link_read` never ships prospect rows) | ✅ **DECIDED 2026-08-03 — yes, Email funnel on the client report; counts only**                      |
| D5  | Does the prospect table show the new columns, and how (39 columns is unusable as a flat table)?                             | ✅ **DECIDED 2026-08-03 — channel toggle LinkedIn / Email / All, default LinkedIn**                  |
| D6  | Does `canonicalReply` learn the new `Replied - Positive (booked <date>)` shape, or disclose it?                             | ✅ **DECIDED 2026-08-03 — strip the qualifier, disclose it verbatim**                                |
| D7  | Fix the `Stage` en-dash split in `matchKey`                                                                                 | ✅ planner call — **yes, fold in** (see below)                                                       |

---

## 4. Decisions in detail

### D1 — Two funnels, side by side, NEVER summed

The LinkedIn funnel keeps its four rules and its numbers unchanged. A second **Email
funnel** sits beside it with its own steps and its own source-column labels. The page
never adds the two.

Rejected: a merged funnel. The denominators differ (1,614 vs 651 prospects), two of the
four LinkedIn steps have no email analogue, and 8 prospects have a booked meeting in
BOTH columns — so adding the funnels gives 27 meetings where the true union is 19.

⚠️ **Booked meetings needs one combined figure, computed as a UNION and labelled as
one** — never as a sum of the two funnels' bottom steps.

### D2 — `Email — Date Emailed` is a REAL send date; `Email — Status` is stale

Bryan's ground truth, 2026-08-03, and it overturns what the file appears to say. The
evidence pointed the other way — 625 of those rows read `'Drafted'`, only 4 rows
anywhere read `'Sent'`/`'Emailed'` — but the status column is simply not maintained.

Consequences, all binding:

- The Email funnel's first step is **Emails sent = a value is recorded in
  `Email — Date Emailed`** (645 in this export).
- ⚠️ **NOTHING IS EVER COUNTED FROM `Email — Status`.** It is stored raw like every
  other column and may be shown on a prospect's detail, but it is a stale field and no
  figure may be derived from it. A future reader will find `'Drafted'` on 96% of rows
  and be tempted; this line is why they must not.
- 21 rows carry a send date with no `Email — Best Email`, and 3 carry one while the
  status says the recipient was never found. These become a **disclosed data-quality
  note**, not a filter — the rows still count as sent, and the discrepancy is stated.

### D3 — Record what the file carried; all 39 headers required going forward

Ingest stamps the upload row with whether the file included the email block. A snapshot
taken before this change renders the Email funnel as **"not in this export"** — em dash,
the reserved marker for "could not be read" — and **never as zeros**.

⚠️ **THIS IS THE WHOLE POINT OF THE EXTRA COLUMN.** Every snapshot already in
`outreach_prospects` will have NULL email columns after the migration. Without a record
of what the file carried, an old snapshot's Email funnel reads `0 sent / 0 replied /
0 meetings` under a real upload date — absence rendered as a measurement, the exact
four-state failure this codebase bans everywhere else. Rejected for that reason.

Also rejected: making the 15 headers optional. It would make "the file had no email
columns" permanently indistinguishable from "nobody emailed anyone", and unlike the
above that ambiguity can never be recovered afterwards.

Going forward a missing header stays a **hard error**, same doctrine as today's 24: a
file missing `Email — Notes` is not a file with 1,614 blank email notes, it is a
different export.

### D4 — The Email funnel goes on the Client's public Report Link too

Counts only. No address, no phone — the aggregate boundary in `report_link_read` already
guarantees no prospect row crosses the unauthenticated path (ADR 0012), and this does not
weaken it.

⚠️ **THE NEW PREDICATES MUST BE WRITTEN TWICE, IN TWO LANGUAGES**, exactly as the
existing four are: TypeScript in `src/services/outreach-analytics.ts` and SQL in
`supabase/outreach-report-link.sql`. `outreach-analytics.test.ts` pins each SQL predicate
against its TypeScript twin and must be extended to cover the new ones — otherwise the
Client's report silently disagrees with the staff page and nobody sees both at once.

### D7 — Fold the en-dash fix into `matchKey` (planner call, not asked)

`Stage` now carries `'Closed – Low Fit'` (EN DASH, 3 rows) beside `'Closed - Low Fit'`
(hyphen, 9 rows). Today `matchKey` normalises only the ASCII hyphen, so the en-dash value
misses `STAGE_BY_KEY`, comes back verbatim under its own name, and `isKnownStage` reports
it as unfamiliar.

**That failure mode is already honest** — a separate bar, disclosed verbatim, nothing
merged or guessed. So this is a quality fix, not a defect repair.

Extending `matchKey` to treat `–` (U+2013) and `—` (U+2014) as `-` is squarely inside the
module's own stated rule — _"CANONICAL MEANS SPELLING, NOT GROUPING"_ — because the two
values are one state written with two dash characters. Recommended to fold in, with a
test pinning both spellings to one stage.

### Two findings that need NO work

- **`'No reply'` vs `'No Reply'` is already handled.** `matchKey` lowercases before
  lookup, so the 471/144 case split collapses to one bucket with no new code. Worth
  recording so nobody "fixes" it twice.
- **`Email — Webinar Registered` is 100% `'No'`.** Stored like everything else, but no
  figure may be derived from a column with zero observed variation. It is not evidence
  that nobody registered.

### D5 — Channel toggle on the prospect table

TanStack's built-in column visibility, one control above the table:
**LinkedIn (default) / Email / All**. The default set is exactly today's 24 columns, so
the screen staff use daily is unchanged. All 39 columns exist in the table definition;
only visibility differs.

Rejected: appending 15 always-visible columns. The table already scrolls horizontally at
24 (its own comment says so) and 39 pushes the most-used columns further from the name.

### D6 — Strip a trailing qualifier, disclose it verbatim

`'Replied - Positive (booked 2026-07-27)'` charts as **Positive reply**, and the stripped
`(booked 2026-07-27)` is listed verbatim in the disclosure block. 14 rows across both
channels are affected — the positive ones, which is why leaving them in
`Status not recognised` was the wrong trade.

⚠️ **STAKES ARE LOWER THAN THEY LOOK, AND THE REASON MATTERS.** The funnel's Replied step
counts anything that is neither `no-reply` nor `not-recorded`, so an `unrecognised` value
**already counts as a reply**. This decision changes the sentiment BREAKDOWN chart only —
no funnel count moves either way.

⚠️ **STRIP THE QUALIFIER, THEN THE TRAILING DATE, THEN MATCH** — in that order.
`'Replied 2026-07-30 (declined)'` needs the parenthetical removed before
`TRAILING_ISO_DATE` can see the date. It lands on `replied-unspecified`, not `negative`:
somebody replied and no sentiment word was written, and `(declined)` is disclosed rather
than converted into a sentiment nobody typed.

The one value that argues against this rule is
`'Replied - Positive (via email; meeting canceled)'` (1 row), where the qualifier
arguably reverses the outcome. It charts as Positive **with the cancellation disclosed**,
which is why disclosure is not optional decoration here — it is the thing that makes the
strip safe.

### ⚠️ Correction to an earlier planner claim

An earlier note in this workstream said the union of 19 booked meetings was a **floor**,
because bookings also appear inside `Email — Reply Status` free text. **That is wrong.**
All 11 rows whose reply status says `(booked <date>)` also carry a value in
`Email — Meeting Booked (date)` — measured, not assumed. **19 is exact.**

---

## 6. Delivery sequence

Four slices, dependency-ordered. **Two separate SQL applications** are required, both by
staff via the Supabase SQL editor — never `db push`, never by an agent.

| Slice                      | Scope                                                                                                                                                                                                                                                                     | SQL?    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **S1 — Data layer**        | 15 text columns on `outreach_prospects`; a column on `outreach_uploads` recording that the file carried the email block; `ingest_outreach` insert list; `cellsSchema` → 39 headers; `OutreachRow` / `OutreachProspect`; `ProspectRow` / `PROSPECT_COLUMNS` / `toProspect` | **yes** |
| **S2 — Analytics + vocab** | Email funnel (3 steps: sent → replied → meetings) in `outreach-analytics.ts`; the exact 19-style union meetings figure; the "not in this export" state for pre-change snapshots; `matchKey` dash fix; qualifier stripping + disclosure                                    | no      |
| **S3 — Staff UI**          | Email funnel on the Outreach tab; channel toggle on the prospect table; disclosure of new unrecognised values and the send-date-without-address data-quality note                                                                                                         | no      |
| **S4 — Public path**       | The SQL twin of the new predicates in `report_link_read`; extend the pinning test; render the Email funnel on `/r/[token]`                                                                                                                                                | **yes** |

⚠️ **S1's four artefacts move together or the read lies at runtime** — `asPage` asserts the
row type rather than checking it, so editing `ProspectRow` without `PROSPECT_COLUMNS`
compiles cleanly and returns `undefined` for a whole column on every row.

---

## 7. Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 2026-08-03 | Created. Source audit measured from the supplied CSV; touch-surface mapped from the repo; D0–D7 opened; D1 put to Bryan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2   | 2026-08-03 | D1 decided — two funnels, never summed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3   | 2026-08-03 | D2 decided — Bryan confirms real send dates, `Email — Status` stale. **This reverses the planner's reading of the file**, which had inferred drafts-only from the 'Drafted' majority and the 3 no-recipient rows. Ground truth beat inference; recorded so the inference is not re-derived later.                                                                                                                                                                                                                                                                                                            |
| 4   | 2026-08-03 | D3 decided — stamp the upload with what the file carried; all 39 required going forward. D4 put to Bryan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 5   | 2026-08-03 | D4 decided — Email funnel on the client report, counts only. D7 taken as a planner call (fold the en-dash fix into `matchKey`). Two no-work findings recorded so nobody re-solves them.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 6   | 2026-08-03 | D5 decided — channel toggle on the prospect table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 7   | 2026-08-03 | D6 decided — strip trailing qualifiers, disclose verbatim. **Planner correction recorded**: the 19 booked meetings are exact, not a floor; all 11 free-text bookings are already covered by `Email — Meeting Booked (date)`. D0 taken as a planner call (dedicated branch; tree verified clean at `893d9c7`). Delivery sequence S1–S4 written.                                                                                                                                                                                                                                                               |
| 8   | 2026-08-03 | **S1 LANDED**, planner-verified at 124 files / 1,837 tests — see [`docs/handoffs/2026-08-03-outreach-email-s1-data-layer.md`](../handoffs/2026-08-03-outreach-email-s1-data-layer.md). Two amendments raised before the SQL is applied: **A1 (blocking)** — `drop function` + a no-default three-arg replacement breaks outreach uploads in BOTH deploy orders; fix is `p_has_email_channel boolean default false`, where `false` is the correct value for any two-argument caller rather than a fallback. **A2** — two stale "24-column" comments left inside `parse-outreach.ts`, a file the slice edited. |
