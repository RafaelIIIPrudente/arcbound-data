"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";

import { displayLinkedInUrl } from "@/lib/linkedin-url";
import { paths } from "@/paths";
import type { Client } from "@/services/types";

function HeadLabel({ children, align }: { children: string; align?: "right" }) {
  return (
    <span
      className={
        "font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase" +
        (align === "right" ? " block text-right" : "")
      }
    >
      {children}
    </span>
  );
}

export const columns: ColumnDef<Client>[] = [
  {
    accessorKey: "name",
    header: () => <HeadLabel>Client</HeadLabel>,
    cell: ({ row }) => (
      // Stretched link: the whole row navigates to the client detail, while the
      // LinkedIn link below stays independently clickable (relative z-10).
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
    header: () => <HeadLabel>LinkedIn URL</HeadLabel>,
    cell: ({ row }) => (
      <a
        href={row.original.linkedin_url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative z-10 font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {displayLinkedInUrl(row.original.linkedin_url)}
      </a>
    ),
  },
  {
    accessorKey: "postsCount",
    header: () => <HeadLabel align="right">Posts</HeadLabel>,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-2.5 font-mono text-sm text-muted-foreground tabular-nums">
        {row.original.postsCount}
        <ChevronRight className="size-3.5 text-muted-foreground/60" aria-hidden />
      </div>
    ),
  },
];
