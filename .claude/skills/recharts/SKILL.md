---
name: recharts
description: Use when building or reviewing charts in this repo — enforces Recharts v3 idioms (declarative composition, ResponsiveContainer, v2→v3 deltas) and this repo's shadcn ChartContainer + CSS-variable theming; keeps us aligned with current Recharts docs.
---

# Recharts v3 (stack alignment)

Keep this repo's charts aligned with **Recharts v3**, consumed through the **shadcn chart wrapper**.
The distilled, cited docs live in [`references/recharts-docs.md`](references/recharts-docs.md); the
wiring is in [`src/components/ui/chart.tsx`](../../../src/components/ui/chart.tsx). Colors come from the
repo's semantic tokens — coordinate with the [`tailwind-v4`](../tailwind-v4/SKILL.md) and
[`shadcn-ui`](../shadcn-ui/SKILL.md) skills.

## When to use

- Building an analytics chart (impressions-over-time, engagement-rate — SRS UC-05 / the T5 dashboard).
- Reviewing a diff that touches `src/components/ui/chart.tsx` or any `recharts` usage.
- Any time a chart is about to hard-code a hex color or skip `ResponsiveContainer`.

## Pinned version

From `package.json`: `recharts ^3.8.0`. Consumed via the shadcn `ChartContainer` /
`ChartTooltip` / `ChartLegend` helpers in `src/components/ui/chart.tsx`. **Aligned to Recharts v3 —
refresh if the major bumps.** The docs host is now `recharts.github.io` (the old `recharts.org` deep
links 404).

## Current idioms (Recharts v3)

Sourced + cited in [`references/recharts-docs.md`](references/recharts-docs.md):

- **Declarative composition** — a chart container (`LineChart`/`AreaChart`/`BarChart`) **nests**
  `CartesianGrid`, `XAxis`/`YAxis`, `Tooltip`, `Legend`, and data marks (`Line`/`Area`/`Bar`) as
  children. No config object; **z-order = JSX source order**.
- **`ResponsiveContainer` is required** for sizing (it observes the parent). In this repo
  `ChartContainer` **already owns it** — don't wrap chart children in a second one.
- **`accessibilityLayer` defaults to `true`** in v3 (keyboard + screen reader) — keep it on.
- **v2→v3 deltas to respect** — `defaultProps` removed; internal `CategoricalChartState` gone (use
  hooks like `useActiveTooltipLabel`); custom-tooltip type is now `TooltipContentProps`; several props
  removed (`activeIndex`, `alwaysShow`, `Pie.blendStroke`, …). Full list in the digest.

## This repo's conventions

- **`src/components/ui/chart.tsx`** — the shadcn wrapper is the entry point. Use `ChartContainer`
  (owns the `ResponsiveContainer`, passes the v3 `initialDimension` prop), `ChartTooltip` +
  `ChartTooltipContent`, and `ChartLegend` + `ChartLegendContent`. `ChartTooltipContent` is typed off
  Recharts' `DefaultTooltipContentProps` (v3) — leave that alone.
- **Theming is two-layer, token-driven** — build a `ChartConfig` mapping each series key to a `label`
  (+ optional `icon`) and a `color`/`theme` pair; `ChartContainer` emits **`--color-<key>`** CSS vars,
  and marks reference them via `fill="var(--color-<key>)"` / `stroke="var(--color-<key>)"`. The global
  palette is `--chart-1…--chart-5` (light/dark) from `globals.css`.
- **No ad-hoc hex** — color via the `ChartConfig` + `var(--color-…)` and the semantic Tailwind tokens
  already wired in the container className (`stroke-border`, `fill-muted`, `fill-muted-foreground`).
- **Charts read data from the Service Seam** (like every screen) — pass it in as props; the chart
  component doesn't fetch.

## Banned / outdated

- **Never skip `ResponsiveContainer`** — but never add a second one inside `ChartContainer` either.
- **No ad-hoc hex / inline colors** — use `ChartConfig` + `var(--color-…)` / semantic tokens.
- **Don't adopt on this pin** — the chart-level `responsive` prop (rely on the container instead) or
  any v2 internal-state pattern (`CategoricalChartState` / full-state `<Customized>`) — both are the
  wrong path on v3.
- **Don't reach for another chart library** — Recharts (via the shadcn wrapper) is the one charting
  dependency.

## Common tasks

- **Add an analytics chart:** author a `ChartConfig`, wrap the Recharts chart in `<ChartContainer
config={…}>`, compose `XAxis`/`Line`/`ChartTooltip`, and color marks with `var(--color-<key>)`.
- **A themed tooltip/legend:** use `ChartTooltip`/`ChartTooltipContent` and
  `ChartLegend`/`ChartLegendContent` from `ui/chart.tsx` rather than raw Recharts `Tooltip`/`Legend`.
- **Pick colors:** extend `--chart-*` tokens in `globals.css` (see the `tailwind-v4` skill) and
  reference them by name — never a literal hex.

## Refresh

1. Re-run **`/research`** against recharts.github.io (getting-started, ResponsiveContainer, a chart
   API) + the **3.0 migration guide** + ui.shadcn.com/docs/components/chart — **pin to v3** and flag
   any 3.9+/4.x idioms.
2. Update [`references/recharts-docs.md`](references/recharts-docs.md) — digest, **Official sources**,
   and **Researched on** date.
3. Update the Pinned version block from `package.json`.
4. **Bump this skill when Recharts changes major** (v3 → v4): re-verify the composition model and the
   shadcn wrapper's compatibility.
