# Web App Template Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild this repository into a frontend-only Next.js 15 starter on Tailwind v4 + shadcn/ui with Supabase auth, a mock-first typed Service Seam, real RBAC primitives, tests, CI, and full docs.

**Architecture:** App Router, server-first. React Server Components read through a typed `src/services/*` seam (mock by default); mutations run in zod-validated Server Actions. Auth is really wired to Supabase; all other data is mock behind the seam. UI is shadcn/ui components owned in-repo. See `docs/adr/0001`–`0004`.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript 5 · Tailwind CSS v4 · shadcn/ui · lucide-react · TanStack Table · react-hook-form + zod · sonner · next-themes · recharts · @supabase/ssr + supabase-js · Vitest + React Testing Library · Playwright · pnpm.

## Global Constraints

- Package name: `web-app-template`. Default UI brand string: `Web App Template`. Never reintroduce `stock-app` / `StockApp`.
- Node `22.x`, pnpm `10.x` (keep the Volta pin).
- No `@mui/*`, `aws-amplify`, `firebase`, `@auth0/nextjs-auth0`, `mapbox-gl`, `react-map-gl`, `react-simple-maps`, `@tiptap/*`, `@dnd-kit/*`, `framer-motion-ticker` in the final dependency tree.
- Only auth touches a live backend. All app data flows through `src/services/*` and returns mock data. Screens never import mock data directly.
- Reads: Server Components calling the seam. Writes: `'use server'` actions that `zod`-validate then call the seam.
- Conventional Commits enforced by commitlint. Every task ends on a green typecheck (`pnpm type:check`) and, where a test exists, green tests.
- Every kept auth/session code path is Supabase-only.

---

## File Structure (target)

```
src/
  app/
    (marketing)/layout.tsx            # public shell
    (marketing)/page.tsx              # Marketing Landing
    auth/                             # Supabase auth routes only
      layout.tsx
      callback/route.ts               # PKCE code exchange
      sign-in/page.tsx
      sign-up/page.tsx
      sign-up-confirm/page.tsx
      reset-password/page.tsx
      update-password/page.tsx
    dashboard/
      layout.tsx                      # Dashboard Shell (auth-guarded)
      page.tsx                        # overview (mock stat cards + 1 chart)
      blank/page.tsx
      settings/{page,security}.tsx
      customers/                      # Reference Feature (CRUD)
        page.tsx  [customerId]/page.tsx  create/page.tsx  actions.ts
      team/
        members/page.tsx
        permissions/page.tsx          # mock RBAC admin screen
      role-settings/page.tsx          # mock role cards
    layout.tsx  not-found.tsx  globals.css
  components/
    ui/*                              # shadcn components (owned)
    dashboard/*  marketing/*  auth/*  # feature components
    theme/{theme-provider,mode-toggle}.tsx
  services/                           # Service Seam (mock-first)
    customers.ts  team.ts  roles.ts  types.ts  mock/*
  lib/
    supabase/{client,server,middleware}.ts
    auth/{strategy.ts, session.ts}
    authz.ts                          # Role, hasRole, requireRole, RoleGuard
    utils.ts                          # cn()
  config.ts  paths.ts  middleware.ts  env.d.ts
supabase/config.toml                  # local dev (optional stack)
tests/  (unit colocated *.test.ts)  e2e/*.spec.ts
```

---

## Phase 0 — Foundation & scaffold

### Task 0.1: Prune legacy stack

**Files:** delete `src/styles/theme/**`, `src/app/dashboard/{analytics,crypto,invoices,orders,products,smart-home,tasks}/**`, matching `src/components/dashboard/{analytics,crypto,invoice,order,product,smart-home,tasks}/**`, all non-Supabase auth (`src/app/auth/{auth0,cognito,custom,firebase}/**`, `src/components/auth/{cognito,custom,firebase}/**`, `src/contexts/auth/{auth0,cognito,custom,firebase}/**`, `src/lib/auth/{auth0,cognito,custom,firebase}/**`, `src/lib/firebase/**`). Keep `src/lib/supabase/**`, `src/lib/get-site-url.ts`, `src/paths.ts`, `src/hooks/use-*` (framework-agnostic ones), `src/lib/logger.ts`, `src/lib/default-logger.ts`.

- [ ] **Step 1:** Delete the directories above with `git rm -r`.
- [ ] **Step 2:** Verify no remaining import references the deleted trees: `grep -rn "@mui\|aws-amplify\|firebase\|auth0\|cognito\|mapbox\|tiptap\|dnd-kit\|react-simple-maps" src/` — expect only files themselves slated for rebuild in later tasks; note them.
- [ ] **Step 3:** Commit: `chore: remove MUI theme, demo pages, and non-Supabase auth`

### Task 0.2: Rewrite package.json

**Files:** Modify `package.json`.

- [ ] **Step 1:** Set `"name": "web-app-template"`. Remove every banned dependency (Global Constraints) plus `@emotion/*`, `@fontsource/*`, `@mui/*`, `stylis*`, `react-is`, `@elgorditosalsero/react-gtm-hook`, `framer-motion-ticker`. Keep `next`, `react`, `react-dom`, `react-hook-form`, `@hookform/resolvers`, `zod`, `sonner`, `recharts`, `dayjs`, `@supabase/ssr`, `@supabase/supabase-js`, `react-dropzone`, `@phosphor-icons/react`→remove (replaced by lucide).
- [ ] **Step 2:** Add deps: `tailwindcss@^4`, `@tailwindcss/postcss@^4`, `lucide-react`, `next-themes`, `@tanstack/react-table`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`.
- [ ] **Step 3:** Add devDeps: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@playwright/test`, `prettier`, `prettier-plugin-tailwindcss`, `lint-staged`, `supabase` (CLI, optional).
- [ ] **Step 4:** Scripts: add `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:e2e": "playwright test"`, `"format": "prettier --write ."`, keep `dev/build/start/lint/type:check/prepare`.
- [ ] **Step 5:** `pnpm install`; run `pnpm type:check` (will fail on not-yet-rebuilt files — acceptable this task; record the failing set).
- [ ] **Step 6:** Commit: `chore: swap dependency tree to tailwind + shadcn stack`

### Task 0.3: Tailwind v4 + shadcn init + global styles

**Files:** Create `postcss.config.mjs`, `src/app/globals.css`, `components.json`, `src/lib/utils.ts`. Modify `src/app/layout.tsx`, `next.config.ts` (`output: 'standalone'`).

- [ ] **Step 1:** `postcss.config.mjs` → `export default { plugins: { '@tailwindcss/postcss': {} } }`.
- [ ] **Step 2:** `globals.css` with `@import "tailwindcss";` + shadcn CSS variables (`:root` and `.dark`) for light/dark tokens (background, foreground, primary, muted, border, ring, etc.).
- [ ] **Step 3:** `src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4:** `components.json` (shadcn config: style "new-york", rsc true, tailwind baseColor "neutral", aliases `@/components`, `@/lib/utils`).
- [ ] **Step 5:** Add base shadcn components: `pnpm dlx shadcn@latest add button input label card dropdown-menu avatar badge tabs dialog sheet form table sonner separator skeleton` → lands in `src/components/ui/*`.
- [ ] **Step 6:** Root `layout.tsx`: wrap children in `<ThemeProvider>` (Task 3.1 provides it — for now a placeholder passthrough) and render `<Toaster />` from sonner. Set `metadata.title` from `config.site.name`.
- [ ] **Step 7:** `pnpm build` for a trivial page must succeed. Commit: `feat: tailwind v4 + shadcn baseline and global theme tokens`

### Task 0.4: Tooling — Prettier, lint-staged, husky, .claude, GitHub files

**Files:** Create `.prettierrc.json`, `.prettierignore`, `lint-staged.config.mjs`, `.claude/settings.json`, `.claude/.gitignore`, `.claude/commands/{verify,ship}.md`, `.claude/{agents,skills}/README.md`, `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.md`, `.github/dependabot.yml`, `CODEOWNERS`, `LICENSE` (MIT). Modify `.husky/pre-commit`.

- [ ] **Step 1:** `.prettierrc.json` → `{ "plugins": ["prettier-plugin-tailwindcss"], "singleQuote": false, "semi": true }`.
- [ ] **Step 2:** `lint-staged.config.mjs` → run `eslint --fix`, `prettier --write` on staged `*.{ts,tsx}`.
- [ ] **Step 3:** `.husky/pre-commit` → `pnpm lint-staged && pnpm type:check`.
- [ ] **Step 4:** `.claude/settings.json` → permission allowlist for safe read-only + common dev commands (`pnpm *`, `git status/diff/log`, `ls`, `grep`), empty `hooks` block with an explanatory comment, `env` block placeholder. `.claude/.gitignore` → `settings.local.json`.
- [ ] **Step 5:** `.claude/commands/verify.md` (invoke project verify flow: typecheck + test + build) and `ship.md` (conventional-commit + push helper). `agents/README.md` + `skills/README.md` explain what belongs there.
- [ ] **Step 6:** GitHub issue/feature templates, `dependabot.yml` (npm weekly), `CODEOWNERS` (`* @RafaelIIIPrudente`), MIT `LICENSE`.
- [ ] **Step 7:** Commit: `chore: prettier, lint-staged, .claude scaffold, github template files`

---

## Phase 1 — Config, env, Supabase clients

### Task 1.1: Config + env schema

**Files:** Modify `src/config.ts`, `src/env.d.ts`. Create `.env.example`.

- [ ] **Step 1:** Reduce `config.ts` to site + Supabase + logLevel only (drop auth0/cognito/firebase/mapbox/gtm blocks). `site.name = "Web App Template"`.
- [ ] **Step 2:** Trim `env.d.ts` to `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_VERSION`, `NEXT_PUBLIC_LOG_LEVEL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] **Step 3:** `.env.example` documenting each var with the placeholder + a comment pointing at README "Connect Supabase".
- [ ] **Step 4:** `pnpm type:check` green for these files. Commit: `feat: supabase-only config and env schema`

### Task 1.2: Supabase clients (port + trim)

**Files:** Modify `src/lib/supabase/{client,server,middleware}.ts`; create `src/lib/auth/session.ts`.

- [ ] **Step 1:** Confirm `client.ts` (browser) and `server.ts` (`cookies()`-based) use `@supabase/ssr` `createBrowserClient` / `createServerClient`. Remove any strategy branching.
- [ ] **Step 2:** `session.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
```

- [ ] **Step 3:** `pnpm type:check` green. Commit: `feat: supabase clients + getSession helper`

---

## Phase 2 — Service Seam

### Task 2.1: Seam types + mock data

**Files:** Create `src/services/types.ts`, `src/services/mock/customers.ts`.

- [ ] **Step 1:** `types.ts` defines `Customer` (`id`, `name`, `email`, `company`, `status: "active"|"blocked"|"pending"`, `createdAt: string`), plus `Paginated<T>` (`items`, `total`).
- [ ] **Step 2:** `mock/customers.ts` exports `MOCK_CUSTOMERS: Customer[]` — 12 obviously-placeholder rows.
- [ ] **Step 3:** Commit: `feat: service seam types and mock customer data`

### Task 2.2: Customers service (the seam contract)

**Files:** Create `src/services/customers.ts`, `src/services/customers.test.ts`.

**Interfaces — Produces:**

```ts
listCustomers(opts?: { q?: string; page?: number; pageSize?: number }): Promise<Paginated<Customer>>
getCustomer(id: string): Promise<Customer | null>
createCustomer(input: Omit<Customer, "id" | "createdAt">): Promise<Customer>
updateCustomer(id: string, patch: Partial<Omit<Customer,"id"|"createdAt">>): Promise<Customer>
deleteCustomer(id: string): Promise<void>
```

- [ ] **Step 1 (test first):** `customers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { listCustomers, getCustomer, createCustomer } from "./customers";
describe("customers service", () => {
  it("lists and filters by query", async () => {
    const all = await listCustomers();
    expect(all.total).toBeGreaterThan(0);
    const filtered = await listCustomers({ q: all.items[0].name.slice(0, 3) });
    expect(filtered.items.length).toBeGreaterThan(0);
  });
  it("gets by id and creates", async () => {
    const created = await createCustomer({
      name: "Ada",
      email: "ada@x.io",
      company: "L",
      status: "active",
    });
    expect(created.id).toBeTruthy();
    expect(await getCustomer(created.id)).toMatchObject({ name: "Ada" });
  });
});
```

- [ ] **Step 2:** Run `pnpm test customers` → FAIL (module not implemented).
- [ ] **Step 3:** Implement `customers.ts` over an in-memory clone of `MOCK_CUSTOMERS`, each function `async`, id via a monotonic counter (no `Date.now`/random for determinism in tests — derive id from array length + prefix). Top-of-file comment: `// TODO: swap this seam for supabase.from("customers"). Signatures stay identical.`
- [ ] **Step 4:** Run `pnpm test customers` → PASS.
- [ ] **Step 5:** Commit: `feat: customers service seam (mock, tested)`

---

## Phase 3 — Shell, theme, authz

### Task 3.1: Theme provider + mode toggle

**Files:** Create `src/components/theme/theme-provider.tsx`, `src/components/theme/mode-toggle.tsx`. Modify root `layout.tsx` to use the real provider.

- [ ] **Step 1:** `theme-provider.tsx` wraps `next-themes` `ThemeProvider` (`attribute="class"`, `defaultTheme="system"`).
- [ ] **Step 2:** `mode-toggle.tsx` — shadcn dropdown with Light/Dark/System using `useTheme()` and lucide `Sun`/`Moon`.
- [ ] **Step 3:** Verify toggling flips `.dark` on `<html>` in the browser. Commit: `feat: light/dark theme provider + toggle`

### Task 3.2: Authz primitives

**Files:** Create `src/lib/authz.ts`, `src/lib/authz.test.ts`, `src/components/auth/role-guard.tsx`.

**Interfaces — Produces:**

```ts
type Role = "superadmin" | "admin" | "manager" | "member";
roleFromUser(user: { app_metadata?: { role?: string } } | null): Role   // defaults "member"
hasRole(user, ...allowed: Role[]): boolean
requireRole(user, ...allowed: Role[]): void   // throws Response/redirect helper on fail
```

- [ ] **Step 1 (test first):** `authz.test.ts` asserts `roleFromUser({app_metadata:{role:"admin"}})==="admin"`, `roleFromUser(null)==="member"`, `hasRole(user,"admin","superadmin")` truthy for admin, falsy for member.
- [ ] **Step 2:** Run → FAIL. Implement `authz.ts`. `requireRole` throws so callers can `redirect("/dashboard")`.
- [ ] **Step 3:** Run → PASS.
- [ ] **Step 4:** `role-guard.tsx` (server component): reads `getSession()`, renders children only if `hasRole`. Commit: `feat: RBAC primitives (Role, hasRole, requireRole, RoleGuard)`

### Task 3.3: Middleware route protection

**Files:** Modify `src/middleware.ts`, `src/lib/supabase/middleware.ts`.

- [ ] **Step 1:** `updateSession` refreshes the Supabase session cookie (port existing).
- [ ] **Step 2:** In `middleware.ts`: unauthenticated requests to `/dashboard/**` → redirect `/auth/sign-in`; authenticated requests to `/auth/**` → redirect `/dashboard`; `/dashboard/**/system-admin` and role-settings require `roleFromUser === "superadmin"|"admin"` else redirect `/dashboard`.
- [ ] **Step 3:** Config `matcher` excludes `_next`, static, images.
- [ ] **Step 4:** Verify redirects manually. Commit: `feat: session refresh + role-aware route protection`

### Task 3.4: Dashboard Shell

**Files:** Create `src/components/dashboard/layout/{side-nav,top-bar,user-menu,nav-config}.tsx`; `src/app/dashboard/layout.tsx`.

- [ ] **Step 1:** `nav-config.ts` — nav items (Overview, Customers, Team, Role settings [role-gated], Settings, Blank) with lucide icons and `paths.*`.
- [ ] **Step 2:** `side-nav` (shadcn, collapsible via `sheet` on mobile), `top-bar` (brand, `mode-toggle`, `user-menu`), `user-menu` (avatar dropdown → Settings, Sign out server action).
- [ ] **Step 3:** `dashboard/layout.tsx` — server component: `const user = await getSession(); if (!user) redirect("/auth/sign-in");` then render shell + `{children}`.
- [ ] **Step 4:** Verify shell renders and nav routes work. Commit: `feat: dashboard shell (side nav, top bar, user menu)`

---

## Phase 4 — Auth screens (Supabase)

### Task 4.1: Auth layout + sign-in/up

**Files:** Create `src/app/auth/layout.tsx`, `src/components/auth/{sign-in-form,sign-up-form}.tsx`, `src/app/auth/{sign-in,sign-up,sign-up-confirm}/page.tsx`, `src/app/auth/callback/route.ts`.

- [ ] **Step 1:** Forms use `react-hook-form` + `zod` + shadcn `Form`. Sign-in calls `supabase.auth.signInWithPassword`; sign-up calls `signUp`; both surface errors via `sonner`.
- [ ] **Step 2:** `callback/route.ts` performs PKCE `exchangeCodeForSession` then redirects to `/dashboard` (port existing pkce route).
- [ ] **Step 3:** Verify sign-in against a local/hosted Supabase project reaches `/dashboard`. Commit: `feat: supabase sign-in / sign-up flows`

### Task 4.2: Password reset + update

**Files:** Create `src/components/auth/{reset-password-form,update-password-form}.tsx`, `src/app/auth/{reset-password,update-password}/page.tsx`.

- [ ] **Step 1:** Reset → `resetPasswordForEmail`; update → `updateUser({ password })`. Same Form/zod/sonner pattern.
- [ ] **Step 2:** Verify the reset email → update flow. Commit: `feat: password reset and update flows`

---

## Phase 5 — Reference Feature (Customers) + remaining screens

### Task 5.1: Customers list (RSC + TanStack Table)

**Files:** Create `src/app/dashboard/customers/page.tsx`, `src/components/dashboard/customer/{customers-table,columns}.tsx`, `src/components/dashboard/customer/customers-table.test.tsx`.

- [ ] **Step 1:** `page.tsx` (server): `const { items } = await listCustomers({ q: searchParams.q });` renders header + `<CustomersTable data={items} />`.
- [ ] **Step 2 (test first):** `customers-table.test.tsx` renders the client table with two rows, asserts both names appear and the status badge renders.
- [ ] **Step 3:** Run → FAIL. Implement `columns.tsx` (TanStack `ColumnDef<Customer>[]`: name, email, company, status badge, actions dropdown) + `customers-table.tsx` (`useReactTable`, shadcn `table`, client-side filter box).
- [ ] **Step 4:** Run → PASS. Commit: `feat: customers list via RSC + TanStack Table (reference)`

### Task 5.2: Customer create + detail via Server Actions

**Files:** Create `src/app/dashboard/customers/actions.ts`, `.../create/page.tsx`, `.../[customerId]/page.tsx`, `src/components/dashboard/customer/customer-form.tsx`.

**Interfaces — Consumes:** `createCustomer`, `getCustomer`, `updateCustomer`, `deleteCustomer` (Task 2.2).

- [ ] **Step 1:** `actions.ts` (`'use server'`): `customerSchema = z.object({...})`; `createCustomerAction(_prev, formData)` → parse → `createCustomer` → `revalidatePath("/dashboard/customers")` → `redirect(detail)`. Also `updateCustomerAction`, `deleteCustomerAction`. Return typed `{ ok: false, errors }` on `ZodError`.
- [ ] **Step 2:** `customer-form.tsx` — client, `useActionState(createCustomerAction)`, shadcn `Form`, field errors from action state.
- [ ] **Step 3:** `create/page.tsx` renders the form; `[customerId]/page.tsx` (server) loads via `getCustomer`, 404s via `notFound()` when null, renders detail + edit + delete.
- [ ] **Step 4:** Verify create → redirect → detail → edit → delete round-trips against the mock seam. Commit: `feat: customer create/detail/edit/delete via Server Actions`

### Task 5.3: Overview, Blank, Settings

**Files:** Create `src/app/dashboard/page.tsx`, `.../blank/page.tsx`, `.../settings/{page,security}/page.tsx`, `src/components/dashboard/overview/{stat-card,activity-chart}.tsx`, `src/components/dashboard/settings/{profile-form,password-form}.tsx`.

- [ ] **Step 1:** Overview: 3–4 shadcn stat `card`s (from a `services/metrics.ts` mock) + one `recharts` area chart wrapped as a shadcn `chart`.
- [ ] **Step 2:** Blank: titled empty scaffold with a comment "copy this to start a page."
- [ ] **Step 3:** Settings: profile form (`updateUser` metadata) + security (update password), tabs via shadcn `tabs`.
- [ ] **Step 4:** Commit: `feat: overview, blank, and settings screens`

### Task 5.4: Team + Role settings (mock RBAC admin)

**Files:** Create `src/services/{team,roles}.ts` (+ mock), `src/app/dashboard/team/{members,permissions}/page.tsx`, `src/app/dashboard/role-settings/page.tsx`, matching components.

- [ ] **Step 1:** `roles.ts`/`team.ts` seam functions returning mock roles, members, permission groups.
- [ ] **Step 2:** Members list (table), permissions matrix (checkbox grid), role cards — all reading the seam. Wrap role-settings route body in `<RoleGuard role="admin">`.
- [ ] **Step 3:** Commit: `feat: team members, permissions matrix, role cards (mock admin, guarded)`

### Task 5.5: Marketing Landing

**Files:** Create `src/app/(marketing)/{layout,page}.tsx`, `src/components/marketing/{hero,features,cta,footer,nav}.tsx`.

- [ ] **Step 1:** Public nav (brand + Sign in), hero, 3-feature grid, CTA, footer — shadcn + Tailwind, responsive, theme-aware.
- [ ] **Step 2:** Root `/` renders the landing; "Sign in" → `/auth/sign-in`. Commit: `feat: marketing landing page`

---

## Phase 6 — Tests, CI, Docker, docs

### Task 6.1: Test runners config + Playwright smoke

**Files:** Create `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `e2e/auth-smoke.spec.ts`.

- [ ] **Step 1:** `vitest.config.ts` (jsdom, `@vitejs/plugin-react`, setup file with `@testing-library/jest-dom`, alias `@`→`src`). Run `pnpm test` → existing unit tests pass.
- [ ] **Step 2:** `playwright.config.ts` (`webServer: pnpm dev`, baseURL localhost:3000). `e2e/auth-smoke.spec.ts`: visit `/`, click Sign in, assert sign-in form; visit `/dashboard` unauthenticated → asserts redirect to `/auth/sign-in`.
- [ ] **Step 3:** `pnpm test:e2e` green (headless). Commit: `test: vitest + playwright config and auth smoke`

### Task 6.2: CI workflow (replace project-specific ones)

**Files:** Delete `.github/workflows/{deploy-to-hetzner.yaml,on-push-dev.yml,on-wd-main.yml}`. Create `.github/workflows/ci.yml`.

- [ ] **Step 1:** `ci.yml` on PR + push to main/dev: setup pnpm + Node 22 → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm type:check` → `pnpm test` → `pnpm exec playwright install --with-deps` → `pnpm test:e2e` → `pnpm build`.
- [ ] **Step 2:** Commit: `ci: single generic pipeline; remove stock-app-specific deploys`

### Task 6.3: Clean Dockerfile + compose

**Files:** Modify `Dockerfile`, `docker-compose.yml`.

- [ ] **Step 1:** Remove the two `COPY --from=us-central1-docker.pkg.dev/...shared-deps` lines and the jq/entrypoint injection. Keep the multi-stage `deps→builder→runner` standalone build.
- [ ] **Step 2:** `docker-compose.yml` → generic service `web` building `.`, `env_file: .env`, `ports: "3000:3000"`, no nginx-proxy/letsencrypt/external-network coupling (leave those as commented opt-in).
- [ ] **Step 3:** `docker build .` succeeds locally. Commit: `build: portable Dockerfile + generic compose`

### Task 6.4: Docs — README, AGENTS/CLAUDE, CONTRIBUTING, Supabase local

**Files:** Rewrite `README.md`; create `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `supabase/config.toml`.

- [ ] **Step 1:** README: what the template is, stack, quickstart (`pnpm i`, `.env`, `supabase start` or hosted, `pnpm dev`), the Service Seam "make it real" note, deploy (Vercel one-click + self-host Docker), links to ADRs + CONTEXT.md.
- [ ] **Step 2:** `AGENTS.md` — conventions (RSC+Server Actions, seam rule, commit style, where things live); `CLAUDE.md` → one line pointing to `AGENTS.md` + `.claude/`.
- [ ] **Step 3:** `CONTRIBUTING.md` (branch, conventional commits, test gates). `supabase/config.toml` minimal local stack.
- [ ] **Step 4:** Commit: `docs: template README, AGENTS/CLAUDE, CONTRIBUTING, supabase local`

### Task 6.5: Final sweep

- [ ] **Step 1:** `grep -rn "stock-app\|StockApp\|@mui\|phosphor" src README.md` → empty.
- [ ] **Step 2:** `pnpm install && pnpm lint && pnpm type:check && pnpm test && pnpm build` all green; `pnpm test:e2e` green.
- [ ] **Step 3:** Update `CONTEXT.md` if any term drifted during the build. Final commit: `chore: final cleanup sweep`.

---

## Self-Review notes

- **Spec coverage:** all 14 decisions map to tasks — scope (0.1, 6.3–6.4), auth Supabase-only (0.1, 1.x, 4.x), feature set (5.x), service seam (2.x, ADR 0003), UI shadcn (0.3, all 5.x), rebuild fidelity (whole plan is fresh build), RSC+actions (5.1–5.2, ADR 0004), RBAC real (3.2–3.3, 5.4), deploy/CI (6.2–6.3), testing (2.2, 3.2, 5.1, 6.1), docs (6.4 + ADRs + CONTEXT), name (0.2, 1.1), tooling (0.4), `.claude` (0.4).
- **Open per-project TODO (documented, not built):** connecting a real Supabase project; swapping each seam to Supabase queries.
- **Type consistency:** `Role` union, `Customer` shape, and the five customers-seam signatures are defined once (Tasks 2.1, 2.2, 3.2) and referenced verbatim by consumers (5.1, 5.2).

```

```
