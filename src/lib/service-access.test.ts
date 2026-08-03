import { describe, expect, it } from "vitest";

import type { ArcboundService, ServiceHandler } from "@/services/types";

import { canSee, servicesForHandler, visibleTabHandlers } from "./service-access";

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
 * ⚠️ SAME HANDLER, DIFFERENT SLUG. `slug` is admin-editable text; `handler` is a
 * database-enforced enum. A Client's access must survive a rename in Settings, so
 * every test below that checks "does this Service grant access" uses a Service
 * whose slug does NOT match its own product name — if any implementation matched
 * on slug instead of handler, this fixture is what would catch it.
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
    // ⚠️ `slug` IS ADMIN-EDITABLE TEXT (S2); `handler` IS A DATABASE ENUM SET ONLY
    // AT CREATION. A rename in Settings → Services must not be able to silently
    // strip a Client of a tab they are genuinely still assigned to — which is
    // exactly what matching on `slug === "outreach-system"` would do the moment
    // someone renamed the row. RENAMED_OUTREACH's slug does not even resemble its
    // product; only its handler says what it is.
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

describe("visibleTabHandlers — the ordered set of sections to show", () => {
  const ALL: ServiceHandler[] = ["linkedin_post_metrics", "outreach_prospects"];

  it("⚠️ every handler when unreadable — code backstops the table (ADR 0015)", () => {
    expect(visibleTabHandlers(null)).toEqual(ALL);
  });

  it("only the handlers this Client actually holds, LinkedIn first", () => {
    expect(visibleTabHandlers([OUTREACH, LINKEDIN])).toEqual([
      "linkedin_post_metrics",
      "outreach_prospects",
    ]);
  });

  it("no duplicate handler even if held twice (should not happen, but never trust it silently)", () => {
    expect(visibleTabHandlers([LINKEDIN, { ...LINKEDIN, id: "s-dup" }])).toEqual([
      "linkedin_post_metrics",
    ]);
  });

  it("empty when the Client holds nothing", () => {
    expect(visibleTabHandlers([])).toEqual([]);
  });

  it("ignores NULL-handler Services — they unlock no section", () => {
    expect(visibleTabHandlers([ADVISORY])).toEqual([]);
  });
});
