import { describe, expect, it } from "vitest";

import { paths } from "@/paths";

import { isNavItemActive, navItems, resolvePageTitle } from "./nav-config";

describe("navItems", () => {
  it("is exactly the five ArcBase nav items, in order", () => {
    expect(navItems.map((i) => i.title)).toEqual([
      "Dashboard",
      "Client List",
      // ⚠️ SERVICE-AGNOSTIC ON PURPOSE (ADR 0012). The screen now hosts two
      // upload shapes — LinkedIn post metrics and Outreach snapshots — so a
      // label naming either one would misdescribe half of what lives there.
      "Add Data",
      "Resources",
      "Data Quality",
    ]);
    expect(navItems.map((i) => i.href)).toEqual([
      paths.home,
      paths.clients.list,
      paths.upload,
      paths.resources,
      paths.dataQuality,
    ]);
  });
});

describe("isNavItemActive", () => {
  it("marks Dashboard active only on the exact home route", () => {
    expect(isNavItemActive(paths.home, "/")).toBe(true);
    expect(isNavItemActive(paths.home, "/clients")).toBe(false);
    expect(isNavItemActive(paths.home, "/upload")).toBe(false);
  });

  it("keeps Client List active on the list and on a client detail route", () => {
    expect(isNavItemActive(paths.clients.list, "/clients")).toBe(true);
    expect(isNavItemActive(paths.clients.list, "/clients/abc123")).toBe(true);
  });

  it("does not mark Client List active on the home route", () => {
    expect(isNavItemActive(paths.clients.list, "/")).toBe(false);
  });

  it("keeps Client List active on the client LinkedIn report route", () => {
    // The report is a nested client route — it must not orphan the nav.
    expect(isNavItemActive(paths.clients.list, paths.clients.report("abc123"))).toBe(true);
  });

  it("matches upload and resources on their own routes only", () => {
    expect(isNavItemActive(paths.upload, "/upload")).toBe(true);
    expect(isNavItemActive(paths.upload, "/uploads")).toBe(false);
    expect(isNavItemActive(paths.resources, "/resources")).toBe(true);
    expect(isNavItemActive(paths.resources, "/clients")).toBe(false);
  });
});

describe("resolvePageTitle", () => {
  it("matches the OUTREACH route before the generic client-detail rule", () => {
    // ⚠️ AN ORDERING TRAP, NOT A LOOKUP. `startsWith(paths.clients.list + "/")`
    // returns "Client detail" and swallows every nested client route, so a case
    // added AFTER it is dead code that silently never runs — exactly the trap the
    // /report case is already positioned around. This asserts the outcome, so it
    // fails if the branch is ever moved below the generic one.
    expect(resolvePageTitle(paths.clients.outreach("abc123"))).not.toEqual({
      lead: "Client",
      accent: "detail",
    });
  });

  it("matches the STAFF ROLES route before the generic settings rule", () => {
    // ⚠️ THE SAME ORDERING TRAP AS /outreach ABOVE, on a different prefix.
    // `startsWith(paths.settings.profile)` — i.e. "/settings" — also matches
    // "/settings/roles" and returns the generic Settings title, so a branch added
    // AFTER it is dead code that silently never runs. Asserting the OUTCOME (not
    // the source order) means this fails if the branch is ever moved below.
    expect(resolvePageTitle(paths.settings.roles)).not.toEqual({ lead: "", accent: "Settings" });
    expect(resolvePageTitle(paths.settings.roles)).toEqual({ lead: "Staff", accent: "roles" });
  });

  it("still returns the generic Settings title for the profile route", () => {
    // The new branch must not swallow its neighbour in the other direction.
    expect(resolvePageTitle(paths.settings.profile)).toEqual({ lead: "", accent: "Settings" });
    expect(resolvePageTitle(paths.settings.security)).toEqual({ lead: "", accent: "Settings" });
  });

  it("returns the design's italic-accent titles per route", () => {
    expect(resolvePageTitle("/")).toEqual({ lead: "Post", accent: "analytics" });
    expect(resolvePageTitle("/clients")).toEqual({ lead: "Client", accent: "list" });
    expect(resolvePageTitle("/clients/abc123")).toEqual({ lead: "Client", accent: "detail" });
    expect(resolvePageTitle(paths.clients.report("abc123"))).toEqual({
      lead: "LinkedIn",
      accent: "report",
    });
    // Same lead/accent shape as before, renamed with the nav item above.
    expect(resolvePageTitle("/upload")).toEqual({ lead: "Add", accent: "data" });
    expect(resolvePageTitle(paths.clients.outreach("abc123"))).toEqual({
      lead: "Outreach",
      accent: "system",
    });
    expect(resolvePageTitle("/resources")).toEqual({ lead: "", accent: "Resources" });
    expect(resolvePageTitle(paths.dataQuality)).toEqual({ lead: "Data", accent: "quality" });
  });
});
