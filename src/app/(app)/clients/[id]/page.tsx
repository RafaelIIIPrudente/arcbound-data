import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { displayLinkedInUrl } from "@/lib/linkedin-url";
import { paths } from "@/paths";
import { getClient } from "@/services/clients";

export const metadata: Metadata = { title: "Client detail" };

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-[120px] flex-1 rounded-lg border bg-card p-5">
      <div className="font-display text-3xl leading-none font-extrabold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-2 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </div>
    </div>
  );
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  return (
    <div className="space-y-8">
      <Link
        href={paths.clients.list}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Client list
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            <span className="text-primary">—</span>
            Client
          </div>
          <h2 className="mt-2.5 font-display text-3xl leading-none font-extrabold tracking-tight">
            {client.name}
          </h2>
          <a
            href={client.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {displayLinkedInUrl(client.linkedin_url)}
          </a>
        </div>
        <div className="flex flex-wrap gap-3.5">
          {/* Uploads/Followers stay empty until the ingestion slice lands. */}
          <KpiCard label="Uploads" value={0} />
          <KpiCard label="Posts" value={client.postsCount} />
          <KpiCard label="Followers" value="—" />
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            <span className="text-primary">—</span>
            Upload history
          </div>
        </div>
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">No uploads yet</p>
      </div>
    </div>
  );
}
