"use client";

import { usePathname, useRouter } from "next/navigation";

import { DateRangePicker } from "@/components/dashboard/date-range/date-range-picker";
import type { ReportPeriod } from "@/services/types";

// The pure helpers live in report-period.ts, NOT here: this is a client module,
// and two RSC screens — the client report and the client posts pages — call
// `scopeCaption` from the same pair.
import { reportPeriodHref } from "./report-period";

/**
 * Scopes the WHOLE screen that renders it, not one section of it. Shared by the
 * client report, the client posts screen, and the CLIENT-FACING `/r/[token]`
 * report. Reads = RSC: this component just rewrites the `period` search param
 * and the server component re-fetches.
 *
 * ⚠️ `allowCustom` DEFAULTS TO FALSE, AND THAT DEFAULT IS THE BOUNDARY. The same
 * component renders on `/r/[token]`, the report a CLIENT holds. A custom window
 * is a staff affordance — a client's report stays on periods that can be named
 * back to them in a conversation — so a caller that forgets this prop ships the
 * NARROWER surface. Widening is always deliberate, never inherited.
 *
 * ⚠️ IT MUST KEEP CALLING `reportPeriodHref`, which ALWAYS writes the param and
 * never strips it. An absent `period` legitimately means "no choice yet" and the
 * decoder resolves that to the newest month; stripping made a deliberate choice
 * indistinguishable from no choice, which is how "All time" was once unreachable.
 * A custom key is written the same way, for the same reason.
 */
export function ReportPeriodPicker({
  periods,
  value,
  allowCustom = false,
  today,
}: {
  periods: ReportPeriod[];
  value: string;
  allowCustom?: boolean;
  /**
   * The server's day, so the calendar's "no future dates" boundary matches the
   * clock the report was rendered against. Unused when `allowCustom` is false —
   * no calendar renders at all — which is why `/r/[token]` need not pass it.
   */
  today?: Date;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Exactly the grouping the Select this replaced rendered: all-time first and
  // ungrouped, then Years, Quarters, Months. `ReportPeriod.label` is the only
  // string ever shown to staff, so it travels through untouched.
  const presets = [
    ...periods.filter((p) => p.kind === "all").map((p) => ({ key: p.key, label: p.label })),
    ...periods
      .filter((p) => p.kind === "year")
      .map((p) => ({ key: p.key, label: p.label, group: "Years" })),
    ...periods
      .filter((p) => p.kind === "quarter")
      .map((p) => ({ key: p.key, label: p.label, group: "Quarters" })),
    ...periods
      .filter((p) => p.kind === "month")
      .map((p) => ({ key: p.key, label: p.label, group: "Months" })),
  ];

  return (
    <DateRangePicker
      presets={presets}
      value={value}
      allowCustom={allowCustom}
      today={today ?? new Date()}
      // The report's dialect: a bare `2026-06-12..2026-07-29` could not be told
      // apart from a named period key, so a custom window carries the prefix.
      customPrefix="custom:"
      ariaLabel="Reporting period"
      onSelect={(token) => router.replace(reportPeriodHref(pathname, token), { scroll: false })}
    />
  );
}
