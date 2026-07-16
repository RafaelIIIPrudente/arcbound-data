import type { Metadata } from "next";

import { AddClientDialog } from "@/components/dashboard/client/add-client-dialog";
import { ClientsTable } from "@/components/dashboard/client/clients-table";
import { listClients } from "@/services/clients";

export const metadata: Metadata = { title: "Client list" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { items, total } = await listClients({ q, pageSize: 100 });

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
      <ClientsTable data={items} />
    </div>
  );
}
