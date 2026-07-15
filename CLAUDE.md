# CLAUDE.md

How Claude works in this repo. Stack and architecture rules live in
[`AGENTS.md`](AGENTS.md) — read it first. Domain terms are in
[`CONTEXT.md`](CONTEXT.md); the decisions behind the stack are in
[`docs/adr/`](docs/adr). Project agent config (commands, agents, skills) is in
[`.claude/`](.claude/README.md).

## Two sessions: planning → executer

Work flows through two Claude sessions:

- **Planning** shapes the work and produces **one self-contained prompt** — the
  _handoff_.
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

1. Shape the work with **`brainstorming`**, then **`writing-plans`**.
2. Run **`/handoff`** to turn the plan into one self-contained executer prompt.
3. Hand that prompt to a fresh executer session. **Do not implement here.**

## If you are the executer session

1. Follow the handoff prompt **exactly** — it is your full brief.
2. Use the global skills: **`test-driven-development`** for features,
   **`systematic-debugging`** for bugs, **`verification-before-completion`**
   before calling anything done, and **`requesting-code-review`** /
   **`/code-review`** for review.
3. Follow **[`AGENTS.md`](AGENTS.md)** for every stack and architecture rule.
4. Keep each commit green:
   `pnpm lint && pnpm type:check && pnpm test && pnpm build`.
5. Use **Conventional Commits**. Branch off `main`; **never commit to `main`**.
