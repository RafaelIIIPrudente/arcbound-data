"use client";

import { usePathname, useRouter } from "next/navigation";

import { DateRangePicker } from "@/components/dashboard/date-range/date-range-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The range options this surface offers, and the ONE list both the picker and
 * the URL decoder read.
 *
 * ⚠️ PLAIN DATA, DELIBERATELY — no function is exported from this "use client"
 * module. `report-period.ts` documents why that distinction matters: a Server
 * Component cannot CALL a client reference, so the pure helpers there had to
 * live outside the client module. Constants are not references; `page.tsx`
 * imports these to keep its decoder's whitelist and these buttons in step,
 * because a key the picker offers and the decoder rejects would silently snap
 * back to the default.
 */
export const DASHBOARD_PRESETS = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "all", label: "All time" },
];

/** The preset LENGTHS the decoder will accept. All-time is not a length. */
export const PRESET_DAYS = [7, 30, 90];

/** Omitted from the URL, so the default view has a clean address. */
export const DEFAULT_RANGE = "30d";

const TRIGGER = "w-auto gap-2 font-mono text-[11.5px] tracking-wide uppercase";

/**
 * Client-side filter bar. Reads = RSC: this component only rewrites the URL
 * search params (`client`, `range`); the `/` server component re-fetches from
 * the analytics seam. Only these two params exist, and the current values come
 * in as props, so the next URL is built from props alone (no useSearchParams,
 * hence no Suspense boundary needed).
 *
 * ⚠️ THE ROUTER LIVES HERE, NOT IN THE PICKER. `DateRangePicker` is shared with
 * the Client report, whose URL rule differs — it must ALWAYS write its param,
 * never strip it. This surface strips `range` at its default. Both rules cannot
 * live in one component, so the picker hands back a token and each caller builds
 * its own href.
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
    // Still omitted at the default, so `/` stays the clean address. Unlike the
    // report, an absent `range` here has exactly one meaning.
    if (nextRange !== DEFAULT_RANGE) params.set("range", nextRange);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
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
