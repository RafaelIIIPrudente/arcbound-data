# TanStack Table v8 — docs digest

**Pinned to:** TanStack Table v8 — `@tanstack/react-table ^8.21.2` (see the repo `package.json`).
Rendered with shadcn/ui table primitives. Refresh if the major bumps.

**Researched on:** 2026-07-16. A distillation of the CURRENT v8 model (TanStack "latest" resolves to
v8) — a summary with citations, not a copy of the docs.

> **Pinning caveat:** a v9 line (`@tanstack/react-table@9`, alpha) restructured the features/plugin
> API and package layout — **none of it exists in 8.21.x**. Stay on the v8 adapter imports below.

**Official sources:**

- <https://tanstack.com/table/latest/docs/introduction>
- <https://tanstack.com/table/latest/docs/guide/tables>
- <https://tanstack.com/table/latest/docs/guide/column-defs>
- <https://tanstack.com/table/latest/docs/framework/react/react-table>
- <https://tanstack.com/table/latest/docs/guide/row-models>
- <https://tanstack.com/table/latest/docs/guide/sorting>
- <https://tanstack.com/table/latest/docs/guide/column-filtering>
- <https://tanstack.com/table/latest/docs/guide/global-filtering>
- <https://tanstack.com/table/latest/docs/guide/pagination>
- <https://tanstack.com/table/latest/docs/framework/react/guide/table-state>
- <https://tanstack.com/table/latest/docs/api/core/table>
- <https://ui.shadcn.com/docs/components/data-table>

---

## Headless model — the core contract

- TanStack Table is **headless UI**: it provides "the logic, state, processing and API… but do not
  provide markup, styles, or pre-built implementations." It renders **no markup** — you own the DOM
  (or bind to shadcn primitives) (<https://tanstack.com/table/latest/docs/introduction>).
- The table instance is a pure state/logic object, "not a literal HTML `<table>` element" — which is
  exactly why the repo's Service Seam (data in, no fetching in the table) fits
  (<https://tanstack.com/table/latest/docs/guide/tables>).
- Framework-agnostic core with adapters; on this pin use the React adapter `@tanstack/react-table`
  (<https://tanstack.com/table/latest/docs/introduction>).

## Column definitions

- `createColumnHelper<TData>()` returns type-safe builders; **or** a plain `ColumnDef<TData>[]` array
  (the shadcn pattern this repo uses: `{ accessorKey: "email", header: "Email" }`)
  (<https://tanstack.com/table/latest/docs/guide/column-defs>, <https://ui.shadcn.com/docs/components/data-table>).
- Three column kinds (<https://tanstack.com/table/latest/docs/guide/column-defs>):
  - **Accessor columns** (`accessorKey`/`accessorFn`) — have a data model → sortable/filterable.
  - **Display columns** (no data model) — for action buttons, checkboxes, expanders; require an
    explicit `id`.
  - **Grouping columns** — organize child columns under a shared header.
- Key props: `id` (auto-derived from `accessorKey`/string header), `header`, `cell` (gets a context;
  `info.getValue()` / `row.original` read values), `footer`.

## useReactTable + row models

- Create the instance with `useReactTable(options)`; only `data`, `columns`, and a row model are
  required (<https://tanstack.com/table/latest/docs/framework/react/react-table>).
- **`data` must have a stable reference** (`useState`/`useMemo`/store) or you get infinite re-renders
  (<https://tanstack.com/table/latest/docs/guide/tables>).
- **Row models are modular and opt-in** — import only what you use; `getCoreRowModel()` is **always
  required**. The pipeline order is fixed: **Core → Filtered → Grouped → Sorted → Expanded →
  Paginated** → final `getRowModel()` (<https://tanstack.com/table/latest/docs/guide/row-models>):
  ```ts
  import {
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    getPaginationRowModel,
  } from "@tanstack/react-table";
  ```
- Instance exposes `getState()`, per-feature setters, and row accessors `getHeaderGroups()` /
  `getRowModel()` (`{ rows, flatRows, rowsById }`)
  (<https://tanstack.com/table/latest/docs/api/core/table>).

## State: uncontrolled vs controlled

- By default state is internal (read via `table.getState()`). **Controlled**: `useState` + pass the
  value in the `state` option + wire the matching `on[Feature]Change` callback. "State Change
  Callbacks MUST have their corresponding state value in the `state` option"
  (<https://tanstack.com/table/latest/docs/framework/react/guide/table-state>):
  ```jsx
  const [globalFilter, setGlobalFilter] = React.useState("");
  useReactTable({
    data,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  ```

## Sorting / filtering / pagination

- **Sorting:** pass `getSortedRowModel()`; `SortingState = { id, desc }[]`; wire a header with
  `column.getToggleSortingHandler()` and read `column.getIsSorted()` for the caret. Client sort only
  sorts loaded rows (<https://tanstack.com/table/latest/docs/guide/sorting>).
- **Column filters:** `getFilteredRowModel()`; `ColumnFiltersState = { id, value }[]`;
  `column.getFilterValue()`/`setFilterValue()`; built-in `filterFn`s (`includesString`, `equals`,
  `inNumberRange`, …) (<https://tanstack.com/table/latest/docs/guide/column-filtering>).
- **Global filter:** also `getFilteredRowModel()` + a `globalFilterFn`; read `getState().globalFilter`,
  set via `table.setGlobalFilter(value)` / `onGlobalFilterChange`
  (<https://tanstack.com/table/latest/docs/guide/global-filtering>).
- **Pagination:** client-side `getPaginationRowModel()`; server-side `manualPagination: true`. State
  `{ pageIndex, pageSize }` (zero-based). APIs: `nextPage()`, `previousPage()`, `getCanNextPage()`,
  `getCanPreviousPage()`, `setPageSize()`, `getPageCount()`
  (<https://tanstack.com/table/latest/docs/guide/pagination>).

## flexRender — rendering headers/cells

- Headers/cells may be a string, JSX, or a function-of-context; **`flexRender(template, context)`**
  normalizes all three — never call the template directly
  (<https://tanstack.com/table/latest/docs/api/core/table>, <https://ui.shadcn.com/docs/components/data-table>):
  ```tsx
  flexRender(header.column.columnDef.header, header.getContext());
  flexRender(cell.column.columnDef.cell, cell.getContext());
  ```

## shadcn/ui data-table pattern (the rendering layer)

- shadcn keeps TanStack **headless** and composes it with its own primitives so flexibility is
  preserved (<https://ui.shadcn.com/docs/components/data-table>). Convention:
  - **`columns.tsx`** — `ColumnDef<T>[]` (accessors + cell formatters).
  - **table component** — calls `useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() })`,
    then renders with shadcn `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`,
    iterating `getHeaderGroups()` and `getRowModel().rows` with `flexRender(...)`.
  - **page** — loads data (at the Service Seam here, not inside the table) and renders the table.
- Features are added incrementally by pairing a `useState` slice with its row model.

## Do not adopt on this pin (v8)

- The v9-alpha features/plugin API and package layout — none of it exists in 8.21.x.
- Don't expect "automatic" row models — v8 requires explicit `getCoreRowModel()` + each opt-in
  `getXRowModel()`.
- No server fetching inside the table — if server-side is ever needed, use
  `manualSorting`/`manualFiltering`/`manualPagination` + controlled state fed by the Service Seam.
