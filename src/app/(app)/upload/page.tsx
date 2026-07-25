import type { Metadata } from "next";

import { UploadEmptyState } from "@/components/dashboard/ingest/upload-empty-state";
import { UploadForm } from "@/components/dashboard/ingest/upload-form";
import { listClientRegistry } from "@/services/clients";

export const metadata: Metadata = { title: "Add LI post metrics" };

export default async function UploadPage() {
  // The form needs only id + name, so it reads the cheap `listClientRegistry` —
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
      {clients.length === 0 ? <UploadEmptyState /> : <UploadForm clients={clients} />}
    </div>
  );
}
