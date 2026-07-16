# Project skills

This repo relies on the **global** skills referenced in the root
[`CLAUDE.md`](../../CLAUDE.md) — `prompt-architect` (the standing rule for every
handoff) and the superpowers workflow skills (`brainstorming`, `writing-plans`,
`test-driven-development`, `systematic-debugging`,
`verification-before-completion`), plus `code-review` — rather than duplicating
them here.

Add a project skill (one directory per skill, each with a `SKILL.md`) only when a
need is genuinely local to this codebase — for example, a "scaffold a feature
from the Customers reference" skill.

## Stack-alignment skills

**Purpose.** Keep this repo aligned with the **current official documentation** of
each pinned technology — so agents write today's idioms, not stale ones — anchored
to the **major version the repo actually uses** (from `package.json`). Each skill is
part reference (the current docs, distilled and cited) and part house rules (how this
repo wires that technology).

**Shape.** One directory per technology, `kebab-case`, whose name equals the skill's
frontmatter `name`. Inside:

- `SKILL.md` — frontmatter (`name`, one-sentence `description`) then, in order:
  **When to use**, **Pinned version** (from `package.json`), **Current idioms**
  (cited to the digest), **This repo's conventions** (anchored to real files),
  **Banned / outdated**, **Common tasks**, **Refresh**.
- `references/<tech>-docs.md` — a concise, cited digest of the current docs, headed by
  the pinned version, a **Researched on** date, and an **Official sources** URL list.

**Refresh procedure.** Re-run **`/research`** against the official docs, update the
`references/` digest (content, source URLs, and the _researched-on_ date) and the
`SKILL.md` version pin; bump the skill when the technology changes major.

**Components.** The set is **complete at 13** — one skill per pinned technology in
this repo. _Framework & language:_

- [`tailwind-v4`](tailwind-v4/SKILL.md) — the exemplar (Tailwind CSS v4, CSS-first).
- [`nextjs-15-app-router`](nextjs-15-app-router/SKILL.md) — Next.js 15 App Router (RSC reads / Server-Action writes).
- [`react-19`](react-19/SKILL.md) — React 19 (Actions/`useActionState`, ref-as-prop, `use()`).
- [`typescript-strict`](typescript-strict/SKILL.md) — TypeScript strict mode (pinned TS 5.8).

_UI:_

- [`shadcn-ui`](shadcn-ui/SKILL.md) — shadcn/ui (owned components, Radix, `cva`/`cn`, new-york, CSS vars).
- [`react-hook-form`](react-hook-form/SKILL.md) — React Hook Form v7 (`zodResolver`; RHF vs Server-Action forms).
- [`tanstack-react-table`](tanstack-react-table/SKILL.md) — TanStack Table v8 (headless + shadcn table).
- [`recharts`](recharts/SKILL.md) — Recharts v3 (shadcn `ChartContainer`, CSS-variable theming).

_Data:_

- [`supabase`](supabase/SKILL.md) — Supabase `@supabase/ssr` (verified `getUser`, RLS boundary, server-only secrets).
- [`zod`](zod/SKILL.md) — Zod v3 (`safeParse` at boundaries, `z.infer`, env + Server-Action validation).

_Testing & tooling:_

- [`vitest-testing-library`](vitest-testing-library/SKILL.md) — Vitest 3 + Testing Library 16 (jsdom, role queries, coverage ratchet).
- [`playwright`](playwright/SKILL.md) — Playwright 1.50 + axe (user-facing locators, web-first assertions, e2e/a11y).
- [`tooling`](tooling/SKILL.md) — ESLint 9 flat config, Prettier 3, commitlint, husky 9, lint-staged.
