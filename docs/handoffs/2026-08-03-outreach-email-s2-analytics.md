# Handoff — Outreach Email channel, S2: analytics + vocabulary

**Status:** 🟠 LANDED with one finding — A3 below (disclosure regression on the LinkedIn
side, caused by a gap in **this brief**, not by the executer).
Gate green and independently reproduced on the planner's machine: **126 files / 1,882
tests**, 29.0 s.
**Branch:** `feat-outreach-email-channel`. ⚠️ S1 **and** S2 were committed by the operator
as `ff844e6` while this verification was running — see "Git state" below.
**Baseline gate:** 125 files / 1,843 tests → 126 / 1,882.
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

## Planner verification (independent, not taken on report)

| Claim                                                 | Verified how                                                          | Result                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Gate green at 126 files / 1,882 tests                 | Re-run from clean start on the planner's machine                      | ✅ exact match                                                                |
| `outreach-analytics.test.ts` needed **zero** S2 edits | `git diff` on the file + grep for `–`/`—`/`(booked`/`(declined`       | ✅ no S2 lines; **zero** matches — no fixture exercises the fixed values      |
| The key-set pin still passes unchanged                | Read lines 345–366; 13 keys, byte-identical to the pre-S2 text        | ✅ unchanged                                                                  |
| The union mutation is real                            | Planner re-applied `union → sum` and ran the suite                    | ✅ RED, 2/26, `expected 27 to be 19`; restored byte-identical                 |
| `has_email_channel` reaches the seam                  | `UploadRow:41` · `UPLOAD_COLUMNS:101` · `toUpload:162` · `types:1200` | ✅ all four                                                                   |
| The `UploadRow` structural guard exists               | `outreach.test.ts:700–722`, sorted key-set comparison                 | ✅ and the fixture is annotated `: UploadRow`, so `type:check` catches it too |
| Vocab changes are purely additive to the tests        | Commit stat: `outreach-vocab.test.ts` +74, **0 deletions**            | ✅ no existing assertion touched                                              |

Restore used `cp` + `git diff --quiet`, never `git checkout --`.

### Git state — a commit landed mid-verification

`ff844e6 feat(outreach): add email channel support with new columns and ingestion logic`,
authored by RafaelIIIPrudente at 08:45:21 — **the operator's own commit**, not an agent's.
(Corrected: an earlier line in this doc said "Bryan's". Bryan is the operator's boss and
the recipient of reports, not the person at the keyboard — see
`docs/decisions/2026-07-28-boss-email-arcbase-state-of-play.md`.)
It sweeps S1 + S2 + all three planning docs into one commit (20 files, +2,413/−28) and
leaves the tree clean. Surfaced, not touched. It also swept in
`graphify-out/cache/last_query_stamp`, the long-standing housekeeping item that still has
no `.gitignore` entry.

---

## A3 — 🟠 OPEN — the LinkedIn side now strips qualifiers WITHOUT disclosing them

**This is a defect in the brief, not in the executer's work.** The brief scoped the
`canonicalReply` qualifier fix (which affects **both** channels) but scoped
`outreach-analytics.ts` explicitly OUT, and wired `strippedQualifiers` only into
`buildEmailAnalytics`. The executer obeyed both instructions correctly.

Measured against the real export — 2 LinkedIn rows carry a trailing parenthetical, and
they are the two worst cases there are:

| Value                                              | Before S2                           | After S2                                          |
| -------------------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| `Replied - Positive (via email; meeting canceled)` | `unrecognised` → **shown verbatim** | `positive` → the cancellation **vanishes**        |
| `Replied 2026-07-30 (declined)`                    | `unrecognised` → **shown verbatim** | `replied-unspecified` → `(declined)` **vanishes** |

⚠️ **A fix has made one channel less disclosing than it was.** The brief's own rule was
_"the stripped qualifier must be recoverable and disclosed, which is what makes stripping
safe at all"_ — that now holds for Email and no longer holds for LinkedIn. The first row
is precisely the case cited as the reason the rule exists: a qualifier that arguably
reverses the outcome.

The funnel counts are unaffected — `unrecognised` already counted as replied, so
"Replied" is the same number either way. Only the disclosure was lost.

**Fix:** add `strippedReplyQualifiers` to `OutreachAnalytics` and populate it in
`buildOutreachAnalytics` via `replyQualifier`. That deliberately changes the key-set pin
at `outreach-analytics.test.ts:350` — which is the correct outcome, and must be updated
knowingly rather than removed. **Fold into S3**, which already touches the disclosure
rendering.

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

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2   | 2026-08-10 | **S2 landed and independently verified** — gate 126 / 1,882 reproduced exactly, union mutation re-applied by the planner and confirmed red, key-set pin confirmed unchanged, seam confirmed at all four artefacts. The brief's prediction that `outreach-analytics.test.ts` assertions would need updating was **wrong** — no fixture in that file carries an en dash or a parenthetical qualifier, so nothing needed reconciling; the executer reported this honestly instead of manufacturing a change, which was the right call. **A3 raised**: the qualifier fix strips on both channels but discloses only on Email, so 2 LinkedIn values — including the meeting-canceled one — silently lost the disclosure they used to get. Caused by this brief's scoping, folded into S3. `replyDate` also stripping the qualifier accepted as a sound extension of the same load-bearing order. Bryan's commit `ff844e6` surfaced. |
| 1   | 2026-08-03 | Created when the S2 handoff was emitted. Records the three-step funnel, the union rule, the discriminated-union "not in this export" state, the two vocab fixes and their load-bearing order, and the decision to put the Email funnel in a separate builder so the `OutreachAnalytics` key-set pin stays passing unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
