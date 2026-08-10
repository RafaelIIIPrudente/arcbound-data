"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ArcboundService, ServiceHandler } from "@/services/types";

import { OutreachUploadForm } from "./outreach-upload-form";
import { UploadForm } from "./upload-form";

/**
 * The upload shapes ArcBase accepts, filtered to the ones THIS Client's Arcbound
 * Services provide (ADR 0015).
 *
 * ⚠️ THE SHADCN `<Tabs>` PRIMITIVE, NOT THE LINK-TABS IN `client-tabs.tsx`.
 * That file documents the rule: link-tabs exist for separate SERVER routes that
 * each own a data fetch and search params. These are FORMS sharing one page's
 * reads — the settings case exactly — so client-side tab state is right and a
 * second route would buy nothing but an extra round trip. There is deliberately no
 * URL tab state: nothing here is worth linking to, and a `?tab=` param would be one
 * more thing to keep in sync.
 *
 * ⚠️ LINKEDIN IS FIRST AND IS THE DEFAULT WHEN PRESENT, AND RENDERS THE EXISTING
 * COMPONENT VERBATIM. The metrics upload is the weekly routine and the path that
 * already works; filtering the tab strip must not cost it a click.
 *
 * ⚠️ THE HANDLER → FORM MAP IS THE CODE HALF OF "VISIBILITY IS DATA, CAPABILITY IS
 * CODE". `FORMS` is a `Record<ServiceHandler, …>`, so it is EXHAUSTIVE by
 * construction: adding a handler to the union without writing its form is a TYPE
 * ERROR, not a tab that renders nothing. A row in `services` can never conjure an
 * ingestion path that no one implemented.
 */

interface FormSpec {
  label: string;
  render: (clientId: string) => React.ReactNode;
}

const FORMS: Record<ServiceHandler, FormSpec> = {
  linkedin_post_metrics: {
    label: "LinkedIn Metrics",
    render: (clientId) => <UploadForm clientId={clientId} />,
  },
  outreach_prospects: {
    label: "Outreach System",
    render: (clientId) => <OutreachUploadForm clientId={clientId} />,
  },
};

/**
 * Tab order, fixed in code rather than taken from `sort_order`.
 *
 * ⚠️ LINKEDIN FIRST IS A PRODUCT DECISION, NOT A DATA ONE. Reordering the registry
 * in Settings must not be able to demote the weekly routine to the second tab.
 */
const HANDLER_ORDER: ServiceHandler[] = ["linkedin_post_metrics", "outreach_prospects"];

/**
 * Every pipeline ArcBase implements, as synthetic Services.
 *
 * ⚠️ THE FALLBACK FOR AN UNREADABLE REGISTRY — CODE BACKSTOPS THE TABLE (ADR 0015).
 * When `client_services` cannot be read, ArcBase does not know which Services a
 * Client holds. Rendering nothing would take the weekly ingestion routine offline
 * over a database read; rendering everything lets staff keep working and costs, at
 * worst, a tab that turns out not to apply.
 *
 * Derived from `HANDLER_ORDER` + `FORMS` rather than hand-listed, so it cannot
 * drift from the set of pipelines that actually exist.
 */
export const ALL_PIPELINE_SERVICES: ArcboundService[] = HANDLER_ORDER.map((handler) => ({
  id: `fallback:${handler}`,
  slug: handler,
  name: FORMS[handler].label,
  description: null,
  handler,
  status: "active",
  sortOrder: 0,
}));

export function UploadTabs({
  clientId,
  services,
}: {
  clientId: string;
  /** The Services THIS Client holds — active and, where still assigned, archived. */
  services: ArcboundService[];
}) {
  // ⚠️ A NULL HANDLER PRODUCES NO TAB, AND THAT IS CORRECT, NOT A GAP. It is a
  // listed offering with no ingestion pipeline (ADR 0015) — genuinely sold, simply
  // nothing to upload.
  const ingestible = HANDLER_ORDER.flatMap((handler) =>
    services.filter((service) => service.handler === handler),
  );

  if (ingestible.length === 0) {
    // ⚠️ WORDS, NOT AN EMPTY TAB STRIP. This Client HAS services — they just do not
    // ingest — which is a different fact from having none, and an empty strip would
    // be indistinguishable from a bug.
    const names = services.map((service) => service.name).join(", ");
    return (
      <section className="rounded-lg border bg-card p-5">
        <p className="text-sm font-medium">No upload types for this client.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {names
            ? `Their services (${names}) have no data pipeline, so there is nothing to upload here.`
            : "None of their services have a data pipeline, so there is nothing to upload here."}
        </p>
      </section>
    );
  }

  const first = ingestible[0]!;

  return (
    <Tabs defaultValue={first.id}>
      <TabsList>
        {ingestible.map((service) => (
          <TabsTrigger key={service.id} value={service.id}>
            {FORMS[service.handler!].label}
            {service.status === "archived" ? (
              <span className="ml-2 rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em] uppercase">
                Archived
              </span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>

      {ingestible.map((service) => (
        <TabsContent key={service.id} value={service.id} className="pt-5">
          {/* ⚠️ AN ARCHIVED SERVICE THE CLIENT STILL HOLDS KEEPS ITS TAB (D11).
              S2's archive retires an offering from the REGISTRY without touching
              the Clients already engaged on it, so the upload path stays live
              until someone un-assigns it. Saying so here is what stops the
              retirement being invisible to the person uploading. */}
          {service.status === "archived" ? (
            <p className="mb-4 rounded-md border bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
              <strong>{service.name}</strong> is archived but still assigned to this client, so
              uploads for the existing engagement still work. Un-assign it on the client&apos;s
              overview to end that.
            </p>
          ) : null}
          {FORMS[service.handler!].render(clientId)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
