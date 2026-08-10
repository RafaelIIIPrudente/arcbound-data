# Decision record — team email: the Outreach Email channel (2026-08-10)

- **Type:** Communication artefact / shaping record.
- **Origin prompt (verbatim):** _"I want to write an email regarding the update that we
  have here in the system"_
- **Recipient:** the **wider Arcbound team** — an internal broadcast, not a report upward.
  (Contrast [the 2026-07-28 email](2026-07-28-boss-email-arcbase-state-of-play.md), which
  went to Bryan, the operator's boss.)
- **Method:** `/grill-with-docs` — one question at a time, planner recommends, the
  operator decides. Facts looked up in the repo, never asked.
- **Related:** [Email channel decisions](2026-08-03-outreach-email-channel.md) (D1–D7) ·
  [S1](../handoffs/2026-08-03-outreach-email-s1-data-layer.md) ·
  [S2](../handoffs/2026-08-03-outreach-email-s2-analytics.md)

## Repo state established before grilling (looked up, not asked)

| Fact                                                                                          | Verified how                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| S1 + S2 committed at `ff844e6`, tree clean                                                    | `git log`, `git status`                                                                                                          |
| Gate green at 126 files / 1,882 tests                                                         | Full gate re-run on the planner's machine                                                                                        |
| The 15 `email_*` columns and the 3-arg `ingest_outreach` are **applied to the live database** | Result grids, 2026-08-03                                                                                                         |
| **Nothing renders** — S3 handed off but not run, S4 not started                               | §6 of the decision doc; no component touched in `ff844e6`                                                                        |
| A 24-column export is now **rejected outright**                                               | `src/lib/parse-outreach.ts:248` — `missing.length > 0` returns an error naming every absent column; `OUTREACH_HEADERS` is all 39 |

## Decisions

### D1 — Recipient: the wider Arcbound team

**Decision:** an internal broadcast to the team, not a brief for Bryan.

**Consequence:** less context-setting than a client would need, less pipeline detail than
Shay would want, and the practical consequences for the reader move up the page.

### D2 — Purpose: progress update, what's been built

**Asked:** operational notice, progress update, or explainer?

**Decision:** **progress update.**

⚠️ **Risk raised and accepted.** A "what we built" framing reads as _finished_ when no
screen exists yet. The operator chose it anyway; the planner's condition — applied without
being asked — is that the email states plainly and in its own section that **nothing
renders yet**, so the claim cannot be misread. A progress update that lets a reader
believe they can go and look at something is not a progress update, it is a false one.

**Also folded in without being asked:** the upload-rejection fact (see D5). It is a direct
consequence of this work, and letting the team discover it as a failed upload would be a
disservice a team-wide email exists to prevent.

### D3 — Scope: the Email channel only

**Decision:** this workstream only — everything since the 39-column export landed.

**Rejected:** everything since the last team update (2026-07-28), which would pull in
staff roles/RBAC, the Arcbound Services registry and the date-range picker.

⚠️ **The reason is honesty, not brevity.** Planner notes record the Services registry's
SQL as **never applied**, meaning that feature runs on its fail-open fallback. Claiming it
shipped, in an email, without re-verifying it today, is exactly the kind of confident
statement this repo's conventions exist to prevent. Everything in the email as scoped was
verified in this session.

### D4 — Figures: only the union arithmetic

**Decision:** carry **one** number pattern — 14 LinkedIn meetings, 13 email meetings,
**19 people**, because 8 appear in both columns.

**Why that one and no others:** it is the mistake a reader will otherwise make the first
time they see both funnels, and it teaches D1's rule in a single line. Full observed
figures (645 sends, the 21 sends with no address on file) were rejected — they put a
client's outreach performance into a broadcast email for no gain here.

### D5 — Operational note included regardless of framing

The parser now hard-requires all 39 headers (D3 of the Email-channel decisions). Anyone
still producing the 24-column export is blocked the moment S1's code deploys. The failure
is clean — the error names every missing column — but it is a hard stop, so the email says
so before it happens rather than after.

### D6 — Method and tooling: left out

Follows the 2026-07-28 precedent (its D4). No mention of how the work was built. This is a
broadcast about what changed, not about process.

---

## The email as sent

> **Subject:** ArcBase update — the Master DB's new Email columns are now being captured

Hi all,

Quick update on ArcBase.

The Master Database export recently grew from 24 columns to 39. The 15 new ones track a
second outreach channel — email — running alongside the LinkedIn outreach we've always
recorded. ArcBase now captures all of it.

**What's live today**

Every upload stores the full 39 columns, and the database has been updated to hold them.
The Email funnel — emails sent, replied, meetings booked — is computed and covered by
tests, along with the data-quality checks that sit around it.

**What isn't live yet**

None of it is on screen. The staff Outreach tab and the client-facing report are the next
two pieces of work. So right now ArcBase is recording the email data correctly and showing
none of it — if you upload and don't see email figures, that's expected, not a fault.

**One thing that changes for you now**

Please use the 39-column export from here on. A 24-column file will be rejected on upload;
the error lists exactly which columns are missing, so it won't be a mystery, but it will
stop you.

**One thing worth knowing before the screens arrive**

LinkedIn and email are counted separately, and the two funnels are never added together.
They cover different groups of people and email has no equivalent of a connection request,
so a combined "total" wouldn't mean anything. Meetings are the clearest example: 14 were
booked through LinkedIn and 13 through email, but that's **19 people, not 27** — 8 of them
were booked through both channels and would otherwise be counted twice.

Where a combined figure is genuinely useful, it'll be shown as a count of people, labelled
as such.

More when the screens land.

---

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                       |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2026-08-10 | Created from the grilling session. Records D1–D6, the repo state verified beforehand, and the email as drafted. The "nothing renders yet" section and the upload-rejection note were added by the planner without being asked, as the conditions that make a "what we built" framing honest. |
