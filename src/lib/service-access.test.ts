import { describe, expect, it } from "vitest";

import type { ArcboundService } from "@/services/types";

import { canSee, servicesForHandler, visibleTabServices } from "./service-access";

const LINKEDIN: ArcboundService = {
  id: "s-linkedin",
  slug: "linkedin-growth",
  name: "LinkedIn Growth",
  description: null,
  handler: "linkedin_post_metrics",
  status: "active",
  sortOrder: 10,
};
const OUTREACH: ArcboundService = {
  id: "s-outreach",
  slug: "outreach-system",
  name: "Outreach System",
  description: null,
  handler: "outreach_prospects",
  status: "active",
  sortOrder: 20,
};
/**
 * ⚠️ SAME HANDLER, DIFFERENT SLUG. `slug` is set once, at creation, and cannot be
 * changed afterwards (`update_service` has no slug parameter) — so this is not
 * guarding against a rename. It is guarding against matching the wrong THING:
 * `handler` is the enum the code actually branches a pipeline on; `slug` is a
 * display key. Every test below that checks "does this Service grant access"
 * uses a Service whose slug does NOT resemble its own product, so an
 * implementation that matched on slug instead of handler would fail here even
 * though no rename ever touched it.
 */
const RENAMED_OUTREACH: ArcboundService = {
  ...OUTREACH,
  id: "s-renamed",
  slug: "totally-different-name",
  name: "Totally Different Name",
};
/** A listed offering with no pipeline — a real state, not a gap. */
const ADVISORY: ArcboundService = {
  id: "s-advisory",
  slug: "advisory",
  name: "Advisory",
  description: null,
  handler: null,
  status: "active",
  sortOrder: 30,
};
const ARCHIVED_LINKEDIN: ArcboundService = { ...LINKEDIN, id: "s-archived", status: "archived" };

describe("canSee — the four-state read, made a two-argument function", () => {
  it("⚠️ a NULL held set answers true to EVERYTHING (D14) — unknown is not denial", () => {
    // ⚠️ THE MOST IMPORTANT CASE IN THIS FILE. `held === null` means "the registry
    // could not be read" — ArcBase does not know what this Client is assigned. That
    // is a statement about a database read, not about the Client's entitlement, and
    // it must never be treated as "assigned to nothing". Getting this backwards
    // would turn every read failure into every Client losing every tab at once —
    // the worst possible expression of the outage this whole slice exists to avoid.
    expect(canSee(null, "linkedin_post_metrics")).toBe(true);
    expect(canSee(null, "outreach_prospects")).toBe(true);
  });

  it("true when a held Service has the matching handler", () => {
    expect(canSee([LINKEDIN], "linkedin_post_metrics")).toBe(true);
  });

  it("false when nothing held has that handler", () => {
    expect(canSee([LINKEDIN], "outreach_prospects")).toBe(false);
  });

  it("false for an empty held set", () => {
    expect(canSee([], "linkedin_post_metrics")).toBe(false);
  });

  it("⚠️ GATES ON handler, NEVER ON slug", () => {
    // ⚠️ `slug` IS SET ONCE, AT CREATION, AND CANNOT BE CHANGED AFTERWARDS
    // (`update_service` has no slug parameter) — so this is not a rename hazard.
    // `handler` is the enum the code actually branches a pipeline on; `slug` is a
    // display key, and matching on one instead — even an immutable one — ties a
    // behavioural decision to a value whose job is to be read by a human.
    // RENAMED_OUTREACH's slug does not even resemble its product; only its
    // handler says what it is.
    expect(canSee([RENAMED_OUTREACH], "outreach_prospects")).toBe(true);
  });

  it("a NULL-handler Service grants access to nothing — it has no pipeline to match", () => {
    expect(canSee([ADVISORY], "linkedin_post_metrics")).toBe(false);
    expect(canSee([ADVISORY], "outreach_prospects")).toBe(false);
  });

  it("⚠️ an ARCHIVED Service the Client still holds still grants access (D11)", () => {
    // ⚠️ THE ENGAGEMENT IS LIVE UNTIL SOMEBODY UN-ASSIGNS IT. S2's archive retires
    // an offering from the REGISTRY without touching Clients already engaged on
    // it — so a Client who holds an archived Service must keep the section it
    // unlocks, exactly as S4 keeps their upload tab.
    expect(canSee([ARCHIVED_LINKEDIN], "linkedin_post_metrics")).toBe(true);
  });
});

describe("servicesForHandler — which held Service(s) unlock a section", () => {
  it("returns the held Services matching the handler, for display", () => {
    expect(servicesForHandler([LINKEDIN, ADVISORY], "linkedin_post_metrics")).toEqual([LINKEDIN]);
  });

  it("⚠️ null propagates as null, not as an empty array", () => {
    // Same reasoning as `canSee`: a caller distinguishing "not read" from
    // "read, and empty" needs this function to preserve that, not flatten it.
    expect(servicesForHandler(null, "linkedin_post_metrics")).toBeNull();
  });

  it("returns an empty array (not null) when the read succeeded and found none", () => {
    expect(servicesForHandler([ADVISORY], "linkedin_post_metrics")).toEqual([]);
  });
});

describe("visibleTabServices — the ordered SERVICES to show as tabs (D17)", () => {
  it("only the Services this Client actually holds, LinkedIn first regardless of held order", () => {
    expect(visibleTabServices([OUTREACH, LINKEDIN])).toEqual([LINKEDIN, OUTREACH]);
  });

  it("⚠️ returns the REAL Service objects, so a rename changes the tab label (D17)", () => {
    // The label a caller shows is `service.name` — this function must not
    // relabel or otherwise lose the registry's own name.
    const RENAMED: ArcboundService = { ...LINKEDIN, name: "Totally Renamed LinkedIn Offering" };
    expect(visibleTabServices([RENAMED])[0]?.name).toBe("Totally Renamed LinkedIn Offering");
  });

  it("empty when the Client holds nothing", () => {
    expect(visibleTabServices([])).toEqual([]);
  });

  it("⚠️ ignores NULL-handler Services — they unlock no section (D2/D6)", () => {
    // A NULL-handler Service is a real, listed offering with nowhere to go; it
    // stays on the Overview's Services card, never in the tab row.
    expect(visibleTabServices([ADVISORY])).toEqual([]);
  });

  it("⚠️ at most one Service per handler reaches the row, even if held carries two", () => {
    // ⚠️ SAFE ONLY BECAUSE OF `services_one_per_handler` — a partial unique index
    // in `supabase/arcbound-services.sql` (`on public.services (handler) where
    // handler is not null`) — so this should never happen for real. This function
    // does not trust that silently: it keeps whichever row it saw first.
    const DUPLICATE_LINKEDIN: ArcboundService = { ...LINKEDIN, id: "s-dup", name: "Duplicate" };
    expect(visibleTabServices([LINKEDIN, DUPLICATE_LINKEDIN])).toEqual([LINKEDIN]);
  });

  it("⚠️ every pipeline, CODE-LABELLED, when the registry could not be read (D14)", () => {
    // ⚠️ `null` STILL MEANS EVERY TAB, AND NOW IT ALSO MEANS THERE ARE NO NAMES.
    // Not a second labelling policy — the same "code backstops the table" policy
    // degrading gracefully when there is no registry row to read a name from.
    // `ServicesUnreadableNotice` (rendered on every gated page) is what discloses
    // this on screen; a fallback label does not need to say so again.
    const fallback = visibleTabServices(null);
    expect(fallback.map((s) => s.handler)).toEqual(["linkedin_post_metrics", "outreach_prospects"]);
    expect(fallback.every((s) => typeof s.name === "string" && s.name.length > 0)).toBe(true);
  });

  it("⚠️ ORDER COMES FROM HANDLER_ORDER, NEVER FROM sortOrder", () => {
    // A re-sort in Settings must not be able to reorder a Client's navigation.
    const REORDERED_OUTREACH: ArcboundService = { ...OUTREACH, sortOrder: 1 };
    const REORDERED_LINKEDIN: ArcboundService = { ...LINKEDIN, sortOrder: 99 };
    expect(
      visibleTabServices([REORDERED_OUTREACH, REORDERED_LINKEDIN]).map((s) => s.handler),
    ).toEqual(["linkedin_post_metrics", "outreach_prospects"]);
  });
});
