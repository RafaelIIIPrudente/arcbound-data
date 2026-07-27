import type { Metadata } from "next";

import { UploadEmptyState } from "@/components/dashboard/ingest/upload-empty-state";
import { UploadTabs } from "@/components/dashboard/ingest/upload-tabs";
import { listClientRegistry } from "@/services/clients";

export const metadata: Metadata = { title: "Add data" };

export default async function UploadPage() {
  // BOTH forms need only id + name, so this reads the cheap `listClientRegistry` —
  // NOT `listClients`, which also joins post counts and latest-upload timestamps
  // this page never uses.
  //
  // ⚠️ A FAILED READ IS NOT AN EMPTY ROSTER. `listClientRegistry` returns `null`
  // on failure where `listClients` threw; mapping that `null` to `[]` would render
  // "no clients registered — add one first", asserting a fact it does not have and
  // blocking ingestion for a transient read error. So a failed read throws, which
  // preserves the prior behaviour (the error boundary), while an EMPTY array stays
  // the genuine "nobody registered yet" empty state below.
  const registry = await listClientRegistry();
  if (registry === null) throw new Error("Failed to load clients for ingestion");
  const clients = registry;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        <span className="text-primary">—</span>
        Ingestion
      </div>
      {/* ⚠️ ONE EMPTY STATE FOR BOTH TABS, ON PURPOSE. Every upload shape attaches
          to a Client, so with none registered neither tab can do anything — and
          two tabs each showing the same "add a client first" panel would present
          a choice that is not a choice. */}
      {clients.length === 0 ? <UploadEmptyState /> : <UploadTabs clients={clients} />}
    </div>
  );
}
