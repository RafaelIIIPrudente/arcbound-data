# 3. Mock-first typed Service Seam

Date: 2026-07-15

## Status

Accepted

## Context

The template is scoped frontend-only: it should run and be demonstrable with no
backend, yet make "become real" a small, obvious change rather than a rewrite.
Previously mock data lived inline inside components, so wiring a real backend
meant editing many files, and there was no single pattern to copy.

## Decision

Route all app data through a typed **Service Seam** at `src/services/*`. Each
service exposes async functions with real signatures and return types
(`listCustomers()`, `getCustomer(id)`, `createCustomer(input)`, …) that return
mock data today. Swapping to Supabase or a REST backend is a one-file change per
service; screens never change. Screens and Server Actions call services and never
read mock data directly.

Auth is exempt — it is really wired to Supabase (see ADR 0002).

## Consequences

- The app runs end-to-end with zero backend; demos and tests need no live data.
- "Make it real" is a documented, contained edit at the seam.
- The mock data is deliberately obvious placeholder content, not production-like
  fixtures.
- There is a small indirection cost: every feature adds a `services/<feature>.ts`
  file even when trivial.
