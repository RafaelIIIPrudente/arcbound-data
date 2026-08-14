"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";

import { displayLinkedInUrl } from "@/lib/linkedin-url";
import { CLIENT_LIST_METRIC_KEYS, type MetricKey } from "@/lib/metric-definitions";
import { paths } from "@/paths";
import type { ClientListRow } from "@/services/types";

const HEAD = "font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase";

/**
 * Per-column extras this table's header and cells read.
 *
 * ⚠️ `infoMetric` DECLARES AN ⓘ; IT DOES NOT RENDER ONE. A sortable header's
 * content is rendered INSIDE a `<button>` by `clients-table.tsx`, so an ⓘ placed
 * in `columnDef.header` below would nest one button in another — invalid markup
 * that no keyboard can reach. The table renders it as a SIBLING of the sort
 * control instead. Same split as `posts/columns.tsx`, for the same reason.
 */
export interface ClientColumnMeta {
  className?: string;
  /**
   * ⚠️ `MetricKey`, NOT `string` — these are AUTHORED LITERALS, so a typo must be
   * a compile error. `MetricInfo`'s own prop stays `string` on purpose: it also
   * receives RUNTIME labels, and its unmapped branch (render nothing rather than
   * guess) is load-bearing and separately tested. Tightening it there would
   * delete that branch; tightening it here only catches the mistake nobody
   * would otherwise see, because an unknown key renders silently.
   */
  infoMetric?: MetricKey;
}

/**
 * The em dash for a value that could NOT BE READ.
 *
 * ⚠️ NEVER render this for a zero or for "never ingested". Those are facts we
 * know; this is the absence of one. The screen reader text spells that out,
 * because the glyph alone is indistinguishable from an empty cell.
 */
function Unavailable({ what }: { what: string }) {
  return (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">{what} could not be read</span>
    </>
  );
}

function formatUploadDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const columns: ColumnDef<ClientListRow>[] = [
  {
    accessorKey: "name",
    header: () => <span className={HEAD}>Client</span>,
    cell: ({ row }) => (
      // Stretched link: the whole row navigates to the client detail, while the
      // LinkedIn link stays independently clickable (relative z-10).
      <Link
        href={paths.clients.details(row.original.id)}
        className="font-display text-[15px] font-semibold after:absolute after:inset-0"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "linkedin_url",
    header: () => <span className={HEAD}>LinkedIn URL</span>,
    // Narrowed: it is the only way to confirm the right profile was registered,
    // so it stays — but it is a string nobody reads end to end.
    meta: { className: "w-[26%] max-w-0" },
    enableSorting: false,
    cell: ({ row }) => (
      <a
        href={row.original.linkedin_url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative z-10 block truncate font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {displayLinkedInUrl(row.original.linkedin_url)}
      </a>
    ),
  },
  {
    id: "lastUpload",
    // `undefined` (NOT null) for an unreadable value: `sortUndefined: "last"` is
    // applied before the ascending/descending inversion, so those rows park at
    // the bottom in BOTH directions. A null would sort as a value.
    accessorFn: (client) => (client.lastUpload === "unavailable" ? undefined : client.lastUpload),
    sortUndefined: "last",
    // ⚠️ "Last ArcBase upload", NOT "Last upload". The unqualified label made
    // "Never" a claim about everything known of this client, which put it in
    // apparent conflict with the Posts column beside it — a real reader filed
    // "never uploaded but 45 posts" as a bug, and read the screen correctly.
    // Naming the source turns one contradiction back into two facts about two
    // pipelines. ⚠️ `clients-table.tsx` hardcodes the sort `aria-label`; it must
    // keep agreeing with this string.
    header: () => <span className={HEAD}>Last ArcBase upload</span>,
    meta: {
      className: "w-[18%]",
      infoMetric: CLIENT_LIST_METRIC_KEYS["Last ArcBase upload"],
    } satisfies ClientColumnMeta,
    cell: ({ row }) => {
      const { lastUpload } = row.original;
      return (
        <span className="font-mono text-xs text-muted-foreground">
          {lastUpload === "unavailable" ? (
            <Unavailable what="Last ArcBase upload" />
          ) : lastUpload === null ? (
            // A KNOWN fact, not missing data — this client has never been ingested.
            <span className="text-muted-foreground/60">Never</span>
          ) : (
            formatUploadDate(lastUpload)
          )}
        </span>
      );
    },
  },
  {
    id: "postsCount",
    accessorFn: (client) => client.postsCount ?? undefined,
    sortUndefined: "last",
    header: () => <span className={`${HEAD} block text-right`}>Posts</span>,
    // The other half of the pair: this count comes from the external pipeline,
    // and its ⓘ is the only place on this screen that says attribution is by
    // name-match — a limitation an under-counted client cannot be told from a
    // quiet one without.
    meta: {
      className: "w-[12%] text-right",
      infoMetric: CLIENT_LIST_METRIC_KEYS.Posts,
    } satisfies ClientColumnMeta,
    cell: ({ row }) => (
      <span className="font-mono text-sm text-muted-foreground tabular-nums">
        {row.original.postsCount === null ? (
          <Unavailable what="Post count" />
        ) : (
          row.original.postsCount
        )}
      </span>
    ),
  },
  {
    // The row affordance, in its OWN column. Inside the Posts cell it read as
    // part of the value ("0 ›"), and would have read as "— ›" once the count
    // could be unavailable.
    id: "chevron",
    header: () => <span className="sr-only">Open client</span>,
    enableSorting: false,
    meta: { className: "w-8 pl-0 text-right" },
    cell: () => <ChevronRight className="size-3.5 text-muted-foreground/60" aria-hidden />,
  },
];
