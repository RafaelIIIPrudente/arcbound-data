# 4. RSC + Server Actions as the default data pattern

Date: 2026-07-15

## Status

Accepted

## Context

On the Next.js 15 App Router, feature screens can fetch and mutate data in
several ways: Server Components + Server Actions, a client query library
(TanStack Query), or a mix. The template needs one default so every feature —
and every future contributor or coding agent — writes screens the same way.

## Decision

Default to **React Server Components for reads and Server Actions for writes**.
Server Components read through the Service Seam directly. Mutations run in
`'use server'` actions that validate input with `zod` and call the seam. Client
JavaScript is reached for only where a screen is genuinely interactive; a client
query library is not installed by default.

## Consequences

- Minimal client bundle; screens are server-first and Next-native.
- The Reference Feature (Customers) demonstrates the exact read/mutate shape to
  copy.
- Highly interactive, cache-heavy screens may later want TanStack Query; that is
  an opt-in per project, not a template default.
- Contributors must understand the RSC/Server Action boundary — mitigated by the
  worked Reference Feature and docs.
