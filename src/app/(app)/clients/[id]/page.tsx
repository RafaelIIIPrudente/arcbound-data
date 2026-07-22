import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ClientTabs } from "@/components/dashboard/client/client-tabs";
import { UploadHistory } from "@/components/dashboard/client/upload-history";
import { displayLinkedInUrl } from "@/lib/linkedin-url";
import { paths } from "@/paths";
import { getClient } from "@/services/clients";
import { listUploads } from "@/services/uploads";

export const metadata: Metadata = { title: "Client detail" };

/**
 * `value === null` means the figure could NOT BE READ, and renders as an em dash
 * with a spoken explanation — never as a 0, which would assert a fact we do not
 * have (see `Client.postsCount`).
 */
function KpiCard({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="min-w-30 flex-1 rounded-lg border bg-card p-5">
      <div className="font-display text-3xl leading-none font-extrabold tracking-tight tabular-nums">
        {value === null ? (
          <>
            <span aria-hidden>—</span>
            <span className="sr-only">{label} could not be read</span>
          </>
        ) : (
          value
        )}
      </div>
      <div className="mt-2 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </div>
    </div>
  );
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [client, uploads] = await Promise.all([getClient(id), listUploads(id)]);
  if (!client) notFound();

  // `uploads === null` means the read FAILED — not that there are none. The
  // count renders as `—` rather than a `0` nobody could distinguish from a
  // brand-new client (same rule as `postsCount`).
  const uploadsUnavailable = uploads === null;

  // Followers = the follower count captured with the most recent upload. Already
  // `—` when there is no count to show, which now also covers a failed read.
  const latest = uploads?.[0];
  const followers =
    latest && latest.followerCount != null ? latest.followerCount.toLocaleString() : "—";

  return (
    <div className="space-y-8">
      <Link
        href={paths.clients.list}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-widest text-muted-foreground uppercase transition-colors hover:text-foreground"
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
          <KpiCard label="Uploads" value={uploadsUnavailable ? null : uploads.length} />
          <KpiCard label="Posts" value={client.postsCount} />
          <KpiCard label="Followers" value={followers} />
        </div>
      </div>

      <ClientTabs clientId={client.id} />

      <UploadHistory uploads={uploads} />
    </div>
  );
}
