# Handoff — F2 (second attempt): move the calendar cost out of the test budget

**Status:** 🔵 HANDED OFF, not yet run.
**Branch:** `feat-outreach-email-channel`, on top of `57afd03` (F1, committed by the
operator between slices). Tree clean.
**Baseline gate:** 127 files / **1,982 tests**.
**Predecessor:** [F1/F2 — first attempt](./2026-08-10-outreach-email-f1-f2-fixes.md), where
F1 landed and F2 was correctly left unresolved.

---

## Two wrong fixes, and why this is the third

F2 has now defeated two prescriptions, both of them the planner's:

| Attempt | Prescription                                             | Why it failed                                                                                                                                                                                                                                                                                                                      |
| ------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | Warm the calendar in `vitest.setup.ts`                   | `setupFiles` runs **per test file**, so all 127 files instantiated react-day-picker instead of the 3 that need it. Suite went 30 s → **114 s**. Measured by the executer, reverted.                                                                                                                                                |
| 2       | `vi.mock` the calendar in the files that "don't test it" | **There are no such files.** All three assert on the real calendar's DOM (`[data-slot=calendar]`, `[data-slot=calendar] table`, day buttons by ARIA label), and those assertions are what pin `allowCustom` as the gate keeping a calendar out of `/r/[token]`. Mocking would prove a stub honours the gate. Killed on inspection. |

Both were prescribed without measurement. **This one was measured first.**

## The diagnosis, finally correct

The cost is **not** a Vite transform — measured `transform` for the whole 127-file suite is
5.02 s. It is module resolution and instantiation of the react-day-picker/date-fns graph
inside each worker's own registry, and it is **not shared between files** (planner's
two-file experiment: the `tests` phase went 3.10 s → 6.04 s when a second calendar file
joined the run).

Per-test durations in `date-range-picker.test.tsx`:

| Test                              | Duration     |
| --------------------------------- | ------------ |
| the first one to mount the picker | **2,028 ms** |
| every other test in the file      | **≤ 151 ms** |

**The flake is one test per file, absorbing a one-off module cost inside a per-test
budget.** Under the ~6× inflation seen on a loaded machine, 2.4 s crosses the 15 s ceiling
while everything around it stays trivial — which is exactly why the failure set differed
between two runs of identical code.

## The fix, verified before prescribing

Warm the module in a **file-local `beforeAll`**, so the cost is paid under `hookTimeout`
rather than `testTimeout`. Planner measured this on `date-range-picker.test.tsx`:

|        | slowest test | file total |
| ------ | ------------ | ---------- |
| before | 2,028 ms     | 4.09 s     |
| after  | **185 ms**   | 4.52 s     |

The cost does not vanish — it moves. That is the whole point: nothing is hidden, and no
test carries a two-second surprise.

⚠️ **AND THE FIX IS INCOMPLETE WITHOUT `hookTimeout`.** It is not configured, so Vitest's
default of **10 s** applies. A 2 s hook under the same 6× inflation is 12 s — the flake
would simply relocate from the test to the hook, which is worse, because the next reader
would have no record of it. The brief requires setting it explicitly.

Net effect: `testTimeout` can come **down**, so the 124 files with no calendar get a tight
ceiling that catches genuine hangs quickly, and the 3 that pay a real startup cost declare
it in a hook with its own budget.

## Scope

|                  | Files                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Modify**       | the three calendar-mounting test files (`date-range-picker.test.tsx`, `report-period-picker.test.tsx`, `dashboard-filters.test.tsx`) — add `beforeAll` only · `vitest.config.ts` — `hookTimeout` + lower `testTimeout` + **correct the false comment** |
| **Do not touch** | `date-range-picker.tsx` (the dynamic import stays — it is what keeps react-day-picker out of `/r/[token]`) · `vitest.setup.ts` · any assertion in any test · anything under `src/services/`, `src/app/`, `supabase/`                                   |

## Open / to verify after the run

- No test in the suite exceeds the new, lower `testTimeout` — that is what proves the cost
  actually moved rather than being re-absorbed elsewhere.
- Three consecutive full-suite runs green, durations reported.
- `vitest.config.ts:29`'s comment no longer attributes the cost to a Vite transform.
- Test count unchanged at 1,982 (this slice adds behaviour to no code).

---

## Feedback & revisions log

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2026-08-11 | Created. Records the two failed prescriptions and why each died, the corrected diagnosis (per-file module instantiation, one test absorbing it, ≤151 ms for everything else), and the `beforeAll` fix **measured by the planner before being written into a brief** — 2,028 ms → 185 ms on the slowest test. Flags that `hookTimeout` is unset at Vitest's 10 s default, so the fix relocates the flake unless the ceiling is set explicitly. |
