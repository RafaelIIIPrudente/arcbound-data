import { visibleTabServices } from "@/lib/service-access";
import { paths } from "@/paths";
import { getClientServices } from "@/services/arcbound-services";
import type { ArcboundService, ServiceHandler } from "@/services/types";

import { ClientTabsView, type TabSpec } from "./client-tabs-view";

// Re-exported so every existing consumer of this module keeps one import path.
export { ClientTabsView };
export type { TabSpec };

// ─────────────────────────────────────────────────────────────────────────────
// Client sub-navigation: Overview + one tab per Service the Client holds,
// LABELLED FROM THE REGISTRY (D17, ADR 0015). Posts is a sub-nav item inside
// the LinkedIn section now (`section-tabs.tsx`), not a top-level tab (D18).
//
// ⚠️ THE TAB LIST IS A FUNCTION OF WHAT THE CLIENT HOLDS. Before S5 all four
// tabs rendered unconditionally, so a Client Arcbound never ran Outreach for
// still got an Outreach tab — which loaded an EMPTY FUNNEL, reading as "we ran
// this and found nothing" rather than "we do not do this for them". S5 closed
// that; S6 (this slice) finishes it by naming each tab after the Service that
// unlocks it, rather than a fixed section label — so the row reads as "the
// services offered" instead of "the sections that happen to exist".
//
// ⚠️ ASYNC SERVER PIECE HERE, "use client" PIECE IN `client-tabs-view.tsx`.
// `usePathname` needs `"use client"`; this component needs `async` to read
// `getClientServices`. Next.js does not support async Client Components, and the
// directive is file-scoped, so the two cannot share a module.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The route each pipeline's tab links to, and every pathname that counts as
 * "on this tab" (D18). A `Record<ServiceHandler, …>` for the same reason
 * `FORMS` in `upload-tabs.tsx` is one: exhaustive by construction, so a new
 * handler with no route here is a TYPE ERROR, not a tab that silently goes
 * nowhere.
 *
 * ⚠️ LINKEDIN'S `activePaths` HOLDS TWO ROUTES. Posts is a sub-nav item inside
 * the LinkedIn section (D17/D18) — it keeps its own URL (`paths.clients.posts`,
 * unchanged), but the PARENT tab must stay lit while a visitor is on it, or
 * Posts would read as a dead end with no way back into the section it is
 * actually inside.
 */
type SectionRoute = Omit<TabSpec, "label">;

function sectionRoutes(clientId: string): Record<ServiceHandler, SectionRoute> {
  return {
    linkedin_post_metrics: {
      href: paths.clients.report(clientId),
      activePaths: [paths.clients.report(clientId), paths.clients.posts(clientId)],
    },
    outreach_prospects: {
      href: paths.clients.outreach(clientId),
      activePaths: [paths.clients.outreach(clientId)],
    },
  };
}

/**
 * Overview, plus one tab per Service the Client holds — labelled from the
 * Service's OWN `name`, in `HANDLER_ORDER` (never `sortOrder`).
 */
function tabsFor(clientId: string, held: ArcboundService[] | null): TabSpec[] {
  const routes = sectionRoutes(clientId);

  const overview: TabSpec = {
    href: paths.clients.details(clientId),
    label: "Overview",
    activePaths: [paths.clients.details(clientId)],
  };

  const serviceTabs = visibleTabServices(held).map((service) => ({
    ...routes[service.handler!],
    label: service.name,
  }));

  return [overview, ...serviceTabs];
}

/**
 * The connected piece: reads this Client's Services (via `getClientServices`,
 * memoised with React `cache()` — a call here and one on the same Overview page
 * for `ClientServicesCard` cost one round trip, not two) and computes the tab
 * list before handing it to the pathname-aware view.
 */
export async function ClientTabs({ clientId }: { clientId: string }) {
  const access = await getClientServices(clientId);
  // `access` is `null` when the registry could not be read. `tabsFor` passes
  // that straight to `visibleTabServices`, which returns the code-side
  // fallback list rather than an empty one (same fail-OPEN policy, D14) — a
  // database read failure cannot silently strip a working screen.
  const tabs = tabsFor(clientId, access?.held ?? null);

  return <ClientTabsView tabs={tabs} />;
}
