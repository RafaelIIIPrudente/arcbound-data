import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/clients/c1/report" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { paths } from "@/paths";

import { SectionTabs } from "./section-tabs";

const tabs = [
  { href: paths.clients.report("c1"), label: "Report" },
  { href: paths.clients.posts("c1"), label: "Posts" },
];

describe("SectionTabs — a one-level-down sub-nav, general-purpose", () => {
  // ⚠️ THIS COMPONENT KNOWS NOTHING ABOUT SERVICES OR LINKEDIN. It takes a plain
  // `{href,label}` list plus the current pathname — same shape and reasoning as
  // `ClientTabsView`, one level down. Whoever calls it (today: only the LinkedIn
  // section) decides what belongs in the list.

  it("renders every tab as a real link", () => {
    pathname.current = paths.clients.report("c1");

    render(<SectionTabs tabs={tabs} />);

    expect(screen.getByRole("link", { name: "Report" })).toHaveAttribute(
      "href",
      "/clients/c1/report",
    );
    expect(screen.getByRole("link", { name: "Posts" })).toHaveAttribute(
      "href",
      "/clients/c1/posts",
    );
  });

  it("marks the tab matching the current pathname active", () => {
    pathname.current = paths.clients.posts("c1");

    render(<SectionTabs tabs={tabs} />);

    expect(screen.getByRole("link", { name: "Posts" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Report" })).not.toHaveAttribute("aria-current");
  });

  it("⚠️ EXACT pathname match, never a prefix — exactly one tab may be current", () => {
    // Same discipline as `client-tabs-view.tsx`: assert the COUNT of current
    // tabs, not just which one, so a `startsWith` regression cannot hide behind
    // a single passing identity check.
    pathname.current = paths.clients.report("c1");

    render(<SectionTabs tabs={tabs} />);

    expect(
      screen.getAllByRole("link").filter((el) => el.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
  });

  it("marks no tab current on a route neither tab owns", () => {
    pathname.current = paths.clients.details("c1");

    render(<SectionTabs tabs={tabs} />);

    expect(
      screen.getAllByRole("link").some((el) => el.getAttribute("aria-current") === "page"),
    ).toBe(false);
  });
});
