# Project subagents

This repo relies on the **global** agents referenced in the root
[`CLAUDE.md`](../../CLAUDE.md) — the ones the planning→executer workflow leans on
— rather than duplicating them here.

Add a project subagent only when a need is genuinely local to this codebase: drop
one markdown file per agent (`name`, `description`, and optional `tools`/`model`
frontmatter) and it becomes available to the `Agent` tool.
