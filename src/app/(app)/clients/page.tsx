import type { Metadata } from "next";

import { AddClientDialog } from "@/components/dashboard/client/add-client-dialog";
import { ClientsTable } from "@/components/dashboard/client/clients-table";
import { listClients } from "@/services/clients";

export const metadata: Metadata = { title: "Client list" };

/**
 * Rows fetched per request. Sized well above any realistic ArcBase client roster
 * rather than paginated — the comp has no pager, and the table renders whatever
 * it is handed. If this ever caps, `truncated` below makes it visible.
 */
const PAGE_SIZE = 500;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { items, total } = await listClients({ q, pageSize: PAGE_SIZE });

  // The table shows every row it is given and has no pagination (neither does
  // the comp). If the fetch ever caps below the real total, the page SAYS SO —
  // a row that vanishes silently is the failure mode this codebase has been
  // bitten by before.
  const truncated = items.length < total;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            <span className="text-primary">—</span>
            Clients
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {total} {total === 1 ? "client" : "clients"} · records are immutable
          </p>
        </div>
        <AddClientDialog />
      </div>
      {truncated ? (
        <p
          role="status"
          className="rounded-md border border-primary/30 bg-primary/5 px-3.5 py-2.5 font-mono text-xs text-foreground"
        >
          Showing the first {items.length} of {total} clients. Narrow the filter to see the rest.
        </p>
      ) : null}
      <ClientsTable data={items} q={q ?? ""} />
    </div>
  );
}
