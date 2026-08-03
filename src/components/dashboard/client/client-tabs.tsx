import { canSee } from "@/lib/service-access";
import { paths } from "@/paths";
import { getClientServices } from "@/services/arcbound-services";
import type { ArcboundService, ServiceHandler } from "@/services/types";

import { ClientTabsView, type TabSpec } from "./client-tabs-view";

// Re-exported so every existing consumer of this module keeps one import path.
export { ClientTabsView };
export type { TabSpec };

// ─────────────────────────────────────────────────────────────────────────────
// Client sub-navigation: Overview ⇄ Posts ⇄ LinkedIn Report ⇄ Outreach.
//
// ⚠️ THE TAB LIST IS NOW A FUNCTION OF WHAT THE CLIENT HOLDS (ADR 0015). Before
// this slice all four tabs rendered unconditionally, so a Client Arcbound never
// ran Outreach for still got an Outreach tab — which loaded an EMPTY FUNNEL,
// reading as "we ran this and found nothing" rather than "we do not do this for
// them". The current live bug this slice closes.
//
// ⚠️ ASYNC SERVER PIECE HERE, "use client" PIECE IN `client-tabs-view.tsx`.
// `usePathname` needs `"use client"`; this component needs `async` to read
// `getClientServices`. Next.js does not support async Client Components, and the
// directive is file-scoped, so the two cannot share a module.
// ─────────────────────────────────────────────────────────────────────────────

/** Overview is unconditional; every other tab gates on the handler that unlocks it. */
function tabsFor(clientId: string, held: ArcboundService[] | null): TabSpec[] {
  const tabs: TabSpec[] = [{ href: paths.clients.details(clientId), label: "Overview" }];

  const section = (handler: ServiceHandler, tab: TabSpec) => {
    if (canSee(held, handler)) tabs.push(tab);
  };

  section("linkedin_post_metrics", { href: paths.clients.posts(clientId), label: "Posts" });
  section("linkedin_post_metrics", {
    href: paths.clients.report(clientId),
    label: "LinkedIn Report",
  });
  section("outreach_prospects", { href: paths.clients.outreach(clientId), label: "Outreach" });

  return tabs;
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
  // that straight to `canSee`, which fails OPEN — every tab shows — rather than
  // closed, so a database read failure cannot silently strip a working screen.
  const tabs = tabsFor(clientId, access?.held ?? null);

  return <ClientTabsView tabs={tabs} />;
}
