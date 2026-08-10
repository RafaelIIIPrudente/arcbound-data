import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// Sit on the nested Staff Roles route: it exercises both the item list and the
// nested-active rule in one render.
vi.mock("next/navigation", () => ({ usePathname: () => "/settings/roles" }));

import { MobileNav } from "./mobile-nav";

/** Mount, then open the sheet — its items are not in the DOM until it is opened. */
async function openMenu() {
  const user = userEvent.setup();
  render(<MobileNav />);
  await user.click(screen.getByRole("button", { name: /open navigation menu/i }));
  return screen.getByRole("navigation");
}

describe("MobileNav", () => {
  it("⚠️ renders the SAME six items as the desktop nav, Settings last", async () => {
    // ⚠️ THE TWO NAVS ARE SEPARATE COMPONENTS OVER ONE LIST, AND THAT IS THE RISK.
    // `side-nav.test.tsx` proves the desktop sidebar; nothing proved the mobile
    // sheet, so a hard-coded item added to one and not the other would ship a
    // phone menu that silently disagrees with the desktop one. Both now assert the
    // full ordered list.
    const menu = await openMenu();

    const links = within(menu).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Dashboard",
      "Client List",
      "Add Data",
      "Resources",
      "Data Quality",
      "Settings",
    ]);
  });

  it("keeps Settings the active item on the nested Staff Roles route", async () => {
    const menu = await openMenu();

    expect(within(menu).getByRole("link", { current: "page" })).toHaveTextContent("Settings");
  });

  it("⚠️ needs no role, session or user to render Settings", async () => {
    // ⚠️ `/settings` IS FOR EVERYONE. It hosts profile and password management,
    // which every staff member needs; only the Staff Roles link INSIDE it is
    // admin-only (ADR 0013). This component is mounted here with NO role context
    // mocked at all — if the item were ever gated, this render could not produce
    // it, and the test would fail rather than quietly hiding it from analysts.
    const menu = await openMenu();

    expect(within(menu).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});
