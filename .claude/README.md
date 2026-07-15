# `.claude/` — agent configuration

What every clone inherits as its Claude Code setup. Committed on purpose so the
team (and coding agents) start oriented. The operating model lives in the root
[`CLAUDE.md`](../CLAUDE.md): a **planning** session produces one self-contained
prompt, and an **executer** session runs it with no memory of planning. Every
handoff prompt is crafted with the **`prompt-architect`** skill — the standing
rule.

- **`settings.json`** — shared project settings: a permission allowlist for safe,
  common commands, and a `hooks` block for automated behaviors ("whenever X, do
  Y") the harness runs. Personal overrides go in `settings.local.json`
  (git-ignored).
- **`commands/`** — project slash commands:
  - **`/handoff`** — planning: turn the current plan into one copy-paste executer
    prompt (via `prompt-architect`).
  - **`/verify`** — typecheck, test, and build.
  - **`/ship`** — stage, commit (Conventional Commits), and push.
- **`agents/`** — project subagents. Empty by default; this repo leans on the
  global agents (see `CLAUDE.md`).
- **`skills/`** — project skills. Empty by default; this repo leans on the global
  skills (see `CLAUDE.md`).

Conventions and architecture live in the root [`AGENTS.md`](../AGENTS.md).
