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
 * ⚠️ GATES ON `handler`, NEVER ON `slug` — though not for the reason an earlier
 * version of this comment gave. There is no live rename hazard to guard against:
 * `slug` is set once, at creation (`create_service`); `update_service` takes
 * `(id, name, description, sort_order)` and has no way to touch it. The real
 * reason stands on its own: `handler` is the enum this code actually branches a
 * pipeline on (`HANDLER_ORDER` below, `FORMS` in `upload-tabs.tsx`, the
 * `services_handler_known` CHECK in `supabase/arcbound-services.sql`). `slug` is
 * a display key — matching on one, even an immutable one, ties a behavioural
 * decision to a value whose job is to be read by a human, not compared by code.
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
 * The fixed display order for every handler-driven list in this module —
 * `visibleTabServices` below, mirrored by `HANDLER_ORDER` in `upload-tabs.tsx`.
 *
 * LinkedIn first is a PRODUCT decision, not a data one: taken from `sortOrder`
 * on the Service rows instead, a registry re-sort in Settings could demote the
 * weekly routine to second place.
 */
const HANDLER_ORDER: ServiceHandler[] = ["linkedin_post_metrics", "outreach_prospects"];

/**
 * Code-side label for each pipeline, used ONLY as the fallback name in
 * `visibleTabServices` when the registry could not be read — there is no real
 * Service row to read a name from.
 *
 * ⚠️ A DELIBERATE NEAR-DUPLICATE OF `ALL_PIPELINE_SERVICES` IN `upload-tabs.tsx`.
 * That module solves the identical problem for the upload picker's fallback, but
 * it is a `"use client"` ingest component — importing from it here would drag
 * the whole upload form tree into the Client tab row (a Server Component). This
 * is the same idea, kept small and pure, not a refactor of that file.
 */
const HANDLER_LABELS: Record<ServiceHandler, string> = {
  linkedin_post_metrics: "LinkedIn Metrics",
  outreach_prospects: "Outreach System",
};

/**
 * Every pipeline ArcBase implements, as synthetic Services — the fallback tab
 * list `visibleTabServices` returns for an unreadable registry.
 */
const FALLBACK_TAB_SERVICES: ArcboundService[] = HANDLER_ORDER.map((handler) => ({
  id: `fallback:${handler}`,
  slug: handler,
  name: HANDLER_LABELS[handler],
  description: null,
  handler,
  status: "active",
  sortOrder: 0,
}));

/**
 * The Services to show as top-level Client tabs, in `HANDLER_ORDER` — NEVER in
 * `sortOrder`, so a re-sort in Settings → Services cannot reorder a Client's
 * navigation.
 *
 * ⚠️ `null` STILL MEANS EVERY TAB (D14), AND NOW IT ALSO MEANS THERE ARE NO
 * NAMES. This returns the code-side `FALLBACK_TAB_SERVICES` above rather than an
 * empty list — the same "code backstops the table" policy `canSee(null, …)`
 * already encodes, degrading gracefully when there is no registry row to read a
 * name from. This is not a second labelling policy; `ServicesUnreadableNotice`
 * (rendered on every gated page) is what discloses the read failure on screen.
 *
 * A NULL-handler Service is never included — it is a real, listed offering with
 * nowhere to go (D2/D6); it stays on the Overview's Services card.
 *
 * ⚠️ AT MOST ONE SERVICE PER HANDLER REACHES THE ROW, EVEN IF `held` CARRIES
 * TWO. `services_one_per_handler` — a partial unique index in
 * `supabase/arcbound-services.sql` — means this should never happen for real;
 * this function does not trust that silently, and keeps whichever row it saw
 * first for a given handler.
 */
export function visibleTabServices(held: ArcboundService[] | null): ArcboundService[] {
  if (held === null) return FALLBACK_TAB_SERVICES;

  const byHandler = new Map<ServiceHandler, ArcboundService>();
  for (const service of held) {
    if (service.handler === null) continue;
    if (!byHandler.has(service.handler)) byHandler.set(service.handler, service);
  }

  return HANDLER_ORDER.filter((handler) => byHandler.has(handler)).map((handler) =>
    byHandler.get(handler)!,
  );
}
