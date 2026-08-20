# Badge-decorated author names stop blocking the upload

**Date:** 2026-08-20
**Status:** IMPLEMENTED — landed green and uncommitted at `7c8e9a2`, planner-verified
**Decider:** Bryan
**Touches:** [ADR 0009](../adr/0009-*.md) (raw values never rewritten),
[ADR 0010](../adr/0010-arcbase-owns-analytics-end-to-end.md) (attribution is the
`client_id` FK), [2026-08-18 name-match attribution failure](2026-08-18-name-match-attribution-failure.md)

## The trigger

Uploading 60 posts for a new Client, **Raj Singh**, stopped at the wrong-file
confirm gate:

```
THE SCRAPE SAYS
Raj Singh Raj Singh • You Verified • You            60 posts
matched as: Raj Singh Raj Singh • You Verified   AUTHOR DIFFERS
```

The Client's name in ArcBase is `Raj Singh`. Nothing had failed — the gate is a
confirmation, not an error, and `NOTHING HAS BEEN UPLOADED YET` was on screen.
But the operator had to read and dismiss it to upload data that was correct.

## What the corpus actually contains

Every real scraped `post_name` string this repo has ever seen, from tests and
production:

| String                                          | Source           | Today             |
| ----------------------------------------------- | ---------------- | ----------------- |
| `Bryan Wish • You`                              | ordinary account | matches — no gate |
| `Eitan Hoenig Eitan Hoenig • You Premium • You` | prod 2026-08-18  | gate fires        |
| `Raj Singh Raj Singh • You Verified • You`      | prod 2026-08-20  | gate fires        |

Rows 2 and 3 are the same shape — `{Name} {Name} • You {Badge} • You` — which is
LinkedIn's author _block_ rather than the author's _name_. This is not an Eitan
problem or a Raj problem. **It is every Premium and every Verified account**, and
it will greet each new one added to the roster.

## Why the original refusal no longer binds

`name-mismatch-confirm.tsx:21` refuses to offer a "fix it for me":

> Normalising the scraped value to force a match would mean guessing which half
> of a mangled string is the real name, which is how a post gets attributed to
> the WRONG client — and ADR 0009 forbids rewriting scraped values regardless.

That was correct **under ADR 0009**, when the name match _was_ the attribution:
a wrong guess sent posts to the wrong Client. Under ADR 0010 attribution is the
`client_id` stamped from the operator's dropdown selection. Normalisation is no
longer anywhere in the attribution path, so it cannot misattribute anything — it
can only decide whether a notice appears.

The ADR 0009 half of the objection still binds and is preserved: **the stored
`post_name` stays raw.** Nothing about this decision writes a rewritten value.

## The decision

**Tolerate the known artifact; keep the wrong-file guard; keep the fact
visible.** Concretely:

1. An author string that is **this Client's name plus known LinkedIn chrome**
   no longer fires the gate. The upload proceeds with no extra click.
2. The post-upload summary carries a **non-blocking note** recording that the
   scraper sent a decorated author block. Bryan's call, 2026-08-20: _"keep a note
   in the upload summary, no blocking gate."_
3. Anything else still fires the gate exactly as today.

### The construction — and why it does not guess

Do **not** normalise the scrape toward a name and hope the result is equal;
that is the guessing the original comment rightly refused. Invert it:

> Take the Client's name **from ArcBase**, strip it from the scraped string
> along with known chrome, and require the **residue to be empty**.

The name is supplied by our own database, never inferred from the scrape, so
nothing is ever guessed. Worked examples:

| Client      | Scraped                                      | Residue       | Outcome        |
| ----------- | -------------------------------------------- | ------------- | -------------- |
| `Raj Singh` | `Raj Singh Raj Singh • You Verified • You`   | _(empty)_     | no gate        |
| `Raj Singh` | `Charlene Li • You`                          | `Charlene Li` | **gate fires** |
| `Raj Singh` | `Raj Singhania`                              | `ania`        | **gate fires** |
| `Raj Singh` | `Raj Singh Raj Singh • You Influencer • You` | `Influencer`  | **gate fires** |
| `Raj Singh` | `""` (no author on the row)                  | —             | **gate fires** |

The third row is the one that matters most. A naive `includes()` would pass
`Raj Singhania` as a match — which is the **exact defect shape** that paints
"Not Interested" green in Bryan's own Outreach viewer. Requiring the residue to
be empty is what avoids it.

### Badge vocabulary is evidenced, never guessed

Only `Premium` and `Verified` are in the known-chrome list, because those are the
only two the corpus contains. `Influencer`, `Open to work` and anything else
LinkedIn adds later will **fire the gate**, and the screen will show the residue
that could not be accounted for.

That is the fail-safe direction, chosen deliberately: an unmapped vocabulary
value is disclosed, never silently swallowed. The cost is that the next new badge
reintroduces one round of friction; the residue on screen makes it an
evidence-driven one-line fix when it happens.

## What is deliberately NOT done

- **Renaming the Client to match the scrape.** Suggested and rejected the same
  day. `clients.name` is the display name on the Client List, the dashboard, the
  report header and the client-facing `/r/[token]` page — Raj would open his own
  report and read `Raj Singh Raj Singh • You Verified` at the top of it. It also
  buys nothing, since attribution has not used the name since ADR 0010.
- **Fixing the string at the source.** Correct, and outside ArcBase. The scraper
  is capturing the whole author block; that is a conversation with whoever owns
  it. ArcBase never rewrites a scraped value.
- **Loosening the case-sensitivity of the name comparison.** Out of scope. One
  widening at a time.

## Known hazards for the implementer

- ⚠️ **An empty `post_name` must never resolve to an empty residue.** Stripping
  nothing from nothing leaves nothing, which would make a row with no author read
  as a match. It is currently a mismatch (`author-match.test.ts:118`) and must
  stay one.
- ⚠️ **Five existing tests assert the behaviour being inverted** and must be
  re-targeted rather than deleted — see the handoff for the itemised list.
- ⚠️ **`nameMatchWarning()` and `authorMatchReport()` share the predicate.** If
  only one moves, the confirm screen and the post-write summary will contradict
  each other. This is the "View tested, wiring not" defect shape.
- ⚠️ **`ScrapedAuthor.cleaned` stops describing the comparison.** The screen's
  `matched as:` line exists to show the reader what was actually compared; once
  the predicate is residue-based, that line explains a rule the code no longer
  applies.

## Verification

The gate only — `pnpm lint && pnpm type:check && pnpm test && pnpm build` — plus
unit and component tests. No Claude-in-Chrome, no dev server, no live-browser
walk.

Baseline measured on an idle machine, 2026-08-20 21:46, at `7c8e9a2` with a clean
tree: **151 files / 2,680 tests passed, 0 skipped**.

## ⚠️ The brief's residue rule had a hole — found in implementation

**Residue-empty alone is not sufficient.** A scraped string made of nothing but
chrome — `• You Premium • You` — strips to an empty residue while containing no
name at all, and would have read as this Client's own post. The table above never
covered that row.

The fix is a **containment requirement**: the Client's name must actually appear
in the scraped string. It is a NECESSARY condition, never a sufficient one — the
`Raj Singhania` row still fails on its non-empty residue. The pairing is what
makes the guard sound:

    postName.includes(clientName)  AND  residue === ""   →  artifact

⚠️ Do not read the containment check on its own and conclude the substring trap
is back. Either half alone is unsafe; both together are the defence.

Stripping order carries a second, related reason recorded in the implementation:
the Client's name is removed **before** the badge list so that a Client
legitimately named _"Premium Care"_ is not eaten by it.

## Outcome, planner-verified 2026-08-20 22:08

Gate run independently on an idle machine, not taken on report:
`LINT:0 TSC:0 TEST:0 BUILD:0`, **151 files / 2,713 tests passed** (+33 from the
2,680 baseline), 0 skipped, single pass. `git status` showed exactly the seven
in-scope files, all uncommitted.

The predicate landed as `classifyAuthor()` in `src/lib/author-match.ts`, with
both `nameMatchWarning()` and `authorMatchReport()` derived from it — Trap 4
closed by construction rather than by convention. `mismatched` and `decorated`
are now separate counts on `AuthorMatchReport`, and `ScrapedAuthor.cleaned` was
replaced by `residue`.

**Mutation proof (b) was not discharged as written, and the report said so.**
Removing the empty-string guard left all 32 tests green, because the containment
requirement independently closes the empty-`post_name` hole. The executer
substituted (b2) — remove containment — which went red on three tests, and kept
the guard as defence-in-depth for the empty-`clientName` case. That is the
correct handling of a brief whose assumption did not survive contact.

## The mixed-upload sentence — FIXED 2026-08-20 (follow-up slice)

`name-mismatch-confirm.tsx` computed `matching = total - mismatched`, which
silently swept artifact rows in with the plain matches, so a **mixed** upload
rendered _"The other 59 carry a matching author name."_ while the row list one
line below correctly labelled those same rows `author matches + badge`.

**A summary contradicting its own evidence, on the one screen whose entire
purpose is diagnosis, is worse than either error alone.** That is why a narrow
copy defect earned its own slice.

The count is now `matched = total - mismatched - decorated`, and the trailing
sentence branches four ways:

| `matched` | `decorated` | Renders                                                                                                       |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| >0        | 0           | ` The other 3 carry a matching author name.` _(byte-identical to before)_                                     |
| 0         | >0          | ` The other 59 carry Raj Singh's name inside LinkedIn's author block.`                                        |
| >0        | >0          | ` Of the others, 2 carry a matching author name and 3 carry Raj Singh's name inside LinkedIn's author block.` |
| 0         | 0           | _(no sentence — every row mismatched)_                                                                        |

Verified independently by the planner: **151 files / 2,722 tests** (+9), 0
skipped. The `<h2>` heading was checked rather than assumed — `decorated > 0`
implies `mismatched < total`, so the "isn't <client>" heading stays confined to
the all-mismatch case, and is now pinned by a test.

### `The other 1 carry` — FIXED 2026-08-20 (third slice)

⚠️ **The brief for the second slice contradicted itself**, and this is worth
keeping as a lesson about writing acceptance criteria. It required the
no-decorated branch to be **byte-identical** to the old copy (so the common path
was provably untouched) _and_ required every branch to read grammatically at
N = 1. Those cannot both hold, because the old copy already said _"The other 1
carry a matching author name."_ The executer obeyed byte-identity and **surfaced
the conflict rather than silently choosing** — the right call, and the reason it
was cheap to resolve afterwards.

Resolved in the other direction by applying the existing `carry()` helper to the
third branch:

    -  if (decorated === 0) return ` The other ${matched} carry a matching author name.`;
    +  if (decorated === 0) return ` The other ${carry(matched, "a matching author name")}.`;

`carry(3, …)` returns `"3 carry a matching author name"`, so the N ≠ 1 rendering
is unchanged and the exact-string pin passed **unmodified** — which is the proof
that only the plural moved. Verified independently: **151 files / 2,723 tests**
(+1), 0 skipped.

⚠️ **No test asserts the bad string, and that is deliberate** — pinning a
known-bad rendering makes it load-bearing and hides that it was ever wrong.
`grep -rn "other 1 carry" src/` returns nothing. Note the executer's finding that
this grep initially matched their _own explanatory comment_: prose quoting a
defect trips a literal check just as a test would, so they reworded the comment
rather than argue the distinction.

## ⚠️ The recurring shape across all three slices

Each slice made the code more precise and left a piece of **prose describing the
previous, less precise version**:

| Slice              | Code got more precise       | Prose left behind                                                             |
| ------------------ | --------------------------- | ----------------------------------------------------------------------------- |
| 1 — artifact state | two states became three     | `matched as:` described a comparison no longer performed                      |
| 2 — mixed sentence | one count became two        | _"the rows the scrape and the selection AGREE about"_                         |
| 3 — plural         | one branch gained `carry()` | _"THE FIRST BRANCH IS VERBATIM WHAT SHIPPED BEFORE"_ — now true only at N ≠ 1 |

**This is the defect shape to watch for, not three unrelated misses.** Every
handoff that tightens a rule should name the comments asserting the old rule as
in-scope, because a ⚠️ comment making a false claim about the code beside it is a
defect in this repo, not cosmetics.

### Closed by a fourth slice — the stale-prose audit (2026-08-20)

Bryan's call: close row 3 rather than defer it. Since the round-trip was being
spent anyway, it was bounded into a **comment-truth audit** of all seven files
the day's slices touched — stated up front, not smuggled in.

The line held was: **false → fix; imprecise or merely dated → report, don't
touch; deliberately-historical → leave alone.** That last category is
load-bearing in this repo and was the thing the pass most needed not to damage.

**Five comments fixed.** Beyond the known row-3 claim, four others were making
false statements:

| Where                        | The false claim                                                   | What the code does                                                                       |
| ---------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `name-mismatch-confirm.tsx`  | _"the care taken two lines above it"_                             | the referenced prose is 87 lines away, in another function                               |
| `actions.ts` post-write      | the summary is _"the only place"_ a decorated block is mentioned  | on a **mixed** upload the gate fires and decorated rows render on the confirm screen too |
| `actions.test.ts:125`        | the gate _"is free (no extra database read)"_                     | `checkAuthorNames` calls `getClient` — it costs a round trip                             |
| `name-mismatch-confirm.test` | fixture _"shows the duplicated name and the stray Premium badge"_ | the fixture had been moved to a plain name — no duplication, no badge                    |
| `name-mismatch-confirm.test` | guessing a name _"is how a post lands on the wrong client"_       | ADR-0009-era reasoning; attribution is the FK, so a rewritten name cannot misattribute   |

⚠️ **Fact worth keeping, from the third row.** The wrong-file gate costs one
`getClient` round trip **per upload attempt**, and because the form re-dispatches
(confirm, then format-review confirm/skip), that is per _attempt_, not per
upload. Correct as designed and not a defect — but it is not "free", and a
comment said it was.

**Six comments reported and deliberately left** as imprecise-but-true, plus every
ADR 0009/0010 history block and every `⚠️ RE-TARGETED` note, which describe in
past tense what the code used to do and why — accurate, and the category this
repo depends on.

**No behavioural defect surfaced**: nothing had a right comment over wrong code.
The diff was comment-only across all seven files, and the test count stayed at
**2,723** — correctly, since comments are not testable and nothing was invented
to inflate it. Planner spot-check: `remainderSentence`'s executable body is
byte-identical to the reading taken before the pass.

## Feedback & revisions log

| Date       | Who      | Note                                                                                                         |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| 2026-08-20 | Bryan    | Asked "can we fix this?" after the Raj Singh gate                                                            |
| 2026-08-20 | Planner  | Proposed the residue construction; put silence-vs-note to Bryan                                              |
| 2026-08-20 | Bryan    | Chose: _"keep a note in the upload summary, no blocking gate"_                                               |
| 2026-08-20 | Executer | Found the pure-chrome hole in the brief's rule; added containment as a flagged extension                     |
| 2026-08-20 | Executer | Reported mutation (b) as not discharged rather than dressing it up; substituted (b2)                         |
| 2026-08-20 | Planner  | Verified the gate first-hand (2,713); recorded the hole, the outcome, and the residual mixed-upload sentence |
