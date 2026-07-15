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

  it("matches nested paths under a public route (e.g. the callback with a query segment)", () => {
    expect(isPublicRoute("/auth/callback/anything")).toBe(true);
  });
});

describe("routeAccess", () => {
  describe("unauthenticated", () => {
    it("redirects every app route to /login", () => {
      for (const path of [
        paths.home,
        paths.clients.list,
        paths.clients.details("abc123"),
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
