# Handoff — F1 / F2: the read-state repair, and the test-suite flake

**Status:** 🟢 **F1 LANDED** (planner-verified) · 🔴 **F2 UNRESOLVED, and correctly so** —
the fix this brief prescribed was measured, refuted, and reverted.
Uncommitted, as instructed.
**Branch:** `feat-outreach-email-channel`, on top of `bda22c4` (S4, committed by the
operator between slices).
**Gate:** lint 0 · type:check 0 · **127 files / 1,982 tests**, 26.3 s · build ✅.
**Predecessor:** [S4 — the public path](./2026-08-03-outreach-email-s4-public-path.md),
where both findings were raised.

---

## Why this slice exists

Two defects left out of S1–S4 deliberately, so neither would widen a shipping slice:

- **F1** — `src/services/report-links.ts` had no way to say _"we could not read this"_, so
  it said something else instead. On the LinkedIn side it said the worst available thing.
- **F2** — the suite goes red under load, in files nobody is editing.

They share no files. F1 was ordered first so that F2 failing could not take it down.

---

## F1 — a Client was being told nothing had been done for them

**A4 as raised in S4 was the smaller half.** `mapEmailOutreach` collapsed an unreadable
Email block into `not-in-export`. While grounding the fix the planner found the same shape
in `mapOutreach` (line ~251), with a far worse consequence: a malformed aggregate returned
`null`, and on that path `null` means **"this Client has no outreach uploaded"** — the
exact sentence the SQL's own ⚠️ comment forbids confusing with anything else:

> ⚠️ NO SNAPSHOT ⇒ THE KEY STAYS jsonb null, NOT AN OBJECT OF ZEROS. "This Client has no
> outreach uploaded" and "this Client's outreach shows zero" are different sentences and
> only one of them is ever true.

A third sentence — _"we received an outreach block and could not read it"_ — rendered as
the first. **A Client with 1,230 requests sent would be told nothing had been done for
them, when the truth was that the read failed.** That is the defect this slice repairs.

### What landed

`ReportLinkOutreach` became a three-state discriminated union mirroring `LatestSnapshot`
(`ok` / `empty` / `unavailable`), and `ReportLinkEmailOutreach` gained `unavailable`
alongside its existing `not-in-export`. No fourth vocabulary was invented.

| State                  | Means                                          | Renders                                           |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------- |
| `empty`                | SQL's explicit jsonb null, or an absent key    | nothing at all — no heading, no card              |
| `unavailable`          | non-object · missing `snapshot_at` · bad count | _"Outreach figures could not be read right now."_ |
| `email: not-in-export` | `has_email_channel` false, or key absent       | the existing sentence, unchanged                  |
| `email: unavailable`   | flag true, a count will not parse              | _"Email figures could not be read right now."_    |

**Test count 1,972 → 1,982.** No assertion weakened, skipped or deleted.

### Planner verification (independent, not taken on report)

| Claim                                                     | Verified how                                                              | Result                                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Gate green at 127 / 1,982                                 | Full re-run from clean start on the planner's machine                     | ✅ 26.31 s, all green                                                                                             |
| `bda22c4` is the operator's S4 commit, not competing work | `git merge-base --is-ancestor 554bb63 HEAD`, author, diffstat             | ✅ descendant · RafaelIIIPrudente · 10 files, byte-for-byte the S4 deliverable                                    |
| The unavailable branch is really pinned                   | Planner re-applied `unavailable → empty` on two branches in `mapOutreach` | ✅ RED — `expected { status: 'empty' } to deeply equal { status: 'unavailable' }`; restored, sha256 **identical** |
| No assertion was dropped, only rewritten                  | Read **every** deleted line in both test diffs                            | ✅ each is a mechanical `toBeNull()` → `toEqual({status})` or `!.` → `.`; every one has a replacement             |
| An absent key still reads as `empty`, not a read failure  | `report-links.ts:385` — `mapOutreach(bundle.outreach ?? null)`            | ✅ the `?? null` is what makes the ⚠️ comment true; without it `undefined` would fall to `unavailable`            |
| Nothing outside SCOPE moved                               | `git diff --stat`                                                         | ✅ 5 files · +303 −88 · nothing under `supabase/`, no SQL, no database contacted                                  |
| `vitest.config.ts` / `vitest.setup.ts` untouched          | `diff` against `HEAD`                                                     | ✅ both byte-identical; `testTimeout` still `15_000`                                                              |

Restore used `cp` + `mv` + sha256, never `git checkout --`.

### ⚠️ One branch is still unpinned — minor, recorded not raised

`if (typeof raw !== "object") return { status: "unavailable" }` survives mutation to
`empty` with the suite green. It is reachable only if the aggregate arrives as a string,
number or boolean — defensive code guarding defensive code, and it behaved identically
before F1, so nothing regressed. Noted so the next reader does not mistake the gap for
coverage.

---

## F2 — the prescribed fix was wrong, and the brief was wrong to prescribe it

**This brief told the executer to warm `@/components/ui/calendar` once in
`vitest.setup.ts`, on the theory that Vite caches the transform so only the first file
pays it. That theory is false, and the executer proved it.**

| Variant                      | Full-suite duration                    | Evidence                |
| ---------------------------- | -------------------------------------- | ----------------------- |
| baseline (3 runs)            | 30.34 s / 29.67 s / 30.37 s, all green | —                       |
| `await import(...)` in setup | **114.27 s**                           | setup 781 s aggregate   |
| `void import(...)` in setup  | **99.62 s**                            | collect 625 s aggregate |

`setupFiles` runs **per test file**, so warming there made all 127 files instantiate
react-day-picker instead of the 3 that need it — 781 s ÷ 127 ≈ **6.15 s each**. The
executer reverted rather than ship either variant, which is what the brief asked for and
the right call.

### The planner's own measurement — and why it closes the door

A two-run experiment on the calendar-touching files:

| Run                                | `tests` phase |
| ---------------------------------- | ------------- |
| `date-range-picker.test.tsx` alone | **3.10 s**    |
| `+ report-period-picker.test.tsx`  | **6.04 s**    |

**The cost doubled.** It is not shared between files even inside a single run, so no
warming strategy can work — not `setupFiles`, not `globalSetup`, not anything.

⚠️ **AND THE STANDING COMMENT IN `vitest.config.ts:29` IS WRONG ABOUT WHY.** It attributes
the delay to "a ~6s Vite transform". Measured `transform` for the entire 127-file suite is
**5.02 s**, and for the two-file run above **147 ms**. The cost is module resolution and
instantiation of the react-day-picker/date-fns graph inside each worker's own registry —
per-file by construction, and uncacheable. That comment has been trusted twice now, by this
brief and by S4's write-up, and it sent both in the wrong direction.

### What is actually left

1. **Leave it.** Three files pay ≈ 2.4 s each. The 15 s ceiling has 6× headroom idle and
   failed only under heavy load. Defensible.
2. **`vi.mock("@/components/ui/calendar")` in the files that do not test the calendar** —
   `report-period-picker.test.tsx` and `dashboard-filters.test.tsx` exercise the filter
   bar, not the picker's calendar. This removes the cost from two of the three files and is
   the only genuine fix in reach.

⚠️ **This brief forbade option 2** — _"the two flaky test files themselves… If the only way
to make them pass is to edit them, the fix is wrong"_. That guardrail was written to stop
assertions being weakened, and it blocked the one workable repair. **Planner's error, not
the executer's.** Any future F2 slice should permit mocking a lazily-loaded leaf component
in files that never open it, while still forbidding any change to an assertion.

---

## Judged and accepted

- **Reverting rather than shipping a measured regression.** The instruction to do this was
  in the brief, but following it when you have working code in hand and a report to write
  is a different thing from agreeing with it in the abstract.
- **Correcting a ⚠️ comment they had themselves written.** The warming comment asserted
  "every other file's setup call is a cache hit"; their own measurement disproved it, and
  they disclosed that rather than quietly deleting the file.
- **The NaN test, added mid-mutation.** Mutation #2 revealed the existing "non-numeric"
  test used a **string**, which `typeof` alone already catches — so `Number.isFinite` was
  unpinned. They added the missing test before re-running. Finding a hole in the tests
  while checking the tests is the mechanism working.
- **`report-links.test.ts`'s key-set pin gaining `"status"`.** Forced, non-weakening, and
  disclosed — the same category as prior slices' key-set updates.

---

## Open

- **F2**, per the two options above. Small; not blocking anything.
- The `typeof raw !== "object"` branch is unpinned (above).
- ⚠️ **`vitest.config.ts:29`'s comment misattributes the cost** and should be corrected
  whenever F2 is next touched, whatever is decided about the fix itself.
- Still outstanding from S4: the result grid for
  `select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'report_link_read';`
  → must be exactly ONE row, `p_token text, p_grant text`.
- Long-standing: `graphify-out/cache/last_query_stamp` has no `.gitignore` entry.

---

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2026-08-10 | Created from the F1/F2 run report and its independent verification. F1 verified green at 127 / 1,982; the `unavailable → empty` mutation re-applied by the planner and confirmed red; every deleted test line read and confirmed to be a mechanical rewrite. F2 recorded as **unresolved by design** — the brief's warming hypothesis was refuted by the executer's measurements and again by the planner's two-file experiment (cost doubles, so nothing is shared). Two brief-level errors recorded against the planner: the false transform premise, and the guardrail that blocked the only workable fix. |
