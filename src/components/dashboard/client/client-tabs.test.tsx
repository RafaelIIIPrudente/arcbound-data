import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { paths } from "@/paths";

import { ClientTabs } from "./client-tabs";

const pathname = vi.hoisted(() => ({ current: "/clients/c1" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

function renderAt(path: string) {
  pathname.current = path;
  return render(<ClientTabs clientId="c1" />);
}

/** The tab whose link carries `aria-current="page"`, or undefined. */
function activeTab(): string | undefined {
  return screen
    .getAllByRole("link")
    .find((el) => el.getAttribute("aria-current") === "page")
    ?.textContent?.trim();
}

describe("ClientTabs", () => {
  it("offers all three client sections as real links", () => {
    renderAt(paths.clients.details("c1"));

    // Real links, not a stateful <Tabs>: each section is a separate SERVER route
    // with its own data fetch and its own search params.
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/clients/c1");
    expect(screen.getByRole("link", { name: "Posts" })).toHaveAttribute(
      "href",
      "/clients/c1/posts",
    );
    expect(screen.getByRole("link", { name: "LinkedIn Report" })).toHaveAttribute(
      "href",
      "/clients/c1/report",
    );
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it.each([
    [paths.clients.details("c1"), "Overview"],
    [paths.clients.posts("c1"), "Posts"],
    [paths.clients.report("c1"), "LinkedIn Report"],
  ])("marks exactly one tab current on %s", (path, expected) => {
    renderAt(path);

    // ⚠️ `isActive` is an EXACT pathname match, so no href may be a PREFIX of
    // another — a startsWith comparison would light Overview on all three
    // routes. Counting the current tabs is what catches that.
    expect(activeTab()).toBe(expected);
    expect(
      screen.getAllByRole("link").filter((el) => el.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
  });

  it("marks no tab current on a route that is not one of the three", () => {
    // The print export renders no tabs of its own, but the exact match means a
    // nested route never borrows its parent's highlight.
    renderAt(paths.clients.reportPrint("c1"));

    expect(activeTab()).toBeUndefined();
  });
});
