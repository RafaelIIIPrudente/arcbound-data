"use client";

import { usePathname, useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReportPeriod } from "@/services/types";

// The pure helpers live in report-period.ts, NOT here: this is a client module,
// and the report page (an RSC) calls `scopeCaption` from the same pair.
import { reportPeriodHref } from "./report-period";

/**
 * Scopes the Key Performance section only. Reads = RSC: this component just
 * rewrites the `period` search param and the server component re-fetches.
 * `period` is the only param on this route and its current value arrives as a
 * prop, so the next URL is built from props alone — no useSearchParams, hence
 * no Suspense boundary needed (same idiom as dashboard-filters.tsx).
 */
export function ReportPeriodPicker({ periods, value }: { periods: ReportPeriod[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const groups = [
    { label: "Years", items: periods.filter((p) => p.kind === "year") },
    { label: "Quarters", items: periods.filter((p) => p.kind === "quarter") },
    { label: "Months", items: periods.filter((p) => p.kind === "month") },
  ].filter((g) => g.items.length > 0);

  const allTime = periods.find((p) => p.kind === "all");

  return (
    <Select
      value={value}
      onValueChange={(v) => router.replace(reportPeriodHref(pathname, v), { scroll: false })}
    >
      <SelectTrigger
        className="w-auto max-w-55 gap-2 font-mono text-[11.5px] tracking-wide uppercase sm:max-w-70"
        aria-label="Period for key performance"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allTime ? <SelectItem value={allTime.key}>{allTime.label}</SelectItem> : null}
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.items.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
