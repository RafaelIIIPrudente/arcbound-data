# 17. A Writer is a registry entry, not an account

Date: 2026-08-18

## Status

Accepted. Creates `public.writers` with four admin `SECURITY DEFINER` functions,
moves `clients.writer_id`'s foreign key from `auth.users(id)` to
`public.writers(id)` with **NO ACTION**, and drops
`public.list_staff_directory()`.

**Amends [ADR 0016](0016-client-industry-and-writer.md)**, whose decision §4 —
"Writer is a foreign key to a staff account, resolved to an email through
`list_staff_directory()`" — is replaced by this one. Everything else in 0016
stands: the two mutable columns, the single narrow write path, and the reason
`clients.name` remains unreachable.

**Narrows [ADR 0013](0013-arcbase-staff-roles.md)** by separating two things that
had been conflated: an _account_ (a credential and a privilege tier) and an
_attribution_ (a fact about who did work). 0013 governs the first. This governs
the second, and the two no longer imply each other.

Shaping: D15 in
[`docs/decisions/2026-08-18-client-industry-and-writer.md`](../decisions/2026-08-18-client-industry-and-writer.md).

## Context

`CONTEXT.md` has said, since the glossary was corrected, that a Writer is
"an assignment, not a permission: it grants no access and withholds none".

The schema contradicted it. ADR 0016 made `clients.writer_id` a
`uuid references auth.users(id)`, and `list_staff_directory()` labelled people by
email. So a Writer _was_ a login — and under ADR 0013 every authenticated staff
member reads every Client. Recording who writes for a Client therefore required
**issuing that person a credential and a full read grant over the entire client
roster**, which is precisely what the glossary entry denies.

This was not noticed until Arcbound asked for four writers by name — Ryan Prior,
Courtney Taylor, Izzy Bailey, Siddharth Kumar. No migration could add them. They
are people; the column wanted accounts. The request was unsatisfiable in a way
that made the modelling error visible where two years of prose had not.

### The cost of the wrong model, in states

Because a writer had to be resolved through a second read against a table
`authenticated` cannot see, `ClientWriter` needed **four** states: assigned and
resolved, nobody assigned, assigned to an id the directory did not hold, and the
directory read failed. The last two demanded opposite actions — reassign a
person, versus retry — so the codebase carried a real and correct obligation to
keep them apart on every surface, with tests to match.

None of it was about the world. It was about the lookup.

## Decision

**A Writer is a row in `public.writers`: an id, a name, and a status. Nothing
else.**

1. **No relationship to `auth.users` at all.** The table has no email column, no
   join, and no path by which a row in it could become a login. A writer grants
   no access and withholds none, which is now true by construction rather than
   by assertion.

2. **An exact mirror of `public.industries`** — same shape, same RLS (readable by
   any authenticated staff member, written only through admin-gated
   `SECURITY DEFINER` functions), same case-insensitive unique index, same
   archive-is-reversible / delete-is-a-typo-eraser split.

3. **The foreign key is `NO ACTION`, not `ON DELETE SET NULL`.** Under the old
   model `set null` was defensible: deleting an `auth.users` row was a real
   administrative act performed elsewhere, and "nobody" then became the honest
   answer. Under a registry it is data loss wearing a default — deleting one
   writer row would silently unassign every Client recorded against them.
   `delete_writer` refuses while any Client references the writer and names the
   count; the foreign key refuses independently.

4. **`ClientWriter` collapses to `{ id, name } | null`**, the shape
   `ClientIndustry` already had, carried by a PostgREST embed on the client
   `SELECT`. `unknown` and `unavailable` cease to exist.

5. **`list_staff_directory()` is dropped**, in its own script applied _after_ the
   code that called it is deployed. `list_staff()` — admin-only, carrying role
   and invitation state — is untouched.

### ⚠️ Deleting two honesty states, and why it is not the usual defect

This codebase's standing rule is that collapsing states is the defect: a screen
rendering two different facts identically is lying about which one happened. Two
states were deleted here anyway, and the justification has to be stronger than
"the model changed".

It is that **the deleted states were artefacts of the lookup, not facts about the
world**, and they are now unreachable _by construction_:

- `ClientWriter` is `{ id: string; name: string }`. It has no `status` member, so
  every deleted test's fixture is a **compile error**, not a judgement call.
- Its only producer is `toWriter`, which normalises an embed to `{id,name}` or
  `null`. An embed rides the client `SELECT` over the foreign key: if the select
  worked, the writer came with it, and a foreign key cannot dangle.
- `staffEmailsById` and `listStaffDirectory` are deleted. `getClient` issues
  exactly two queries, pinned by a peak-concurrency assertion that fails at
  three. There is no second read left to fail.

⚠️ **`null` is not one of the deleted states and did not change.** "Nobody has
been recorded" is a real, common fact, known from the client row alone. It
renders as words on every surface — never as the em dash, which on the Client
List means "could not be read" and nothing else.

## Consequences

**Good**

- Arcbound can record who writes for a Client without issuing anybody a login or
  a read grant over the whole roster. The glossary and the schema agree.
- One fewer round-trip on the Client List and on `getClient` — which also runs on
  the upload path.
- "Which clients are mine" is answerable from the Client List by sorting, with no
  email in the URL.

**Costs and risks**

- ⚠️ **The writer moved INSIDE the client select's error path.** A separate
  directory read could fail harmlessly; an embed PostgREST cannot resolve fails
  the whole select — and `getClient` feeds the upload name-match gate, where
  `checkAuthorNames` catches a throw and degrades to "could not check". The
  script ends with `notify pgrst, 'reload schema';` and the runbook requires one
  load of `/clients` before trusting an upload. No test can cover this.
- ⚠️ **The foreign-key swap is the one statement that can fail.** Existing
  `writer_id` values are `auth.users` ids that name no writer, so the script
  refuses rather than nulling them. Two shipped screens could have set one.
- **Person names collide where industry names do not.** The case-insensitive
  unique index will refuse a second "Ryan Prior". That refusal is correct — a
  registry whose entries cannot be told apart is useless — and the answer is a
  human making the name distinguishable, never a silent second row.
- **A second near-identical registry.** `industries` and `writers` are the same
  shape — 46 executable lines each, five functions each — so a registry-wide
  change is edited in two places. They are deliberately not shared: a factory
  over two instances would add about as much indirection as it removes, and the
  half that differs is the prose, which is the half worth keeping per-registry.
  Each file carries a ⚠️ pointer to its twin, which is the only thing that will
  remind anyone. ⚠️ `arcbound-services.ts` is NOT a third instance — it is 182
  lines, carries a slug, handler, sort order, per-client assignments and a
  `can_delete` flag, and shares no function name with either.

## Alternatives considered

**Keep `auth.users` and issue logins.** Rejected: it makes every writer a reader
of every Client, which is a real access grant made for a bookkeeping reason.

**Free-text writer.** Rejected for the reason free-text industry was: it goes
stale, it cannot be counted, and one person becomes several spellings.

**Keep the four states and resolve names through a new RPC.** Rejected: it would
preserve two states that describe the lookup rather than the assignment, and pay
a second read on every Client page to do it.
