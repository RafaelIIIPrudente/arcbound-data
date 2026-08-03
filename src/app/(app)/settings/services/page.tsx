import type { Metadata } from "next";

import {
  ServicesTable,
  type ServicesRegistry,
} from "@/components/dashboard/settings/services-table";
import { requireAdmin } from "@/lib/auth/roles";
import { listServicesAdmin } from "@/services/arcbound-services";

export const metadata: Metadata = { title: "Services" };

/**
 * The Arcbound Services registry (ADR 0015) — what Arcbound sells.
 *
 * ⚠️ ITS OWN ROUTE RATHER THAN A TAB ON `/settings`, for the same reason
 * `/settings/roles` is: this page calls `requireAdmin()`, and folding it into the
 * profile page would force that guard onto `/settings` too, locking every analyst
 * out of their own profile and password form.
 *
 * ⚠️ THE GUARD RUNS BEFORE THE READ, AND OUTSIDE THE try. `requireAdmin()` denies
 * by calling `redirect()`, which denies by THROWING — inside the try below it
 * would be caught and turned into an "unavailable" registry, silently showing a
 * denied analyst a page instead of redirecting them.
 */
export default async function ServicesPage() {
  await requireAdmin();

  // ⚠️ A FAILED READ IS ITS OWN STATE, NOT AN EMPTY ONE. `listServicesAdmin`
  // throws rather than returning `[]`, which is right — but a throw here would
  // reach the error boundary and blank the screen, losing exactly the distinction
  // this screen needs to draw. Catching it turns "we do not know" into something
  // the page can say out loud.
  let registry: ServicesRegistry;
  try {
    registry = { status: "ok", services: await listServicesAdmin() };
  } catch {
    registry = { status: "unavailable" };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
        <p className="text-sm text-muted-foreground">
          What Arcbound sells. A service with a data pipeline can receive uploads; one without is
          still a real offering, it just has no data behind it.
        </p>
      </div>
      <ServicesTable registry={registry} />
    </div>
  );
}
