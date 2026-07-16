import type { Metadata } from "next";

import { UploadForm } from "@/components/dashboard/ingest/upload-form";
import { listClients } from "@/services/clients";

export const metadata: Metadata = { title: "Add LI post metrics" };

export default async function UploadPage() {
  const { items } = await listClients({ pageSize: 1000 });
  const clients = items.map((client) => ({ id: client.id, name: client.name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        <span className="text-primary">—</span>
        Ingestion
      </div>
      <UploadForm clients={clients} />
    </div>
  );
}
