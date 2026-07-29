# Decision record — email to Bryan (boss): ArcBase state of play (2026-07-28)

- **Type:** Communication artefact / shaping record.
- **Origin prompt (verbatim):** _"I want to create an email to be send to my boss
  of what we have done here and how did we do it. ask me questions using
  /grill-with-docs"_
- **Recipient:** **Bryan**, the operator's boss. The account email is
  `bryan@arcbound.com`, but the session operator is not Bryan — earlier docs
  that read "Bryan's call" conflate the two.
- **Method:** `/grill-with-docs` — one question at a time, planner recommends,
  the operator decides. Facts looked up in the repo, never asked.
- **Related:** [outreach close-out](2026-07-27-outreach-workstream-close-out.md) ·
  [multi-service dashboard](2026-07-27-multi-service-dashboard-and-connection-count.md)

## Repo state established before grilling (looked up, not asked)

The outreach close-out doc records the work as "staged but uncommitted". That is
now **stale**: `d0cb3f0` merged PR #15 into `main`, so S1–S6 and the close-out
docs are committed and shipped. The email is written against the merged state.

Shipped arc on `main`, newest first:

| PR / commit | Workstream                                                                   |
| ----------- | ---------------------------------------------------------------------------- |
| #15         | Outreach System (S1–S6) + connections count                                  |
| #14         | Additional LinkedIn report features, Report Links S1–S4, weekday honesty fix |
| #11         | Client-detail enrichment and mobile fixes                                    |
| #8          | UI phase                                                                     |

Report Links are **live in production on Vercel** (verified end-to-end 2026-07-25).

## Decisions

### D1 — Scope: full ArcBase state-of-play

**Asked:** does "what we have done here" mean the Outreach System, or everything?

**Decision:** the **whole arc** — LinkedIn post analytics, the six-page
client report, tokenized Report Links live on Vercel, and the Outreach System.
Reads as a programme update rather than an increment.

**Consequence:** outreach detail gets compressed to make room; every claim about
the earlier workstreams must be re-verified against the repo before it goes in an
email that leaves the building.

### D2 — Purpose: brief someone new, not report progress

**Decision:** the email exists so **Bryan** — the recipient — can understand
ArcBase well enough to talk about it — to clients or a wider team. Emphasis on what it does
and what it deliberately won't claim.

**Tension surfaced and resolved (D3).** The origin prompt said "how did we do
it", which a handover brief de-emphasises. The operator kept a **short, named method
section near the end** — enough to answer "how did this get built?" without the
email becoming about method.

### D4 — AI involvement: left out entirely

**Decision:** the method section covers **process only** — written specs,
the automated gate, decisions recorded in the repo. No mention of tooling.

**Risk stated at the time of asking, and accepted:** if it surfaces later, its
absence here can read as concealment. Operator's call; recorded, not re-litigated.
Nothing in the drafted section is untrue — it describes discipline that genuinely
exists.

### D5 — Limits get their own section, framed as a feature

**Decision:** a dedicated "what it deliberately doesn't claim" section.

**Reasoning:** the failure mode of a handover email is the boss promising a
client a number the product refuses to produce. This is the section that makes
the no-score ethos portable to someone who never read the specs.

### D6 — Voice: first person, "I"

Not "we". Clearest attribution; a vague "we" in a handover brief invites the
question of who else to talk to.

### D7 — Data provenance: not named at all

**Asked in two steps** because "today's state only" was ambiguous once the repo
facts were on the table.

- **Fact established (looked up, not asked):** ADR 0010 — _ArcBase owns analytics
  end-to-end, Power BI retired_ — is **Accepted but not implemented**.
  `src/services/analytics.ts` and `src/services/clients.ts` still read
  `bi.linkedin_post_latest` via `.schema("bi")`. The Outreach System, by
  contrast, is entirely ArcBase-owned.
- **Decision:** describe today's state only, and **do not name** the BI
  dependency or Shay. The email describes what the app does and shows; it is
  silent on where LinkedIn data comes from and on who owns which half.

**Consequence:** no forward commitments either — no roadmap section, no
Power BI retirement claim.

### D8 — Report Links: what it is + the two-part access

Enough for the boss to explain and defend it to a client unaided: private live
link, separate access code, either revocable. Plus the boundary — clients see
outreach as counts; prospect-level detail stays internal.

### D9 — No live figures

Neither the ~1,435 prospect rows nor the ~74 LinkedIn posts. They date the email,
and quoting both invites "why so few posts?" — a question about the scrape, not
about ArcBase.

### D10 — Format and close

Six short bold headings, ~500 words, forwardable. Closes with an offer to walk
through it; **no ask**, no decision requested.

### D11 — Tech stack named explicitly (v2)

**Asked for directly:** _"please add the tech stack"._

**Decision:** folded into **How it was built** rather than given its own heading —
it keeps the email at six sections, and the stack reads naturally as part of the
"how" rather than as a spec sheet. Named in plain terms, with one sentence on why
it matters to a non-engineer: it is all mainstream tooling, so the work is
transferable.

**Checked against D7 (don't name data provenance).** Naming Supabase and Vercel
says where the app itself lives; it does not reveal the external BI dependency or
who owns the LinkedIn half. No conflict.

**Source of the stack facts:** `AGENTS.md` line 8 and `package.json` — verified,
not recalled.

## Draft v2 (2026-07-28) — current

Subject: **ArcBase — where it stands, and what it does**

> Hi Bryan,
>
> Short brief on ArcBase, so you can talk about it without me in the room.
>
> **What it is**
> ArcBase is our internal web app for the client work we run on LinkedIn and on
> outreach. Staff sign in, register each client we work for, upload the data we
> collect for them, and the app turns it into reporting — per client, on screen
> and in a form we can share. It's internal and access-controlled; nothing in it
> is public.
>
> **Client analytics**
> Each client has their own page: headline figures, charts over time, and their
> full post history. There's a report view built to be read start to finish — key
> performance, engagement trends, posting cadence, content mix, and a breakdown
> of what the content actually consists of — and it prints and exports cleanly
> for sending on. A separate data-quality page shows what came through in an
> upload and what didn't.
>
> **Outreach reporting**
> The newest part, shipped this week. Outreach data is uploaded per client as a
> complete snapshot, so each upload is a point-in-time record we can return to
> rather than something that overwrites what came before. The client's outreach
> page shows headline counts, a pipeline view, breakdowns of how conversations
> are landing, and the full prospect-level detail for staff. It also shows what
> moved between the two most recent uploads, so you can see change without
> comparing spreadsheets by hand.
>
> **Sharing a report with a client**
> A client can be given a private link to their own live report — always current,
> with no PDF to re-send every time. Access is deliberately two-part: the link,
> plus an access code sent separately, so holding the link alone isn't enough.
> Either can be revoked immediately. They see their own reporting only;
> prospect-level outreach detail stays internal, and clients see outreach as
> counts.
>
> **What it deliberately doesn't claim**
> Worth knowing before you quote anything from it. The reports state what
> happened; they don't grade it. No engagement rates, percentages, rankings, or
> benchmarks; no "best performing" language; nothing implying one thing caused
> another. The outreach pipeline figures are built from separate, unambiguous
> fields rather than by stacking status labels — stacking them would produce
> something that looks like a funnel but isn't. Where a value in the source data
> isn't one we recognise, it's shown as-is rather than guessed at, and missing
> data is shown as missing rather than counted as zero. So if a client asks for a
> percentage, or a "how are we doing versus X", that's a conversation — not a
> number the app will hand over.
>
> **How it was built**
> Next.js 15 and React 19 on the front, TypeScript throughout, Tailwind and
> shadcn/ui for the interface, Supabase (Postgres) for the database and sign-in,
> hosted on Vercel. Charts are Recharts, the data tables are TanStack Table. All
> mainstream, well-supported tooling — nothing exotic that would be awkward to
> hand to someone else later.
>
> It was built in-house in small slices. Each starts from a written spec and a
> defined scope, and nothing ships until it passes an automated gate — linting,
> type checks, the full test suite (Vitest and Testing Library, with Playwright
> for end-to-end), and a production build. The reasoning behind the significant
> decisions is written down in the repo, so the "why" survives.
>
> Happy to walk you through any of it whenever it's useful.
>
> [you]

### Claims in the draft, and where each was verified

| Claim in the email                                                                                | Verified against                                                                                               |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Internal, auth-gated, staff sign in                                                               | `src/app/(app)/` route group; ADR 0007                                                                         |
| Per-client pages: detail, posts, report, outreach                                                 | `clients/[id]/{page,posts,report,outreach}/page.tsx`                                                           |
| Report sections named in the email                                                                | `print-report.tsx` — Key performance · Engagement trends · Posting cadence · Content mix · Content composition |
| Prints/exports cleanly                                                                            | `src/components/dashboard/report/print/`                                                                       |
| Data-quality page                                                                                 | `src/app/(app)/data-quality/page.tsx`                                                                          |
| Outreach = complete snapshot per upload                                                           | ADR 0012; `ingest_outreach`; close-out doc                                                                     |
| Outreach page: counts, pipeline, breakdowns, detail, movement                                     | `src/components/dashboard/outreach/` (kpis, funnel, breakdown-chart, prospect-table, movement)                 |
| Report Link = private live link + separate code, revocable                                        | ADR 0011; `report_link_read`; live on Vercel, verified end-to-end 2026-07-25                                   |
| Clients see outreach as counts only                                                               | S6 — aggregates computed inside the SECURITY DEFINER function                                                  |
| No rates / rankings / causal claims                                                               | the no-score ethos enforced across cadence, comparison, report                                                 |
| Pipeline figures from separate fields, not stacked                                                | the terminal-Stage rule; funnel built from four independent columns                                            |
| Unmapped values shown as-is                                                                       | `canonicalReply` → `unrecognised`, disclosed verbatim                                                          |
| Missing shown as missing, never zero                                                              | the four-state discipline; `parseCount` returns null, never 0                                                  |
| Automated gate before shipping                                                                    | `pnpm lint && type:check && test && build` — 90 files / 1,289 tests at close-out                               |
| Next.js 15 · React 19 · TypeScript · Tailwind · shadcn/ui · Supabase · Vitest · Playwright · pnpm | `AGENTS.md:8` (Stack) and `package.json`                                                                       |
| Recharts · TanStack Table                                                                         | `package.json` — `recharts ^3.8.0`, `@tanstack/react-table ^8.21.2`                                            |
| Hosted on Vercel                                                                                  | Report Links verified live in production on Vercel, 2026-07-25                                                 |

## Deliberate omissions

Both on the operator's instruction, recorded so their absence is legible as a choice:

1. **Tooling / how the code was authored** (D4).
2. **Data provenance — the `bi.*` views and Shay's ownership of the LinkedIn
   half** (D7). Note this means the email does not disclose a live external
   dependency; if the boss is asked "whose pipeline is this?", the answer comes
   back to the operator.

## Feedback & revisions

_(append here as drafts come back)_

- **v1 (2026-07-28)** — record opened at the start of grilling; ten decisions
  captured; draft v1 written and claim-verified against the repo.
- **v1.1 (2026-07-28)** — recipient named: **Bryan**, the operator's boss.
  Attribution throughout the record corrected — the decisions logged here were
  the operator's, not Bryan's; earlier ArcBase docs conflate the two.
  **Open tonal question raised, not yet answered:** Bryan verified the Report
  Links flow end-to-end in production on 2026-07-25 and wrote
  `Arcbound_Master_DB_Viewer.html` himself, so "so you can talk about it without
  me in the room" and the Report Links explainer may pitch below what he already
  knows. Offered to re-pitch those two spots; awaiting the call.
- **v2 (2026-07-28)** — **D11**: tech stack added to _How it was built_, verified
  against `AGENTS.md` and `package.json`. Email now ~580 words, still six
  sections.
