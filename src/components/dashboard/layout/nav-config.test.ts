import { describe, expect, it } from "vitest";

import { paths } from "@/paths";

import { isNavItemActive, navItems, resolvePageTitle } from "./nav-config";

describe("navItems", () => {
  it("is exactly the four ArcBase nav items, in order", () => {
    expect(navItems.map((i) => i.title)).toEqual([
      "Dashboard",
      "Client List",
      "Add LI Post Metrics",
      "Resources",
    ]);
    expect(navItems.map((i) => i.href)).toEqual([
      paths.home,
      paths.clients.list,
      paths.upload,
      paths.resources,
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
  it("returns the design's italic-accent titles per route", () => {
    expect(resolvePageTitle("/")).toEqual({ lead: "Post", accent: "analytics" });
    expect(resolvePageTitle("/clients")).toEqual({ lead: "Client", accent: "list" });
    expect(resolvePageTitle("/clients/abc123")).toEqual({ lead: "Client", accent: "detail" });
    expect(resolvePageTitle(paths.clients.report("abc123"))).toEqual({
      lead: "LinkedIn",
      accent: "report",
    });
    expect(resolvePageTitle("/upload")).toEqual({ lead: "Add post", accent: "metrics" });
    expect(resolvePageTitle("/resources")).toEqual({ lead: "", accent: "Resources" });
  });
});
