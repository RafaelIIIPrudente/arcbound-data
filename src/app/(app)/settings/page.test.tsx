import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, getRoleMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getRoleMock: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: getSessionMock }));
vi.mock("@/lib/auth/roles", () => ({
  getRole: getRoleMock,
  // The real predicate — the point of these tests is which role reaches it.
  isAdmin: (role: string | null) => role === "admin",
}));
// The tabs are a heavy client form; this page's new behaviour is the roles link.
vi.mock("@/components/dashboard/settings/settings-tabs", () => ({
  SettingsTabs: () => <div data-testid="settings-tabs" />,
}));

import { paths } from "@/paths";

import SettingsPage from "./page";

beforeEach(() => {
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ email: "someone@arcbound.com", user_metadata: {} });
  getRoleMock.mockReset();
});

describe("the Settings page", () => {
  it("offers an admin a way into the Staff Roles screen", async () => {
    getRoleMock.mockResolvedValue("admin");

    render(await SettingsPage());

    expect(screen.getByRole("link", { name: /staff roles/i })).toHaveAttribute(
      "href",
      paths.settings.roles,
    );
  });

  it("⚠️ shows an analyst NO TRACE of the roles screen, but keeps their own settings", async () => {
    // ⚠️ BOTH HALVES IN ONE TEST, ON PURPOSE.
    //
    // The reason Staff Roles is its own route is that guarding `/settings` itself
    // would lock an analyst out of their own profile and password form. A change
    // that "hid the roles link" by requiring admin on this whole page would still
    // pass a link-absence assertion — and would break the thing the split exists
    // to protect. Asserting the tabs survive is what catches that.
    getRoleMock.mockResolvedValue("analyst");

    render(await SettingsPage());

    expect(screen.queryByRole("link", { name: /staff roles/i })).toBeNull();
    expect(screen.getByTestId("settings-tabs")).toBeInTheDocument();
  });
});
