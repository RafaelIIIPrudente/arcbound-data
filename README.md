# Web App Template

A frontend-only starter for shipping web apps fast. Clone it, rename it, build.

- **Next.js 15** (App Router, React 19, TypeScript)
- **Tailwind CSS v4 + shadcn/ui** — components you own, light/dark theming
- **Supabase auth** — sign-in/up, password reset, session-aware middleware
- **Typed service seam** — screens read mock data through `src/services/*`; make it real in one file
- **RBAC** — role guards enforced in middleware and components
- **Tests + CI** — Vitest, Testing Library, Playwright, and a GitHub Actions pipeline

Decisions behind the stack are recorded in [`docs/adr/`](docs/adr). Shared
vocabulary is in [`CONTEXT.md`](CONTEXT.md). The rebuild plan is in
[`docs/superpowers/plans/`](docs/superpowers/plans).

---

## Quickstart

```bash
pnpm install
cp .env.example .env      # then fill in your Supabase values (below)
pnpm dev                  # http://localhost:3000
```

Requirements: **Node 22**, **pnpm 10** (both pinned via Volta and
`packageManager`).

### Connect Supabase

Auth is the one thing wired to a real backend. Point it at a Supabase project —
hosted or local.

**Hosted**

1. In your Supabase project, open **Settings → Data API** and copy the **Project
   URL** into `NEXT_PUBLIC_SUPABASE_URL`.
2. Open **Settings → API Keys** and copy the **anon/public** key into
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Under **Authentication → URL Configuration**, set the Site URL to
   `http://localhost:3000` and add `http://localhost:3000/**` as a redirect URL.

**Local (Supabase CLI)**

```bash
supabase start           # prints the API URL and anon key
```

Copy the printed values into `.env`. A minimal `supabase/config.toml` is
included; run `supabase init` to regenerate a full one for your CLI version.

### Make a superadmin

Roles are read from the Supabase user's `app_metadata.role`. After signing up
once, set it with the service-role key or in the dashboard SQL editor:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"superadmin"}'
where email = 'you@example.com';
```

Sign out and back in to pick up the new role.

---

## Scripts

| Command                         | What it does                     |
| ------------------------------- | -------------------------------- |
| `pnpm dev`                      | Start the dev server (Turbopack) |
| `pnpm build` / `pnpm start`     | Production build / serve         |
| `pnpm lint`                     | ESLint                           |
| `pnpm type:check`               | TypeScript, no emit              |
| `pnpm test` / `pnpm test:watch` | Vitest unit + component tests    |
| `pnpm test:e2e`                 | Playwright end-to-end tests      |
| `pnpm format`                   | Prettier                         |

---

## Architecture

```
src/
  app/
    (marketing)/         Public landing (route group)
    auth/                Supabase auth screens + PKCE callback
    dashboard/           Authenticated app (guarded by middleware + layout)
      customers/         Reference feature — copy this to build your own
  components/
    ui/                  shadcn components (owned, edit freely)
    dashboard/  marketing/  auth/  theme/
  services/              Service seam: typed, mock-by-default data access
  lib/
    supabase/            Browser / server / middleware clients
    auth/                getSession, sign-out action
    authz.ts             Role, hasRole (pure); authz.server.ts (requireRole)
  config.ts  paths.ts  middleware.ts
```

**Data flow.** Server Components read through `src/services/*`. Mutations run in
zod-validated Server Actions (see `src/app/dashboard/customers/actions.ts`). To
go live, swap a service's body for real Supabase/REST calls — the signatures
stay the same. See [ADR 0003](docs/adr/0003-mock-first-service-seam.md) and
[ADR 0004](docs/adr/0004-rsc-server-actions-first.md).

**Adding a feature.** Copy the Customers feature: a `services/<name>.ts` seam, a
route under `app/dashboard/<name>/`, an `actions.ts` for writes, and components
under `components/dashboard/<name>/`.

---

## Deploy

**Vercel** — import the repo, set `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, deploy. Zero config.

**Self-host (Docker)** — the app builds to a standalone server:

```bash
docker compose up --build      # serves on :3000, reads .env
```

For a reverse-proxy setup, see the commented block in `docker-compose.yml`.

---

## License

MIT — see [LICENSE](LICENSE).
