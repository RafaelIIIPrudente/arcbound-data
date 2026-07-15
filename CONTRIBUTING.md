# Contributing

Thanks for contributing. This repo is a template, so keep changes general and
well-documented.

## Setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

See [`README.md`](README.md) for Supabase setup.

## Workflow

1. Branch off `main` (`feat/…`, `fix/…`, `chore/…`). Never commit to `main`.
2. Follow the conventions in [`AGENTS.md`](AGENTS.md).
3. Keep it green before pushing:
   ```bash
   pnpm lint && pnpm type:check && pnpm test && pnpm build
   ```
4. Add or update tests for any behavior change.
5. Use [Conventional Commits](https://www.conventionalcommits.org/) — enforced
   by commitlint. A pre-commit hook runs lint-staged + type:check.
6. Open a PR; fill in the template. CI must pass.

## Decisions

Making a hard-to-reverse choice? Add an ADR in `docs/adr/` (copy the format of
an existing one). Introducing or sharpening domain terms? Update `CONTEXT.md`.
