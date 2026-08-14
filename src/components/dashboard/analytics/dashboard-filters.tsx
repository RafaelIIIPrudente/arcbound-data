"use client";

import { usePathname, useRouter } from "next/navigation";

import { DASHBOARD_PRESETS } from "@/components/dashboard/analytics/dashboard-range";
import { DateRangePicker } from "@/components/dashboard/date-range/date-range-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ⚠️ THE RANGE VOCABULARY LIVES IN `dashboard-range.ts`, AND IS NOT RE-EXPORTED
// FROM HERE. It used to be declared in this file, under a comment that read
// "PLAIN DATA, DELIBERATELY — no function is exported from this 'use client'
// module … Constants are not references." That was FALSE, and it shipped a
// crash: a "use client" directive converts every EXPORT of a module into a
// client reference, a `const` array exactly like a function, so `page.tsx` —
// an RSC — received a proxy rather than `PRESET_DAYS` and threw on the first
// property access (`presets.includes(days)`) for `/?range=7d` and `/?range=90d`.
//
// Re-exporting the names from here would rebuild that trap for the next
// importer, which is why this module imports what it needs and publishes
// nothing. `dashboard-range.test.ts` pins that; `src/rsc-boundary.test.ts`
// pins the general rule across `src/`.

const TRIGGER = "w-auto gap-2 font-mono text-[11.5px] tracking-wide uppercase";

/**
 * Client-side filter bar. Reads = RSC: this component only rewrites the URL
 * search params (`client`, `range`); the `/` server component re-fetches from
 * the analytics seam. Only these two params exist, and the current values come
 * in as props, so the next URL is built from props alone (no useSearchParams,
 * hence no Suspense boundary needed).
 *
 * ⚠️ THE ROUTER LIVES HERE, NOT IN THE PICKER. `DateRangePicker` is shared with
 * the Client report, whose URL dialect differs (`?period=`, `custom:`-prefixed).
 * The two surfaces cannot share one href builder, so the picker hands back a
 * token and each caller builds its own — but both now follow the SAME rule about
 * defaults: always write the param.
 */
export function DashboardFilters({
  clients,
  client,
  range,
  today,
}: {
  clients: { id: string; name: string }[];
  client: string;
  /** The current `?range=` token — a preset key, `all`, or a custom window. */
  range: string;
  /** Injected so the calendar's "no future dates" boundary is the server's day. */
  today: Date;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function hrefFor(nextClient: string, nextRange: string) {
    const params = new URLSearchParams();
    if (nextClient !== "all") params.set("client", nextClient);
    // ⚠️ ALWAYS WRITES `range`, INCLUDING THE DEFAULT. It used to be stripped
    // to keep `/` tidy, and that tidiness hid a crash for weeks: `30d` was the
    // ONE preset that never reached `decodeRange`, so the only preset that
    // appeared to work was the only one nobody was testing. `report-period.ts`
    // records the same rule for `?period=` after the same class of bug.
    //
    // An ABSENT `range` is still valid and still resolves to the default
    // (`normalizeRange` in page.tsx), so a bare `/` — the nav link, a bookmark,
    // a first visit — is unaffected. This only concerns what the picker WRITES.
    params.set("range", nextRange);
    // No empty-query branch: `range` is now unconditional, so the string is
    // never empty and a `qs ? … : pathname` ternary would be a dead one.
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="flex flex-wrap gap-2.5">
      <Select
        value={client}
        onValueChange={(v) => router.replace(hrefFor(v, range), { scroll: false })}
      >
        <SelectTrigger className={`${TRIGGER} max-w-55 sm:max-w-70`} aria-label="Filter by client">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All clients</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DateRangePicker
        presets={DASHBOARD_PRESETS}
        value={range}
        // ⚠️ EXPLICIT, NEVER INHERITED. The prop defaults to false so a caller
        // that forgets it ships the narrower surface; this is a staff-only
        // screen, so it opts in deliberately.
        allowCustom
        today={today}
        ariaLabel="Filter by date range"
        onSelect={(token) => router.replace(hrefFor(client, token), { scroll: false })}
      />
    </div>
  );
}
