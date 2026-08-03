import type { Metadata } from "next";

import { IngestPanel, type IngestRegistry } from "@/components/dashboard/ingest/ingest-panel";
import { UploadEmptyState } from "@/components/dashboard/ingest/upload-empty-state";
import { getRole, isAdmin } from "@/lib/auth/roles";
import { listAllClientServices, listServices } from "@/services/arcbound-services";
import { listClientRegistry } from "@/services/clients";

export const metadata: Metadata = { title: "Add data" };

/**
 * The Services registry plus every Client's assignments — BOTH reads or NEITHER.
 *
 * ⚠️ IT DEGRADES TO `null`, NEVER TO `[]`, AND NEVER THROWS.
 *
 * `[]` is a CLAIM: "this Client has no Services", which after this slice renders
 * as "there is nothing you can upload here". A failed read has not earned that
 * claim, and acting on it would send staff off to assign Services that may already
 * be assigned, over what might be a transient error.
 *
 * Throwing would be worse. `supabase/arcbound-services.sql` IS NOT APPLIED, so
 * these reads throw against the live database on every request right now — a
 * propagating error would have taken the entire weekly ingestion routine offline
 * the moment this shipped. `null` sends the panel to its fallback, which shows
 * every pipeline and says why (ADR 0015: code backstops the table).
 */
async function loadRegistry(): Promise<IngestRegistry> {
  try {
    const [services, assignments] = await Promise.all([listServices(), listAllClientServices()]);
    return { services, assignments };
  } catch {
    return null;
  }
}

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

  // With nobody registered there is nothing to upload for, so the Services reads
  // are pure cost — and against a database without the registry applied, pure log
  // noise on a page that is already showing its empty state.
  const [services, role] =
    clients.length === 0 ? ([null, null] as const) : await Promise.all([loadRegistry(), getRole()]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        <span className="text-primary">—</span>
        Ingestion
      </div>
      {/* ⚠️ ONE EMPTY STATE FOR EVERY UPLOAD SHAPE, ON PURPOSE. Every upload
          attaches to a Client, so with none registered no tab can do anything —
          and a per-tab "add a client first" panel would present a choice that is
          not a choice. */}
      {clients.length === 0 ? (
        <UploadEmptyState />
      ) : (
        <IngestPanel clients={clients} registry={services} isAdmin={isAdmin(role)} />
      )}
    </div>
  );
}
