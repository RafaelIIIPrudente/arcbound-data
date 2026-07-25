import { describe, expect, it } from "vitest";

import { paths } from "@/paths";

import { isPublicRoute, routeAccess } from "./route-access";

describe("isPublicRoute", () => {
  it("treats /login and the retained auth routes as public", () => {
    expect(isPublicRoute(paths.login)).toBe(true);
    expect(isPublicRoute(paths.auth.callback)).toBe(true);
    expect(isPublicRoute(paths.auth.resetPassword)).toBe(true);
    expect(isPublicRoute(paths.auth.updatePassword)).toBe(true);
  });

  it("treats app routes as non-public", () => {
    expect(isPublicRoute(paths.home)).toBe(false);
    expect(isPublicRoute(paths.clients.list)).toBe(false);
    expect(isPublicRoute(paths.upload)).toBe(false);
    expect(isPublicRoute(paths.resources)).toBe(false);
    expect(isPublicRoute(paths.customers.list)).toBe(false);
    expect(isPublicRoute(paths.settings.profile)).toBe(false);
  });

  it("treats the public client Report Link route as public (base and any token)", () => {
    expect(isPublicRoute(paths.reportLinkBase)).toBe(true);
    expect(isPublicRoute(paths.reportLink("abc123def456"))).toBe(true);
    // A token with its own trailing segment still resolves under /r.
    expect(isPublicRoute("/r/abc123/anything")).toBe(true);
  });

  it("does NOT leak the /r prefix onto sibling routes that merely start with 'r'", () => {
    // ⚠️ THE TRAILING-SLASH GUARD IS LOAD-BEARING. `/resources` starts with the
    // string "/r"; a naive prefix check would make the whole Resources feature —
    // and any future /r… route — publicly reachable. These must stay GATED.
    expect(isPublicRoute(paths.resources)).toBe(false);
    expect(isPublicRoute("/reports")).toBe(false);
    expect(isPublicRoute("/r-eport")).toBe(false);
  });

  it("treats the printable report as non-public", () => {
    // The print view is a route GROUP, not a route segment — `(print)` never
    // reaches the URL, so nothing about the export path exempts it from the
    // default-deny gate. This asserts that rather than assuming it.
    expect(isPublicRoute(paths.clients.reportPrint("abc123"))).toBe(false);
  });

  it("matches nested paths under a public route (e.g. the callback with a query segment)", () => {
    expect(isPublicRoute("/auth/callback/anything")).toBe(true);
  });

  it("treats the public metadata / branding asset routes as public (favicon, robots, manifest…)", () => {
    for (const asset of [
      "/robots.txt",
      "/sitemap.xml",
      "/manifest.webmanifest",
      "/icon",
      "/apple-icon",
      "/opengraph-image",
    ]) {
      expect(isPublicRoute(asset)).toBe(true);
      // An unauthenticated crawler / the login-page favicon must be served, not redirected.
      expect(routeAccess(asset, false)).toEqual({ type: "pass" });
    }
  });
});

describe("routeAccess", () => {
  describe("unauthenticated", () => {
    it("redirects every app route to /login", () => {
      for (const path of [
        paths.home,
        paths.clients.list,
        paths.clients.details("abc123"),
        paths.clients.report("abc123"),
        // The export leaves the building, so an unauthenticated request for it
        // must be turned away exactly like any other app route.
        paths.clients.reportPrint("abc123"),
        paths.upload,
        paths.resources,
        paths.customers.list,
        paths.settings.profile,
      ]) {
        expect(routeAccess(path, false)).toEqual({ type: "redirect", to: paths.login });
      }
    });

    it("lets the login and password-reset routes through", () => {
      expect(routeAccess(paths.login, false)).toEqual({ type: "pass" });
      expect(routeAccess(paths.auth.resetPassword, false)).toEqual({ type: "pass" });
      expect(routeAccess(paths.auth.updatePassword, false)).toEqual({ type: "pass" });
      expect(routeAccess(paths.auth.callback, false)).toEqual({ type: "pass" });
    });

    it("lets an unauthenticated visitor reach the public Report Link route", () => {
      // The whole point: a Client with the URL + Access Code has NO session, so
      // the route must pass the auth gate (the Access Code gate is enforced by
      // the /r/[token] page, not by route-access).
      expect(routeAccess(paths.reportLink("abc123def456"), false)).toEqual({ type: "pass" });
    });
  });

  describe("authenticated", () => {
    it("redirects a signed-in user away from /login to the home dashboard", () => {
      expect(routeAccess(paths.login, true)).toEqual({ type: "redirect", to: paths.home });
    });

    it("lets a signed-in user reach every app route", () => {
      for (const path of [
        paths.home,
        paths.clients.list,
        paths.clients.details("abc123"),
        paths.clients.report("abc123"),
        paths.clients.reportPrint("abc123"),
        paths.upload,
        paths.resources,
        paths.customers.list,
      ]) {
        expect(routeAccess(path, true)).toEqual({ type: "pass" });
      }
    });

    it("still lets a signed-in user reach the password-reset flow (recovery session)", () => {
      expect(routeAccess(paths.auth.updatePassword, true)).toEqual({ type: "pass" });
    });
  });
});
