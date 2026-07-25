import type { ReportPeriod } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Pure period presentation: the URL a period option navigates to, and the
// caption for the section it scopes.
//
// ⚠️ THIS MODULE MUST NOT CARRY "use client".
//
// It is imported from BOTH sides of the boundary — the picker (a Client
// Component) calls `reportPeriodHref`, and two RSC screens (the client report
// and the client posts pages) call `scopeCaption`. A "use client" directive
// turns every export into a client reference, and a server component cannot
// CALL a client reference; it can only render it as a component or pass it as
// a prop. These helpers therefore live here rather than in
// report-period-picker.tsx, which is a client module.
//
// That failure does not show up in a build (the report route is dynamic, so it
// is never executed at build time) or in a unit test (where the directive is
// inert) — only at request time. report-period.test.ts pins the directive's
// absence for that reason.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The URL a period option navigates to.
 *
 * ⚠️ ALWAYS writes the param — including for all-time. An earlier version
 * stripped it there to keep the default URL clean, which made "All time"
 * unreachable: an absent param legitimately means "first visit, no choice yet"
 * (client-tabs.tsx links here without one) and the decoder correctly resolves
 * that to the newest month. Stripping the param made a deliberate choice
 * indistinguishable from no choice, so the selection silently reverted.
 *
 * The decoder is right; the encoder was throwing the answer away.
 */
export function reportPeriodHref(pathname: string, periodKey: string): string {
  return `${pathname}?period=${encodeURIComponent(periodKey)}`;
}

/**
 * The scope caption for a period. Used by the report's three sections, the print
 * report's three sections, and the posts screen.
 *
 * Labels are NOT lowercased: "July 2026" and "Q3 2026" are proper nouns, and an
 * earlier version rendered them as "july 2026". All-time is the one label that
 * is ordinary prose rather than a name, so it alone reads better lowercased
 * mid-sentence.
 */
export function scopeCaption(period: ReportPeriod): string {
  return `Scoped to ${period.kind === "all" ? "all time" : period.label}`;
}
