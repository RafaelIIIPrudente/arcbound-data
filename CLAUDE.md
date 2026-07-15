# CLAUDE.md

This repository **is ArcBase** — the product, not a generic starter template.
ArcBase is an internal, auth-gated, **single-tenant** web app for Arcbound staff
to register **Clients** (individual LinkedIn profiles), ingest weekly scraped
LinkedIn post metrics, and view analytics. It is the middle of a pipeline —
`external scraper → ArcBase → Supabase views + Power BI` — with the deep
analytics living downstream in Power BI. Internal-only and single-tenant: see
[ADR 0007](docs/adr/0007-arcbase-single-tenant.md).

How Claude works in this repo. Stack and architecture rules live in
[`AGENTS.md`](AGENTS.md) — read it first. Domain terms are in
[`CONTEXT.md`](CONTEXT.md); the decisions behind the stack are in
[`docs/adr/`](docs/adr); the live plan and delivery sequence are in
**[Current build](#current-build)** below. Project agent config (commands,
agents, skills) is in [`.claude/`](.claude/README.md).

## Two sessions: planning → executer

Work flows through two Claude sessions:

- **Planning** shapes the ArcBase work and produces **one self-contained
  prompt** — the _handoff_.
- **Executer** implements that prompt with **no memory of the planning
  conversation**. The handoff is its only context, so it must carry everything
  the executer needs.

A handoff prompt is a single block covering **Goal · Context · Scope (exact
files) · Approach (pattern + skills) · Acceptance criteria · Verification ·
Guardrails**.

## Standing rule: craft prompts with `prompt-architect`

Every handoff is authored with the **`prompt-architect`** skill (RISEN fits:
role, ordered steps, end product, constraints). Don't hand-write handoffs — run
**`/handoff`**, which invokes `prompt-architect` and emits a ready-to-paste
prompt.

## If you are the planning session

1. Shape the work with **`brainstorming`**, then **`writing-plans`** — grounded
   in the ArcBase v1 plan and SRS (see **[Current build](#current-build)**).
2. Run **`/handoff`** to turn the plan into one self-contained executer prompt.
3. Hand that prompt to a fresh executer session. **Do not implement here.**

## If you are the executer session

1. Follow the handoff prompt **exactly** — it is your full brief.
2. Use the global skills: **`test-driven-development`** for features (a new
   Clients, ingestion, or analytics slice), **`systematic-debugging`** for bugs,
   **`verification-before-completion`** before calling anything done, and
   **`requesting-code-review`** / **`/code-review`** for review.
3. Follow **[`AGENTS.md`](AGENTS.md)** for every stack and architecture rule.
4. Keep each commit green:
   `pnpm lint && pnpm type:check && pnpm test && pnpm build`.
5. Use **Conventional Commits**. Branch off `main`; **never commit to `main`**.

## Current build

ArcBase v1 ships in dependency-ordered slices — the live plan is
[`docs/specs/2026-07-16-arcbase-v1.md`](docs/specs/2026-07-16-arcbase-v1.md).
Its sequenced delivery runs **T1 → T6**:

- **T1 — Reshape & rebrand** _(in progress)_ — strip multi-tenancy, adopt the
  flat auth-gated routes, and rebrand the shell to ArcBase.
- **T2 — Data model** — `clients` / `uploads` / `posts` tables, RLS, and the
  ingestion RPC.
- **T3 — Clients feature** — the Client list, Add-Client flow, and detail.
- **T4 — Ingestion (core)** — the `/upload` CSV/JSON flow and result summary.
- **T5 — Analytics dashboard** — KPI cards, charts, and recent posts.
- **T6 — Resources + cross-cutting** — Resources plus loading/empty/error, a11y,
  and responsiveness.

The shaping decisions behind the build are
[ADR 0006 — app-owned posts table](docs/adr/0006-app-owned-posts-table.md) and
[ADR 0007 — single-tenant](docs/adr/0007-arcbase-single-tenant.md). Domain
vocabulary lives in [`CONTEXT.md`](CONTEXT.md); the full requirements are in the
[SRS](docs/SRS/SPEC.md); the visual language is in the
[design brief](docs/arcbase-dashboard-design-brief).
