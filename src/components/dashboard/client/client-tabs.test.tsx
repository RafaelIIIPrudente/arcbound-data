import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// ⚠️ EVERY TEST BELOW MOUNTS THE CONNECTED `ClientTabs`, NOT ONLY `ClientTabsView`.
// S4 tested `UploadTabs`' view exhaustively and left the picker feeding it
// unmounted; unhooking that wiring left the whole suite green while the real page
// became unusable. `ClientTabs` is now async, so RTL cannot mount it directly —
// each render below calls it and awaits the JSX it returns, exactly as the app's
// async Server Component pages in this repo already test themselves.
const pathname = vi.hoisted(() => ({ current: "/clients/c1" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const { getClientServicesMock } = vi.hoisted(() => ({ getClientServicesMock: vi.fn() }));
vi.mock("@/services/arcbound-services", () => ({ getClientServices: getClientServicesMock }));

import { paths } from "@/paths";
import type { ArcboundService } from "@/services/types";

import { ClientTabs, ClientTabsView } from "./client-tabs";

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

/** Renders the CONNECTED `ClientTabs` at a given pathname, holding both Services. */
async function renderAt(path: string) {
  pathname.current = path;
  getClientServicesMock.mockResolvedValue({
    services: [LINKEDIN, OUTREACH],
    held: [LINKEDIN, OUTREACH],
  });
  return render(await ClientTabs({ clientId: "c1" }));
}

/** The tab whose link carries `aria-current="page"`, or undefined. */
function activeTab(): string | undefined {
  return screen
    .getAllByRole("link")
    .find((el) => el.getAttribute("aria-current") === "page")
    ?.textContent?.trim();
}

describe("ClientTabs — a Client holding BOTH Services (pre-slice behaviour, preserved)", () => {
  it("offers all four client sections as real links", async () => {
    await renderAt(paths.clients.details("c1"));

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
    expect(screen.getByRole("link", { name: "Outreach" })).toHaveAttribute(
      "href",
      "/clients/c1/outreach",
    );
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it.each([
    [paths.clients.details("c1"), "Overview"],
    [paths.clients.posts("c1"), "Posts"],
    [paths.clients.report("c1"), "LinkedIn Report"],
    [paths.clients.outreach("c1"), "Outreach"],
  ])("marks exactly one tab current on %s", async (path, expected) => {
    await renderAt(path);

    // ⚠️ `isActive` is an EXACT pathname match, so no href may be a PREFIX of
    // another — a startsWith comparison would light Overview on all three
    // routes. Counting the current tabs is what catches that.
    expect(activeTab()).toBe(expected);
    expect(
      screen.getAllByRole("link").filter((el) => el.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
  });

  it("marks no tab current on a route that is not one of the three", async () => {
    // The print export renders no tabs of its own, but the exact match means a
    // nested route never borrows its parent's highlight.
    await renderAt(paths.clients.reportPrint("c1"));

    expect(activeTab()).toBeUndefined();
  });
});

describe("⚠️ ClientTabs — the tab list is now a function of what the Client holds (ADR 0015)", () => {
  it("shows Overview + Posts + LinkedIn Report for a Client holding only LinkedIn", async () => {
    pathname.current = paths.clients.details("c1");
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN, OUTREACH], held: [LINKEDIN] });

    render(await ClientTabs({ clientId: "c1" }));

    expect(screen.getAllByRole("link").map((t) => t.textContent)).toEqual([
      "Overview",
      "Posts",
      "LinkedIn Report",
    ]);
  });

  it("shows Overview + Outreach for a Client holding only Outreach", async () => {
    pathname.current = paths.clients.details("c1");
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN, OUTREACH], held: [OUTREACH] });

    render(await ClientTabs({ clientId: "c1" }));

    expect(screen.getAllByRole("link").map((t) => t.textContent)).toEqual(["Overview", "Outreach"]);
  });

  it("shows ONLY Overview for a Client assigned nothing", async () => {
    pathname.current = paths.clients.details("c1");
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN, OUTREACH], held: [] });

    render(await ClientTabs({ clientId: "c1" }));

    expect(screen.getAllByRole("link").map((t) => t.textContent)).toEqual(["Overview"]);
  });

  it("⚠️ shows ALL FOUR when the registry could not be read — code backstops the table", async () => {
    // ⚠️ THIS IS THE LIVE PATH TODAY: `supabase/arcbound-services.sql` is not
    // applied, so this is what every Client's tab row actually renders right now.
    // Hiding tabs over a failed read would take a working screen offline over a
    // database problem — the same self-inflicted-outage reasoning as S4's
    // `/upload` fallback.
    pathname.current = paths.clients.details("c1");
    getClientServicesMock.mockResolvedValue(null);

    render(await ClientTabs({ clientId: "c1" }));

    expect(screen.getAllByRole("link").map((t) => t.textContent)).toEqual([
      "Overview",
      "Posts",
      "LinkedIn Report",
      "Outreach",
    ]);
  });

  it("⚠️ a NULL-handler Service the Client holds unlocks no extra tab", async () => {
    const advisory: ArcboundService = { ...LINKEDIN, id: "s-advisory", handler: null };
    pathname.current = paths.clients.details("c1");
    getClientServicesMock.mockResolvedValue({ services: [advisory], held: [advisory] });

    render(await ClientTabs({ clientId: "c1" }));

    expect(screen.getAllByRole("link").map((t) => t.textContent)).toEqual(["Overview"]);
  });

  it("calls getClientServices with the Client id it was given", async () => {
    getClientServicesMock.mockResolvedValue(null);

    await ClientTabs({ clientId: "c1" });

    expect(getClientServicesMock).toHaveBeenCalledWith("c1");
  });
});

describe("ClientTabsView — the pathname-highlighting rendering, in isolation", () => {
  // A thin extra layer over the connected tests above: this is the piece that
  // takes an already-computed tab list and applies `usePathname`. Kept because it
  // is cheap and pins the active-state contract independently of the data layer,
  // NOT as a substitute for the connected tests above.
  const tabs = [
    { href: paths.clients.details("c1"), label: "Overview" },
    { href: paths.clients.posts("c1"), label: "Posts" },
  ];

  it("marks the tab matching the current pathname active", () => {
    pathname.current = paths.clients.posts("c1");

    render(<ClientTabsView tabs={tabs} />);

    expect(screen.getByRole("link", { name: "Posts" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });
});
