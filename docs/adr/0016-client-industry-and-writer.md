# 16. A Client gets two mutable fields: Industry and Writer

Date: 2026-08-18

## Status

Accepted. Adds `public.industries`, two nullable columns on `public.clients`
(`industry_id`, `writer_id`), `public.set_client_industry_writer()` and
`public.list_staff_directory()`.

**Narrows [ADR 0007](0007-arcbase-single-tenant.md).** ADR 0007 records that a
Client record is immutable — no edit path, no delete path. That was true of
every column when it was written and is no longer true of every column now. It
remains true of the two that matter, and this ADR is the record of exactly where
the line moved.

The shaping behind it, decision by decision, is in
[`docs/decisions/2026-08-18-client-industry-and-writer.md`](../decisions/2026-08-18-client-industry-and-writer.md)
(D1–D14). This ADR exists because that file is a working record, and a narrowed
invariant belongs where someone looks for invariants.

## Context

Arcbound needs two facts about a Client that nothing in the pipeline can supply:
which industry they are in, and which member of staff writes for them. Neither is
derivable — no scrape carries it, no upload implies it — so both have to be typed
in by a person and stored.

Storing them on `public.clients` is the obvious modelling choice and the one
taken. The non-obvious part is that `public.clients` had, by design, **no update
path at all**: no UPDATE policy, no update service function, no edit screen. That
was not an oversight to be corrected. It was load-bearing.

### Why the table was unwritable in the first place

`bi.linkedin_post_latest` attributes a scraped LinkedIn post to a Client by
comparing the scraped author name to `clients.name`, **exactly**. A Client's name
is therefore not a label. It is the join key.

This is not hypothetical. On 2026-08-18 a Premium scrape emitted
`Eitan Hoenig Eitan Hoenig • You Premium • You`, the exact-match join failed, and
fourteen posts attached to nobody with nothing on any screen to explain it. That
was an upstream name arriving wrong. An **admin editing the name in ArcBase**
would produce the same silence deliberately, with no error, no warning, and no
trace — the Client would simply start losing posts.

So the question this ADR answers is not "should Clients be editable". It is: **how
do you add a mutable field to a table whose immutability was protecting
something, without weakening what it was protecting?**

## Decision

**Two columns become mutable. The rest of the row stays unreachable, by
construction rather than by convention.**

1. **No UPDATE policy is added to `public.clients`.** The table still cannot be
   written directly by anybody, with any token, through any client.

2. **The only write path is `set_client_industry_writer(p_client_id,
p_industry_id, p_writer_id)`** — `SECURITY DEFINER`, admin-gated by
   `is_admin()` in SQL, and its body names exactly two columns. There is no
   argument that could carry a name or a URL, so no caller can send one and no
   future bug can smuggle one. A verification query in
   [`supabase/CLIENT-INDUSTRY-WRITER-APPLY.md`](../../supabase/CLIENT-INDUSTRY-WRITER-APPLY.md)
   asserts the live function body mentions neither `name` nor `linkedin_url`.

3. **Industry is a controlled list**, `public.industries`, admin-managed through
   four `SECURITY DEFINER` functions. Free text would make "how many clients in
   SaaS" unanswerable, which is the only reason the field exists.

4. **Writer is a foreign key to a staff account**, resolved to an email through
   `list_staff_directory()`. It is deliberately narrower than `list_staff()`:
   `user_id` and `email` only, never role or invitation state.

5. **Both fields are staff-only.** Neither reaches `/r/[token]`. A Client is
   never told which industry Arcbound files them under, nor who writes for them,
   and a writer's email is a colleague's address rather than the Client's
   business. `src/app/r/[token]/client-report-boundary.test.ts` asserts it
   against the route's real import graph.

### Consequences for the "immutable" reading

The honest statement of the invariant after this change:

> A Client's **identity** — `name` and `linkedin_profile_url` — is immutable, and
> unreachable by any write path in the product. A Client's **attributes** —
> currently `industry_id` and `writer_id` — are admin-editable through one
> narrow, admin-gated function.

That distinction is now the wording used on screen: the Client List caption reads
"names and URLs locked" rather than "records are immutable", and `CONTEXT.md`'s
**Immutability** entry carries the same split.

This mirrors [ADR 0015](0015-arcbound-services-registry.md), which drew the same
line for Services: what Arcbound does _for_ a Client is a fact about the
relationship and can change; who the Client _is_ cannot.

## Consequences

**Good**

- The attribution key is now protected by the shape of the API rather than by the
  absence of a feature. Before, `clients.name` was safe because nothing could
  write the table; now it is safe because nothing can name that column.
- "Which clients are mine" and "how many clients in SaaS" are answerable from the
  Client List: both fields are columns, Industry is filterable, and both sort.
- A controlled industries list means the question has one answer rather than one
  answer per spelling — names are unique case-insensitively.

**Costs and risks**

- **The RPC applies both arguments, including NULL.** There is no partial update.
  Any save path that sends one field without the other silently clears the other.
  Every surface that writes these fields must render exactly one control per
  field carrying its current value; the action refuses a submission with a field
  absent, and the tests around it exist for this and nothing else.
- **`public.clients` now has one thing that can change**, so any future reader
  that caches a Client row has a staleness question it did not have before.
- **Adding a third mutable column is now easy**, which is precisely the pressure
  this ADR exists to resist. A new mutable column needs a new argument on a
  function that deliberately has only three, and that is the moment to re-read
  this file rather than the moment to widen the signature.
- Archiving an industry does not evict the Clients in it, so an edit picker has
  to offer a Client's current industry whatever its status. A picker of active
  rows only would have no option matching that Client, and the next save would
  clear the field.

## Alternatives considered

**A separate `client_attributes` table.** Keeps `public.clients` literally
immutable and would have required no narrowing here. Rejected: it buys a slogan
at the cost of a join on every Client read, and the protection that matters —
that no write path can name `clients.name` — is delivered by the function
signature either way. The invariant worth keeping is about the attribution key,
not about the table.

**Free-text industry.** Rejected: "SaaS", "saas" and "S.a.a.S." would each be an
industry, and the one question the field exists to answer would have as many
answers as spellings.

**Writer as free text.** Rejected: a name typed by hand goes stale when someone
leaves, and cannot be resolved to an account. The foreign key makes "this writer
no longer exists" a state the product can detect and say out loud — which it
does, distinctly from "the staff directory could not be read".
