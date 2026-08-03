import type { ArcboundService, ServiceHandler } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// The pure mapping from a Client's held Arcbound Services to what they may see
// (ADR 0015). No React, no Supabase, no `paths` — every caller (the tab strip,
// each gated page, S4's upload tabs) reads the same two-argument answer instead
// of re-deriving the rule at its own call site.
//
// ⚠️ THE FOUR-STATE READ LIVES HERE, NOT AT FOUR CALL SITES. `held` is one of:
//   • `null`      — the registry could not be read. UNKNOWN, and unknown answers
//                   `true` to everything (see `canSee`).
//   • `[]`        — read succeeded; this Client is assigned nothing.
//   • `[...]`     — read succeeded; these are the Services they hold.
// Every function below preserves the `null` / non-`null` distinction rather than
// collapsing it — a caller that received `[]` where it should have received
// `null` would render "not assigned" for a Client whose real answer is unknown.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * May this Client see the section gated by `handler`?
 *
 * ⚠️ `held === null` ANSWERS `true` (D14). Unknown is not denial: a failed
 * registry read must never be read as "assigned to nothing", or every database
 * hiccup would strip every Client of every tab at once — a self-inflicted outage
 * far worse than the read failure causing it.
 *
 * ⚠️ GATES ON `handler`, NEVER ON `slug`. `slug` is admin-editable text (S2, and
 * only at creation — see `ArcboundService.handler`'s own doc); `handler` is the
 * database-enforced enum that cannot change after a Service is created. Matching
 * on slug would let a rename in Settings → Services silently disconnect a Client
 * from a section they are still genuinely assigned to.
 *
 * ⚠️ AN ARCHIVED-BUT-HELD SERVICE STILL COUNTS (D11). Archiving retires an
 * offering from the REGISTRY; it does not touch Clients already engaged on it.
 * `status` is deliberately not inspected here.
 */
export function canSee(held: ArcboundService[] | null, handler: ServiceHandler): boolean {
  if (held === null) return true;
  return held.some((service) => service.handler === handler);
}

/**
 * The held Service(s) matching `handler`, for a page that wants to name or count
 * them rather than just gate on them.
 *
 * `null` in, `null` out — a caller must not be able to lose the "could not be
 * read" state by routing through this function instead of `canSee`.
 */
export function servicesForHandler(
  held: ArcboundService[] | null,
  handler: ServiceHandler,
): ArcboundService[] | null {
  if (held === null) return null;
  return held.filter((service) => service.handler === handler);
}

/**
 * Every handler this Client should see a tab for, in a fixed display order.
 *
 * ⚠️ UNREADABLE MEANS EVERY HANDLER, NOT ZERO. `null` in means "code backstops
 * the table" (ADR 0015): the tab strip shows every section ArcBase implements
 * rather than none, because rendering nothing would take a working screen offline
 * over a database read. This is the same rule `canSee(null, …)` encodes, restated
 * for a caller that wants the whole ordered list instead of one yes/no.
 *
 * The order is fixed in code (LinkedIn first) rather than taken from any
 * `sortOrder` on the Service rows — a registry re-sort must not be able to demote
 * the weekly routine.
 */
const HANDLER_ORDER: ServiceHandler[] = ["linkedin_post_metrics", "outreach_prospects"];

export function visibleTabHandlers(held: ArcboundService[] | null): ServiceHandler[] {
  if (held === null) return HANDLER_ORDER;

  const present = new Set(
    held.map((service) => service.handler).filter((h): h is ServiceHandler => h !== null),
  );
  return HANDLER_ORDER.filter((handler) => present.has(handler));
}
