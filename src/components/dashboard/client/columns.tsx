"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";

import { displayLinkedInUrl } from "@/lib/linkedin-url";
import { paths } from "@/paths";
import type { ClientListRow } from "@/services/types";

const HEAD = "font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase";

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
    header: () => <span className={HEAD}>Last upload</span>,
    meta: { className: "w-[18%]" },
    cell: ({ row }) => {
      const { lastUpload } = row.original;
      return (
        <span className="font-mono text-xs text-muted-foreground">
          {lastUpload === "unavailable" ? (
            <Unavailable what="Last upload" />
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
    meta: { className: "w-[12%] text-right" },
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
