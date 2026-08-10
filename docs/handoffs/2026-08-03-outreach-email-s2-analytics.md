# Handoff — Outreach Email channel, S2: analytics + vocabulary

**Status:** 🟡 EMITTED — handed to a fresh executer session, not yet run.
**Branch:** `feat-outreach-email-channel` off `893d9c7`, with S1 uncommitted ahead of it.
**Baseline gate:** 125 files / 1,843 tests.
**Decision record:** [`docs/decisions/2026-08-03-outreach-email-channel.md`](../decisions/2026-08-03-outreach-email-channel.md) (D1–D7).
**Predecessor:** [S1 — data layer](./2026-08-03-outreach-email-s1-data-layer.md) — 🟢 landed, SQL applied, both halves live-verified.

---

## What this slice is

Pure computation only. **Nothing renders** — S3 draws it. S2 turns the 15 `email_*`
columns S1 now stores into an Email funnel, and fixes two read-time vocabulary defects
that affect both channels.

### 1. The Email funnel — THREE steps, not four

There is no acceptance gate over email, so the LinkedIn funnel's four steps do not map.

| Step            | Rule                                                | Observed |
| --------------- | --------------------------------------------------- | -------- |
| Emails sent     | a value in `Email — Date Emailed`                   | 645      |
| Replied         | `Email — Reply Status` neither _No reply_ nor blank | —        |
| Meetings booked | a date in `Email — Meeting Booked (date)`           | 13       |

⚠️ **`Email — Status` is stale and nothing may be counted from it (D2).** It reads
`'Drafted'` on 625 rows that also carry a send date; only 4 rows anywhere read `'Sent'`.
Arcbound's ground truth overrode the file's own appearance.

### 2. Combined meetings — a UNION, computed as one

Prospects with a value in _either_ meeting column. 8 rows carry both, so adding the two
funnels' bottom steps gives 27 where the truth is **19**. A mutation test pins this.

### 3. "Not in this export" ≠ zero

Requires reading `has_email_channel` through `UploadRow` / `UPLOAD_COLUMNS` / `toUpload` /
`OutreachUpload` — the seam S1 deliberately deferred. Modelled as a **discriminated
union**, not a nullable object, so "this export had no email block" cannot fuse with "the
email block was empty". Follows the `LatestSnapshot` precedent.

### 4. Two vocabulary fixes, both inside `outreach-vocab.ts`

- **`matchKey` normalises only the ASCII hyphen.** `Stage` has acquired
  `'Closed – Low Fit'` with an EN DASH on 3 rows beside the hyphen form on 9. Normalise
  U+2013 and U+2014. This is a **quality fix, not a defect repair** — the en-dash value
  already degrades honestly (own bar, disclosed as unfamiliar).
- **`canonicalReply` cannot read a trailing qualifier**, so 14 rows across both channels
  reach `unrecognised`. Strip parenthetical → then trailing date → then match.
  ⚠️ **That order is load-bearing.** `'Replied 2026-07-30 (declined)'` must land on
  `replied-unspecified`, never `negative` — nobody typed a sentiment word, and `(declined)`
  is disclosed rather than converted into one. Every stripped qualifier is exposed
  verbatim, the way `replyDate` already exposes a stripped date.

---

## Design calls made in the handoff

**A separate builder, not an extension of `buildOutreachAnalytics`.** `EmailAnalytics`
lives in a new `src/services/email-analytics.ts`, and `src/services/outreach-analytics.ts`
is explicitly OUT of scope. Two reasons:

1. It mirrors D1 in the code's own shape — two funnels side by side, structurally
   incapable of being summed by accident.
2. `outreach-analytics.test.ts:350` pins `Object.keys(a).sort()` on `OutreachAnalytics`.
   Leaving that pin **passing unchanged** is the proof the LinkedIn side did not move.

**The vocab fixes deliberately change existing LinkedIn outputs.** Two reply values and
three Stage rows leave the "unrecognised" disclosure lists. Assertions in
`outreach-analytics.test.ts` will legitimately need updating; the brief requires each one
quoted before/after with a justification, and forbids weakening any.

**Also carried:** `sentWithoutAddress` — rows with a send date and no `Email — Best Email`
(21, of which 3 say outright no recipient was found). Those rows **still count as sent**
per D2; the number is a disclosure, never a filter.

---

## Scope handed over

|                  | Files                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Create**       | `src/services/email-analytics.ts` + `.test.ts`                                                                                                                                |
| **Modify**       | `src/lib/outreach-vocab.ts` + test · `src/services/types.ts` · `src/services/outreach.ts` + test · `src/services/outreach-analytics.test.ts` (vocab-affected assertions only) |
| **Do not touch** | `src/services/outreach-analytics.ts` · anything under `src/components/` or `src/app/` · anything under `supabase/` · `src/lib/parse-outreach.ts`                              |

Verification is the automated gate only — no Claude-in-Chrome, no dev server, no database
access. Work stays UNCOMMITTED on top of S1's.

---

## Open / to verify after the run

- Test count strictly up from 1,843, no assertion weakened.
- The union-collapsed-to-addition mutation must go red — that is the D1 invariant.
- The `OutreachAnalytics` key-set pin at `outreach-analytics.test.ts:350` must pass
  **unchanged**.
- A structural test must fail if `UploadRow` gains a key without `UPLOAD_COLUMNS`
  (`asPage` asserts the row type rather than checking it).
- Still deferred to S3: the one-line stale comment at
  `src/app/(app)/upload/outreach-actions.ts:55` ("the ordinary 24-column export"),
  correctly not widened into by S1 or S2.

---

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                       |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2026-08-03 | Created when the S2 handoff was emitted. Records the three-step funnel, the union rule, the discriminated-union "not in this export" state, the two vocab fixes and their load-bearing order, and the decision to put the Email funnel in a separate builder so the `OutreachAnalytics` key-set pin stays passing unchanged. |
