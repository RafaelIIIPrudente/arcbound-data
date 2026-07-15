# 1. Replace MUI Joy with Tailwind + shadcn/ui

Date: 2026-07-15

## Status

Accepted

## Context

The template inherited its entire UI from a MUI Joy dashboard theme: the design
system, a custom theme layer (`src/styles/theme/*`), and per-component overrides.
Two problems make Joy a poor foundation for a template meant to outlive many
projects:

1. **Joy UI is still beta** (`5.0.0-beta.x`) and MUI has publicly deprioritized
   it in favor of Material UI + Base UI. A template should not be built on a
   design system its maintainer is stepping back from.
2. The theme layer and overrides are heavy and bespoke, which is friction every
   new project inherits.

Alternatives considered: stay on Joy (pin and accept the risk); migrate to
Material UI (stable, but still a large MUI-shaped rewrite); adopt Tailwind +
shadcn/ui (own the component source, no runtime design-system dependency).

## Decision

Remove all `@mui/*` packages and rebuild the UI on **Tailwind CSS v4 + shadcn/ui**.
Components are copied into the repo (`src/components/ui/*`) and owned by the
template. Icons move to `lucide-react`; tables use TanStack Table; light/dark via
`next-themes`. `react-hook-form`, `zod`, `sonner`, and `recharts` are retained
because shadcn is built on exactly those.

The existing MUI screens are treated as a **specification** for what to build,
not as code to keep. The rebuild is a clean re-scaffold in shadcn's idiom, not a
pixel-for-pixel port.

## Consequences

- Every screen is rebuilt; this is effectively a new template.
- No runtime dependency on a third-party design system; component source is
  ours to edit.
- Non-UI logic (Supabase clients, middleware, config, the Service Seam,
  `paths.ts`) ports over unchanged.
- We take on ownership of component maintenance (the shadcn tradeoff).
