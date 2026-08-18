import type { Metadata } from "next";

import { WritersTable, type WritersRegistry } from "@/components/dashboard/settings/writers-table";
import { requireAdmin } from "@/lib/auth/roles";
import { listWritersAdmin } from "@/services/writers";

export const metadata: Metadata = { title: "Writers" };

/**
 * The writers registry — the controlled list a Client's Writer is chosen
 * from (D15 in the Industry/Writer decision record).
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
 * SELECT from `writers`, so this line is the only thing keeping an analyst
 * off the admin screen.
 */
export default async function WritersPage() {
  await requireAdmin();

  // ⚠️ A FAILED READ IS ITS OWN STATE, NOT AN EMPTY ONE. `listWritersAdmin`
  // throws rather than returning `[]`, which is right — but a throw here would
  // reach the error boundary and blank the screen, losing exactly the
  // distinction this screen needs to draw. Catching it turns "we do not know"
  // into something the page can say out loud.
  let registry: WritersRegistry;
  try {
    registry = { status: "ok", writers: await listWritersAdmin() };
  } catch {
    registry = { status: "unavailable" };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Writers</h1>
        <p className="text-sm text-muted-foreground">
          The list a client&apos;s writer is chosen from. Archiving retires one without touching the
          clients already recorded against them; deleting is refused while any client still is.
        </p>
      </div>
      <WritersTable registry={registry} />
    </div>
  );
}
