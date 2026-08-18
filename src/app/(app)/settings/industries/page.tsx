import type { Metadata } from "next";

import {
  IndustriesTable,
  type IndustriesRegistry,
} from "@/components/dashboard/settings/industries-table";
import { requireAdmin } from "@/lib/auth/roles";
import { listIndustriesAdmin } from "@/services/industries";

export const metadata: Metadata = { title: "Industries" };

/**
 * The industries registry — the controlled list a Client's Industry is chosen
 * from (D2 in the Industry/Writer decision record).
 *
 * ⚠️ ITS OWN ROUTE RATHER THAN A TAB ON `/settings`, for the same reason
 * `/settings/roles` and `/settings/services` are: this page calls
 * `requireAdmin()`, and folding it into the profile page would force that guard
 * onto `/settings` too, locking every analyst out of their own profile and
 * password form to hide one panel from them.
 *
 * ⚠️ THE GUARD RUNS BEFORE THE READ, AND OUTSIDE THE try. `requireAdmin()`
 * denies by calling `redirect()`, which denies by THROWING — inside the try
 * below it would be caught and turned into an "unavailable" registry, silently
 * showing a denied analyst a page instead of redirecting them. The read itself
 * has no guard of its own to fall back on: RLS lets any authenticated user
 * SELECT from `industries`, so this line is the only thing keeping an analyst
 * off the admin screen.
 */
export default async function IndustriesPage() {
  await requireAdmin();

  // ⚠️ A FAILED READ IS ITS OWN STATE, NOT AN EMPTY ONE. `listIndustriesAdmin`
  // throws rather than returning `[]`, which is right — but a throw here would
  // reach the error boundary and blank the screen, losing exactly the
  // distinction this screen needs to draw. Catching it turns "we do not know"
  // into something the page can say out loud.
  let registry: IndustriesRegistry;
  try {
    registry = { status: "ok", industries: await listIndustriesAdmin() };
  } catch {
    registry = { status: "unavailable" };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Industries</h1>
        <p className="text-sm text-muted-foreground">
          The list a client&apos;s industry is chosen from. Archiving retires one without touching
          the clients already recorded in it; deleting is refused while any client still is.
        </p>
      </div>
      <IndustriesTable registry={registry} />
    </div>
  );
}
