# Handoff — Outreach Email channel, S4: the public path (final slice)

**Status:** 🟠 LANDED with one minor finding (A4) and one caveat about the gate.
Uncommitted, as instructed. **SQL NOT YET APPLIED.**
**Branch:** `feat-outreach-email-channel`, on top of `554bb63` (S3, committed by the
operator between slices).
**Decision record:** [`docs/decisions/2026-08-03-outreach-email-channel.md`](../decisions/2026-08-03-outreach-email-channel.md) (D1–D7) + D8/D9 set in this brief.
**Predecessors:** [S1](./2026-08-03-outreach-email-s1-data-layer.md) 🟢 ·
[S2](./2026-08-03-outreach-email-s2-analytics.md) 🟢 ·
[S3](./2026-08-03-outreach-email-s3-staff-ui.md) 🟢

---

## What the slice delivered

A new SQL pair (`supabase/outreach-email-report-link.sql` + its
`20260810120000_` migration twin) replacing `report_link_read`'s body with five new
aggregate keys, the extended SQL-pinning describe, `ReportLinkEmailOutreach` parsed as
optional, and the Email block on the Client's own report.

**Test count 1,944 → 1,972.** No assertion weakened, skipped or deleted.

---

## Planner verification (independent, not taken on report)

| Claim                                                     | Verified how                                                     | Result                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `554bb63` is the operator's S3 commit, not competing work | `git merge-base --is-ancestor ff844e6 554bb63`, author, diffstat | ✅ descendant, RafaelIIIPrudente, 19 files / +1,184 −57 — byte-for-byte the S3 deliverable |
| SQL pair is byte-identical                                | `diff` with comments/blanks stripped                             | ✅ identical                                                                               |
| Registered in `PAIRS`                                     | `sql-sync.test.ts:32`                                            | ✅                                                                                         |
| Signature unchanged; no `drop function`                   | grep                                                             | ✅ zero occurrences                                                                        |
| `combined_meetings` is a union, not a sum                 | Read lines 170–173; grep for `+` arithmetic                      | ✅ `or`-joined; no `+` anywhere                                                            |
| The union pin is real                                     | Planner re-applied `union → sum`                                 | ✅ RED — the union assertion **and** `sql-sync` (twin drift); restored, sha256 identical   |
| `has_email_channel` rides the existing snapshot query     | Lines 99–100                                                     | ✅ one read, no second query                                                               |
| No prospect-level column crosses the boundary             | grep for every prospect text column                              | ✅ none referenced outside aggregates                                                      |
| `comment on function` names every new key                 | Read line 208                                                    | ✅ all five, plus the union and "not in this export" rules                                 |

Restore used `cp` + sha256, never `git checkout --`.

### The inherited-divergence comment — accepted, and better than asked for

The brief required a ⚠️ recording the SQL/TypeScript `replied` divergence. What landed
records the measurement (**zero rows diverge on either channel, 2026-08-10**), names the
exact value shapes that would wake it up (`No reply (...)`, `No reply YYYY-MM-DD`),
forbids the tempting one-sided fix, and says what a real fix would have to change _in one
change_. That is the standard.

### One reworded comment — correct call

`"no drop function"` → `"no dropped/overloaded signature"`, because the executer's own
test asserts the file does not contain the string `drop function`. Prose colliding with a
string-match pin. Disclosed, and the right resolution.

---

## ⚠️ The gate did not pass as a whole — and that is not this slice's doing

`pnpm test` failed on the planner's machine too: **2 failures** (the executer saw 3), all
`Test timed out in 15000ms`, in `date-range-picker` and `dashboard-filters` — files this
slice never touches. Verified:

- Those files appear nowhere in S4's diff.
- Run in isolation they are **54/54 green**, in 7.5 s.
- The full run took **86 s** here versus **29 s** during S3's verification — the machine is
  simply loaded. A different failure count on two runs of identical code is the signature
  of a timing flake, not a break.

⚠️ **Recorded rather than waved away.** This is the known trap in
`arcbase-dev-env-test-traps`: a dynamic `import()` pulls a multi-second Vite transform
inside the test's own timeout. It is now firing on a merely-busy machine, which means the
15 s ceiling is marginal, not comfortable. **Worth its own small slice** — hoisting the
import or raising the ceiling — because a suite that goes red under load trains everyone
to read red as noise.

---

## A4 — 🟡 MINOR — a three-cause branch documented as two

`mapEmailOutreach` (`src/services/report-links.ts:223`) returns `not-in-export` for
**three** distinct causes:

1. the key is absent (code-first deploy) — correct
2. `has_email_channel: false` (pre-S1 snapshot) — correct
3. `has_email_channel: true` **but a count is missing or not finite** (line 228) — **wrong
   state**

The third is "the export carried the email block and the numbers could not be read", which
is the _could-not-be-read_ state, not _not-in-export_. The ⚠️ comment above it says the
union of causes is deliberate and names only the first two.

**Severity: low, and honestly so.** With either version of the SQL this branch is
unreachable — the flag and the four counts are built in the same `jsonb_build_object`, so
they arrive together or not at all. It is defensive code whose fallback picks the wrong one
of two absences.

**Why it is still worth fixing:** this repo's entire convention is that a ⚠️ comment can be
trusted, and this one under-describes its own branch. Either add the third cause to the
comment, or give it its own `unreadable` state. Not blocking; fold into whatever touches
this file next.

---

## Open

- **THE SQL IS NOT APPLIED.** `supabase/outreach-email-report-link.sql` must be pasted into
  the Supabase SQL editor by staff — never `db push`. Until then `/r/[token]` shows only
  the five LinkedIn-era figures, which is a correct additive no-op, not a break.
- ⚠️ **Verify after applying**, in a separate SQL-editor pass (the editor renders only the
  last result set — this workstream has hit that trap once already):
  `select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'report_link_read';`
  → must be exactly ONE row, `p_token text, p_grant text`.
- A4 above.
- The 15 s test-timeout ceiling.

---

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2026-08-10 | Created from the S4 run report and its independent verification. Lineage of `554bb63` confirmed; SQL pair, `PAIRS` entry, union shape, privacy boundary and `has_email_channel` sourcing all verified against the source; the union→sum mutation re-applied by the planner and confirmed red on both the pin and `sql-sync`. Gate caveat recorded with evidence that the two timeouts are load-dependent and unrelated. A4 raised. |
