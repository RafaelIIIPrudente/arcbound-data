import type { Metadata } from "next";

import { AddResourceDialog } from "@/components/dashboard/resources/add-resource-dialog";
import { ResourcesList } from "@/components/dashboard/resources/resources-list";
import { listResources } from "@/services/resources";

export const metadata: Metadata = { title: "Resources" };

export default async function ResourcesPage() {
  const resources = await listResources();

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span className="text-primary">—</span>
          Team resources
        </div>
        <AddResourceDialog />
      </div>
      <ResourcesList resources={resources} />
      <p className="font-mono text-[10.5px] leading-relaxed text-muted-foreground">
        Resource model is provisional (OI-05) — a simple list + add for v1.
      </p>
    </div>
  );
}
