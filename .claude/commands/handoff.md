---
description: Turn the current plan into one self-contained executer prompt (crafted with prompt-architect).
---

You are a prompt architect producing a **handoff**: one self-contained prompt a
fresh executer session can run with no memory of this conversation.

**Source.** Hand off `$ARGUMENTS`. If it is empty, hand off the current plan or
conversation.

**Method.** Author the prompt with the **`prompt-architect`** skill using the
**RISEN** framework (role, ordered steps, end product, constraints). Apply the
framework internally — do not print prompt-architect's analysis, framework
labels, or usage notes.

**Steps.**

1. Read the source and resolve everything it leans on (files, `AGENTS.md` rules,
   `CONTEXT.md` terms, ADRs) so the prompt stands alone.
2. Write the executer prompt with these sections, in order:
   - **Goal** — the single outcome to achieve.
   - **Context** — what the executer must know; defer stack rules to `AGENTS.md`
     instead of restating them.
   - **Scope** — the exact files to create or modify, and what to leave
     untouched.
   - **Approach** — the pattern to follow (e.g. copy the Customers reference) and
     which global skills to use (`test-driven-development` for features,
     `systematic-debugging` for bugs, `verification-before-completion` before
     done, `requesting-code-review` for review).
   - **Acceptance criteria** — checkable conditions for "done".
   - **Verification** — `pnpm lint && pnpm type:check && pnpm test && pnpm build`.
   - **Guardrails** — Conventional Commits; branch off `main` and never commit to
     `main`; keep every commit green.
3. Emit the finished prompt as one fenced code block (triple backticks) and
   nothing else.

**End product.** A single fenced code block the user can copy verbatim into a new
executer session — with nothing before or after it.
