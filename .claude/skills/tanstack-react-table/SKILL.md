---
name: tanstack-react-table
description: Use when building or reviewing data tables in this repo — enforces TanStack Table v8 idioms (headless model, ColumnDef, useReactTable + opt-in row models, flexRender) and this repo's shadcn table + Service Seam conventions; keeps us aligned with current TanStack Table docs.
---

# TanStack Table v8 (stack alignment)

Keep this repo's data tables aligned with **TanStack Table v8** — a **headless** library rendered with
shadcn/ui table primitives. The distilled, cited docs live in
[`references/tanstack-react-table-docs.md`](references/tanstack-react-table-docs.md); the reference
implementation is the Customers table in
[`src/components/dashboard/customer/`](../../../src/components/dashboard/customer). Rendering uses the
[`shadcn-ui`](../shadcn-ui/SKILL.md) `Table` primitives.

## When to use

- Building a sortable/filterable/paginated table (a Clients list, a recent-posts table).
- Reviewing a diff touching `columns.tsx`, a `useReactTable` call, or a table component.
- Any time a table is tempted to fetch its own data or hand-render without `flexRender`.

## Pinned version

From `package.json`: `@tanstack/react-table ^8.21.2`. **Aligned to v8 — refresh if the major bumps.**
A v9 alpha exists with a restructured API; **do not adopt v9 idioms on this pin.**

## Current idioms (v8)

Sourced + cited in [`references/tanstack-react-table-docs.md`](references/tanstack-react-table-docs.md):

- **Headless** — the library owns state/logic; you own the markup. Render with shadcn `Table`
  primitives; feed data in as props (the table never fetches).
- **Columns** — a `ColumnDef<T>[]` array (this repo's style) with `accessorKey`/`header`/`cell`;
  **display columns** (an explicit `id`, no data model) for action menus.
- **`useReactTable({ data, columns, … })`** with **opt-in row models** — `getCoreRowModel()` is
  required; add `getFilteredRowModel()` / `getSortedRowModel()` / `getPaginationRowModel()` as needed.
  `data` must have a **stable reference**.
- **Controlled feature state** — a `useState` slice in the `state` option **plus** the matching
  `on[Feature]Change` callback (e.g. `globalFilter` + `onGlobalFilterChange`).
- **`flexRender(columnDef.header|cell, getContext())`** to render — never call the template directly.

## This repo's conventions

- **`src/components/dashboard/customer/customers-table.tsx`** — the reference (the "Reference Feature"
  per `CONTEXT.md`): a `"use client"` component taking `{ data }`, building the instance with
  `useReactTable({ data, columns, state: { globalFilter }, onGlobalFilterChange, getCoreRowModel,
getFilteredRowModel, getPaginationRowModel })`, then rendering shadcn `Table`/`TableHeader`/… with
  `flexRender` in header and body and Previous/Next buttons gated by
  `getCanPreviousPage()`/`getCanNextPage()`.
- **`src/components/dashboard/customer/columns.tsx`** — `ColumnDef<Customer>[]`: `accessorKey` +
  `header` strings, `cell` render functions that read `row.original`, a `dayjs`-formatted date cell,
  and a trailing **display column** (`id: "actions"`) with a shadcn `DropdownMenu`. New tables copy
  this shape.
- **Data comes from the Service Seam** — the page/RSC loads data via `src/services/*` and passes it to
  the table; the table is pure state/logic. Links (e.g. row actions) go through `src/paths.ts`.
- **Types come from the seam** — columns are typed against `Customer` from `src/services/types.ts`.

## Banned / outdated

- **No fetching inside the table** — data arrives as props from the Service Seam.
- **Don't render templates directly** — always `flexRender(...)`.
- **Don't forget `getCoreRowModel()`**, and don't add a feature's row model without its controlled
  state + `on…Change` callback.
- **Don't adopt v9 idioms on this pin** — keep the v8 adapter imports (`useReactTable`, `ColumnDef`,
  `flexRender`, `getXRowModel`) from `@tanstack/react-table`.
- **Don't hand-build a `<table>`** when the shadcn `Table` primitives + this pattern already exist.

## Common tasks

- **A new list table:** define `ColumnDef<T>[]` in a `columns.tsx`, then copy `customers-table.tsx`
  and swap the type + row models you need.
- **Add global search:** `useState("")` → `state: { globalFilter }` + `onGlobalFilterChange` +
  `getFilteredRowModel()`, wired to a shadcn `Input`.
- **Add sorting:** `useState<SortingState>([])` → `state: { sorting }` + `onSortingChange` +
  `getSortedRowModel()`; toggle via `column.getToggleSortingHandler()`.
- **A row action:** a trailing display column (`id: "actions"`) rendering a shadcn `DropdownMenu`;
  navigate through `paths`.

## Refresh

1. Re-run **`/research`** against tanstack.com/table/latest (introduction, tables, column-defs,
   row-models, sorting, column-filtering, global-filtering, pagination, table-state) +
   ui.shadcn.com/docs/components/data-table — **pin to v8** and flag any v9 divergence.
2. Update [`references/tanstack-react-table-docs.md`](references/tanstack-react-table-docs.md) —
   digest, **Official sources**, and **Researched on** date.
3. Update the Pinned version block from `package.json`.
4. **Bump this skill when TanStack Table changes major** (v8 → v9): re-verify imports and the row-model
   API.
