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

**Components:**

- [`tailwind-v4`](tailwind-v4/SKILL.md) — the exemplar (Tailwind CSS v4, CSS-first).

Planned as follow-on passes (each replicating the `tailwind-v4` pattern; not yet
built): `nextjs-15-app-router`, `react-19`, `typescript-strict`, `shadcn-ui`,
`supabase`, `zod`, `react-hook-form`, `tanstack-react-table`, `recharts`,
`vitest-testing-library`, `playwright`, `tooling`.
