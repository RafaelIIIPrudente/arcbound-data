# Handoff — Outreach Email channel, S3: staff UI

**Status:** 🟢 LANDED — planner-verified 2026-08-10. Gate green and independently
reproduced: lint 0 · type:check 0 · **127 files / 1,944 tests**, 29.3 s. Uncommitted, as
instructed.
**Branch:** `feat-outreach-email-channel`, on top of `ff844e6` (S1 + S2).
**Decision record:** [`docs/decisions/2026-08-03-outreach-email-channel.md`](../decisions/2026-08-03-outreach-email-channel.md) (D1–D7).
**Predecessors:** [S1](./2026-08-03-outreach-email-s1-data-layer.md) 🟢 ·
[S2](./2026-08-03-outreach-email-s2-analytics.md) 🟢 (A3 raised there, repaired here).

---

## What the slice delivered

The Email funnel on the staff Outreach tab (`EmailFunnelPanel`, new), the "not in this
export" state, four new disclosures, the 15 `email_*` columns in the prospect table behind
a **LinkedIn / Email / All** channel toggle, and the **A3 repair** —
`strippedReplyQualifiers` on `OutreachAnalytics`, restoring the LinkedIn-side disclosure
S2 had silently removed. Plus the stale `outreach-actions.ts:55` comment.

**Test count 1,882 → 1,944.** No assertion weakened, skipped or deleted.

---

## Planner verification (independent, not taken on report)

| Claim                                         | Verified how                                                   | Result                                                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate at 127 files / 1,944 tests               | Re-run from clean start on the planner's machine               | ✅ exact match (29.3 s)                                                                                                                                              |
| HEAD never moved; nothing committed or staged | `git log -1`, `git status --short`                             | ✅ `ff844e6`, all entries unstaged                                                                                                                                   |
| A3 covers **the case the rule exists for**    | Read `outreach-analytics.test.ts:350–368`                      | ✅ a NAMED test for `Replied - Positive (via email; meeting canceled)` asserting both the Positive bucket and the surfaced qualifier, plus a second for `(declined)` |
| The key-set pin grew by exactly one key       | Read the array; 14 keys, ⚠️ comment intact + a second ⚠️ added | ✅ knowing change, justified in place                                                                                                                                |
| The privacy default is really pinned          | Planner re-applied `DEFAULT_CHANNEL_VIEW → "all"`              | ✅ RED 2/33 — _length 24 → 39_ **and** the exact-array pin; restored, sha256 verified identical                                                                      |
| Default set is pinned by identity, not length | Read `prospect-table.test.tsx:123–129`                         | ✅ exact array + explicit absence assertions for the two contact-detail columns                                                                                      |
| No score/rate language in the new UI          | grep across the three changed/new components                   | ✅ clean (only false positives on "Best Email")                                                                                                                      |
| No export/download/copy-all control added     | grep for `download`/`clipboard`/`export`                       | ✅ none — the only hit is the comment forbidding them                                                                                                                |
| `Email — Status` stays raw (D2)               | `prospect-columns.tsx:280`                                     | ✅ `compact(…)`, no pill, no canonicalisation                                                                                                                        |

Restore used `cp` + sha256 comparison, never `git checkout --`.

### Disclosure copy — accepted

All six strings state a count, name the source column, and say what the number does NOT
mean. Two carry the weight:

- **Sent without an address:** _"…have a send date recorded in Email — Date Emailed but no
  Email — Best Email on file. **They still count as sent.**"_ — the disclosure-not-a-filter
  rule stated in the copy itself.
- **Combined meetings:** _"…have a meeting booked on LinkedIn, Email, or both — **one count
  per person, not a sum** of the two funnels' Meetings booked steps."_ — D1 on screen, and
  mutation #4 proves rewording it to "Total meetings" goes red.

---

## Judged and accepted

- **Proceeding with a dirty tree.** The two modified files were the planner's own S2
  write-up and the graphify cache. Correctly identified as non-competing and disclosed
  rather than silently ignored.
- **Surfacing `docs/decisions/2026-08-10-team-email-outreach-email-channel.md`** as a file
  it did not create. Also the planner's, written mid-run. Exactly the right instinct.
- **`outreach-kpis.test.tsx` +1 line.** Adding a required key to `OutreachAnalytics` forces
  every literal of that type to gain it or `type:check` fails. One field, no assertion
  touched — the same minimal-fixture precedent approved in S1.
- **`fullName` stays visible in the Email view.** Not specified; correct. An email-contacts
  view with no name column is unusable. ⚠️ Worth naming plainly: that view is, by design, a
  name + email + mobile contact list — which is _why_ the default keeps it hidden and why
  ADR 0012's no-export rule binds harder now.
- **`Email — Status` deliberately gets no pill.** Right reading of D2: a stale column must
  not be given the visual authority of a canonicalised status.

## ⚠️ Standing note — RED-first on new components, third occurrence

For the third slice running, the executer implemented a newly-created component before its
tests and offered the mutation pass as the substitute proof. It was disclosed each time,
and the mutation evidence is real. But the substitution is now a pattern rather than an
exception, and mutation-checking proves a test _can_ fail — not that it was written
without the implementation in view. **S4's brief should either drop the RED-first demand
for brand-new component files or state exactly how to satisfy it**, rather than repeating
an instruction that has been renegotiated three times.

## Open

- Nothing on S3.
- **S4** (public path) not started: the SQL twin of the Email predicates in
  `report_link_read`, the extended pinning test, and the Email funnel on `/r/[token]` —
  **the second SQL application**, by staff via the SQL editor.
- ⚠️ S4 must decide whether `combinedMeetings` crosses to the client-facing path at all,
  and if so that the union rule is re-implemented in SQL, since ADR 0012 forbids prospect
  rows leaving the database on that route.

---

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2026-08-10 | Created from the S3 run report and its independent verification. Gate reproduced exactly at 127 / 1,944; the privacy-default mutation re-applied by the planner and confirmed red on both the length and identity pins; A3 confirmed to cover the meeting-canceled case by name. Five judgement calls reviewed and accepted. Raised the standing note on RED-first for new component files, to be resolved in S4's brief rather than restated. |
