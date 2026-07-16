"use client";

import { usePathname, useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardRange } from "@/services/types";

const RANGES: { value: DashboardRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const TRIGGER = "w-auto gap-2 font-mono text-[11.5px] tracking-wide uppercase";

/**
 * Client-side filter bar. Reads = RSC: this component only rewrites the URL
 * search params (`client`, `range`); the `/` server component re-fetches from
 * the analytics seam. Only these two params exist, and the current values come
 * in as props, so the next URL is built from props alone (no useSearchParams,
 * hence no Suspense boundary needed).
 */
export function DashboardFilters({
  clients,
  client,
  range,
}: {
  clients: { id: string; name: string }[];
  client: string;
  range: DashboardRange;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function hrefFor(nextClient: string, nextRange: DashboardRange) {
    const params = new URLSearchParams();
    if (nextClient !== "all") params.set("client", nextClient);
    if (nextRange !== "30d") params.set("range", nextRange);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="flex flex-wrap gap-2.5">
      <Select
        value={client}
        onValueChange={(v) => router.replace(hrefFor(v, range), { scroll: false })}
      >
        <SelectTrigger className={TRIGGER} aria-label="Filter by client">
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

      <Select
        value={range}
        onValueChange={(v) =>
          router.replace(hrefFor(client, v as DashboardRange), { scroll: false })
        }
      >
        <SelectTrigger className={TRIGGER} aria-label="Filter by date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGES.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
