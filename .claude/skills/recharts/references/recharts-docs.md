# Recharts v3 — docs digest

**Pinned to:** Recharts v3 — `recharts ^3.8.0` (see the repo `package.json`). In this repo Recharts is
consumed through the shadcn/ui chart wrapper (`src/components/ui/chart.tsx`). Refresh if the major
bumps.

**Researched on:** 2026-07-16. A distillation of the CURRENT Recharts v3 model — a summary with
citations, not a copy of the docs.

> **Doc-host note:** the primary docs are now served at **recharts.github.io** — the old
> `recharts.org/en-US/...` deep links return 404. **Pinning caveat:** the docs site is versionless
> (tracks the latest v3.x); before using a feature, confirm it isn't tagged "since 3.9+/3.10+", since
> the pin floats at `^3.8.0`. Two idioms are flagged **do not adopt on this pin** below.

**Official sources:**

- <https://recharts.github.io/en-US/guide/getting-started/>
- <https://recharts.github.io/en-US/api/ResponsiveContainer/>
- <https://recharts.github.io/en-US/api/LineChart/>
- <https://github.com/recharts/recharts/wiki/3.0-migration-guide>
- <https://ui.shadcn.com/docs/components/chart>

---

## Composition model (declarative, nested)

- A chart is a top-level container (`LineChart` / `AreaChart` / `BarChart`) that **wraps specialized
  sub-components as children**: `CartesianGrid`, `XAxis`/`YAxis`, `Tooltip`, `Legend`, and one or more
  data marks (`Line` / `Area` / `Bar`). You build a chart by **nesting**, not by a config object
  (<https://recharts.github.io/en-US/guide/getting-started/>).
- Canonical skeleton: a `LineChart` takes `data`, `width`/`height`, `margin`, and contains
  `<CartesianGrid/> <XAxis dataKey="…"/> <YAxis/> <Tooltip/> <Legend/> <Line dataKey="…"
stroke="…"/>`. Swap `Line`→`Area`/`Bar` for the other chart types
  (<https://recharts.github.io/en-US/api/LineChart/>).
- **Rendering order = SVG source order** (z-index): to change layering, reorder the JSX elements
  (<https://github.com/recharts/recharts/wiki/3.0-migration-guide>).

## ResponsiveContainer (required for sizing)

- Charts have **no intrinsic responsive sizing**; `ResponsiveContainer` watches the parent's size via
  ResizeObserver and feeds width/height to the chart. Its parent must have a defined size
  (<https://recharts.github.io/en-US/api/ResponsiveContainer/>).
- Props: `width` (default `"100%"`), `height` (default `"100%"`), `aspect`, `minWidth`, `minHeight`,
  `debounce`, `onResize`, and **`initialDimension`** (starting size before the observer measures) —
  the last is a **v3 prop** (<https://recharts.github.io/en-US/api/ResponsiveContainer/>).

## Chart / series API (LineChart read in depth)

- `LineChart` props: `data` (array of point objects), `width`/`height` (number or `"100%"`), `margin`,
  `layout` (`"horizontal"` default | `"vertical"`), `syncId`, and **`accessibilityLayer`** (keyboard +
  screen reader — **enabled by default in v3**) (<https://recharts.github.io/en-US/api/LineChart/>).
- `Line` props: `dataKey`, `stroke`, `strokeWidth`, `type` (curve interpolation, e.g.
  `monotone`/`linear`), `dot`, `activeDot`, `isAnimationActive`
  (<https://recharts.github.io/en-US/api/LineChart/>).

## v2 → v3 deltas (the pin's risk surface)

All from the official migration guide (<https://github.com/recharts/recharts/wiki/3.0-migration-guide>):

- **`accessibilityLayer` now defaults to `true`** (was `false`); keyboard events no longer flow through
  `onMouseMove`. Opt out with `accessibilityLayer={false}`.
- **`defaultProps` on function components removed** — don't read component `defaultProps`.
- **Requirements:** React 16.8+ (covers 18/19), TypeScript 5.x, Node 18+; bundled `recharts-scale` /
  `react-smooth` internalized.
- **Internal state no longer exposed:** the `CategoricalChartState` object is gone and `<Customized>`
  no longer receives full internal state — read tooltip state via hooks like `useActiveTooltipLabel`.
- **Tooltip:** custom-tooltip prop type renamed **`TooltipProps` → `TooltipContentProps`**; `label`
  widened to `undefined | string | number`; new `portal` and `axisId` props.
- **Removed/changed props:** `Scatter.points`, `activeIndex` (several charts), `alwaysShow`, `isFront`,
  `Pie.blendStroke`, `animateNewValues`. Axes: `CartesianGrid` needs matching `x/yAxisId`; multiple
  Y-axes order **alphabetically by `yAxisId`**; `YAxis` gains `width="auto"`.

## shadcn/ui chart wrapper + CSS-variable theming

- shadcn deliberately **does not abstract Recharts** — you compose native Recharts elements;
  `ChartContainer` (which **owns the `ResponsiveContainer`**), `ChartTooltip`/`ChartTooltipContent`,
  and `ChartLegend`/`ChartLegendContent` are the only helpers. It targets **Recharts v3**
  (<https://ui.shadcn.com/docs/components/chart>).
- **Two-layer theming:** (1) a `ChartConfig` maps each series key to a `label`, optional `icon`, and a
  `color` or `theme: { light, dark }` pair; (2) `ChartContainer` emits **`--color-<key>`** CSS
  variables, and marks reference them via `fill="var(--color-desktop)"` /
  `stroke="var(--color-desktop)"`. Global `--chart-1…--chart-5` tokens supply the palette
  (<https://ui.shadcn.com/docs/components/chart>).
- Repo tie-in: `src/components/ui/chart.tsx`'s `ChartContainer` passes `initialDimension={{ width:
320, height: 200 }}` to `ResponsiveContainer`, and its `ChartStyle` generates the `--color-<key>`
  vars per theme (`light` → `""`, `dark` → `.dark`). Chart children must **not** be individually
  re-wrapped in a `ResponsiveContainer`. `ChartTooltipContent` types off `DefaultTooltipContentProps`
  and omits `accessibilityLayer` — aligned with v3.

## Do not adopt on this pin (`recharts ^3.8.0`)

- **The `responsive` prop directly on chart components** (an alternative to `ResponsiveContainer`)
  landed in 3.3+, so it exists on 3.8 — but the shadcn wrapper standardizes on `ResponsiveContainer`
  inside `ChartContainer`; don't add `responsive` to chart children
  (<https://recharts.github.io/en-US/api/ResponsiveContainer/>).
- **The v2 internal-state pattern** (`CategoricalChartState` / full-state `<Customized>`) is
  **removed** — use the v3 hooks (`useActiveTooltipLabel`) instead
  (<https://github.com/recharts/recharts/wiki/3.0-migration-guide>).
