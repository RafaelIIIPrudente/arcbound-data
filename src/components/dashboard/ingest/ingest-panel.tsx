"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { ArcboundService, ClientServiceAssignment } from "@/services/types";

import { ClientServicesPrompt } from "./client-services-prompt";
import { ALL_PIPELINE_SERVICES, UploadTabs } from "./upload-tabs";

// ─────────────────────────────────────────────────────────────────────────────
// /upload, Client-first (ADR 0015).
//
// Step 01 is the Client, once, above the tabs — so the choice survives a tab
// switch and a form reset, and so the tabs BELOW it can be exactly what that
// Client's Arcbound Services provide.
//
// ⚠️ FOUR BRANCHES, AND EACH IS A DIFFERENT FACT. NEVER LET TWO COLLAPSE:
//   1. No Client picked   — nothing is wrong; nothing has been chosen. An
//                           invitation, not an error.
//   2. Registry UNREADABLE — ArcBase does not KNOW what this Client holds. Shows
//                           every pipeline, and says why.
//   3. Client holds NONE   — ArcBase knows, and the answer is none. A real,
//                           correct state with a real consequence.
//   4. Client holds some   — tabs for the ones with a pipeline.
// Branches 2 and 3 are the pair most easily confused, and confusing them is the
// worst outcome on this screen: "we could not read it" rendered as "you have
// none" would send someone to assign Services that are already assigned.
// ─────────────────────────────────────────────────────────────────────────────

type ClientOption = { id: string; name: string };

/**
 * The registry and every Client's assignments, or `null` when they could not be
 * read.
 *
 * ⚠️ `null`, NEVER `[]`. An empty array is a claim — "this Client has no Services"
 * — and after this slice that claim means "cannot upload". A failed read has no
 * business making it.
 */
export type IngestRegistry = {
  services: ArcboundService[];
  assignments: ClientServiceAssignment[];
} | null;

interface PanelViewProps {
  clients: ClientOption[];
  registry: IngestRegistry;
  isAdmin: boolean;
  clientId: string;
  onClientChange: (clientId: string) => void;
}

export function IngestPanelView({
  clients,
  registry,
  isAdmin,
  clientId,
  onClientChange,
}: PanelViewProps) {
  const selected = clients.find((client) => client.id === clientId);

  return (
    <div className="max-w-3xl space-y-5">
      <Step n="01" title="Select client" description="Uploads attach to one client.">
        <Select value={clientId} onValueChange={onClientChange}>
          <SelectTrigger className="max-w-sm" aria-label="Select client">
            <SelectValue placeholder="Choose a client…" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Step>

      <Separator />

      <Body
        clientId={clientId}
        clientName={selected?.name ?? "this client"}
        registry={registry}
        isAdmin={isAdmin}
      />
    </div>
  );
}

function Body({
  clientId,
  clientName,
  registry,
  isAdmin,
}: {
  clientId: string;
  clientName: string;
  registry: IngestRegistry;
  isAdmin: boolean;
}) {
  // ── 1. Nothing chosen yet. Not an error — there is simply no question to answer
  //       until someone picks a Client.
  if (clientId === "") {
    return (
      <p className="text-sm text-muted-foreground">
        Select a client to see the upload types available for them.
      </p>
    );
  }

  // ── 2. The registry could not be read. ArcBase does NOT know what this Client
  //       holds, so it must not act as though the answer were "nothing".
  if (registry === null) {
    return (
      <div className="space-y-4">
        {/* ⚠️ SHOWING EVERY TAB IS THE DELIBERATE CHOICE HERE. Rendering nothing
            would take the weekly ingestion routine offline because a table could
            not be read — a self-inflicted outage worse than the fault causing it.
            Code backstops the table (ADR 0015). The notice is what stops the wide
            tab strip being mistaken for a statement about this Client. */}
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
        >
          This client&apos;s services could not be read, so all upload types are shown. Some may not
          apply to them.
        </p>
        <UploadTabs clientId={clientId} services={ALL_PIPELINE_SERVICES} />
      </div>
    );
  }

  // ⚠️ FILTER BY THE SELECTED CLIENT. `assignments` holds EVERY Client's rows —
  // one read serves the whole page — so forgetting this would hand every Client
  // the union of everybody's tabs, which looks entirely normal and is entirely
  // wrong.
  const heldIds = new Set(
    registry.assignments.filter((row) => row.clientId === clientId).map((row) => row.serviceId),
  );
  // An assignment pointing at a Service no longer in the registry describes
  // nothing renderable, so it cannot become a tab.
  const held = registry.services.filter((service) => heldIds.has(service.id));

  // ── 3. ArcBase knows, and the answer is none.
  if (held.length === 0) {
    return (
      <ClientServicesPrompt
        clientId={clientId}
        clientName={clientName}
        services={registry.services}
        // ⚠️ THE REAL ROLE, NEVER AN ASSUMPTION. The prompt withholds the assign
        // form from a non-admin because the action behind it denies by REDIRECTING
        // — see its header. Passing `true` here would hand an analyst the eject
        // button.
        isAdmin={isAdmin}
      />
    );
  }

  // ── 4. Tabs for what they hold.
  return <UploadTabs clientId={clientId} services={held} />;
}

/** The connected panel: owns the Client selection for the whole screen. */
export function IngestPanel({
  clients,
  registry,
  isAdmin,
}: {
  clients: ClientOption[];
  registry: IngestRegistry;
  isAdmin: boolean;
}) {
  // ⚠️ THE CLIENT LIVES HERE, ABOVE THE FORMS, AND THAT IS WHAT MAKES A RESET KEEP
  // IT (D12). Each form remounts itself with `key={attempt}` on "Upload another";
  // when the Client lived inside a form it was discarded with everything else, so
  // uploading a second service for the same person meant re-picking them.
  const [clientId, setClientId] = React.useState("");

  return (
    <IngestPanelView
      clients={clients}
      registry={registry}
      isAdmin={isAdmin}
      clientId={clientId}
      onClientChange={setClientId}
    />
  );
}

function Step({
  n,
  title,
  description,
  children,
}: {
  n: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 pt-0.5 font-mono text-[13px] text-primary">{n}</div>
      <div className="flex-1">
        <div className="font-display text-base font-semibold">{title}</div>
        {description && (
          <div className="mt-1 mb-3 text-[12.5px] text-muted-foreground">{description}</div>
        )}
        {children}
      </div>
    </div>
  );
}
