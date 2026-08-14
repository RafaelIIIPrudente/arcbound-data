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

describe("ClientTabs — a Client holding BOTH Services", () => {
  it("offers Overview + one tab per held Service, LABELLED FROM THE REGISTRY (D17), as real links", async () => {
    await renderAt(paths.clients.details("c1"));

    // Real links, not a stateful <Tabs>: each section is a separate SERVER route
    // with its own data fetch and its own search params. Posts is no longer a
    // top-level tab (D17/D18) — it lives in the LinkedIn section's sub-nav.
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/clients/c1");
    expect(screen.getByRole("link", { name: "LinkedIn Growth" })).toHaveAttribute(
      "href",
      "/clients/c1/report",
    );
    expect(screen.getByRole("link", { name: "Outreach System" })).toHaveAttribute(
      "href",
      "/clients/c1/outreach",
    );
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it.each([
    [paths.clients.details("c1"), "Overview"],
    [paths.clients.report("c1"), "LinkedIn Growth"],
    [paths.clients.posts("c1"), "LinkedIn Growth"],
    [paths.clients.outreach("c1"), "Outreach System"],
  ])("marks exactly one tab current on %s", async (path, expected) => {
    // ⚠️ `/posts` LIGHTS THE LINKEDIN TAB (D18). Posts is a sub-nav item inside
    // the LinkedIn section now — the PARENT tab must stay current while a
    // visitor is on it, or Posts would read as a dead end with no way back.
    await renderAt(path);

    expect(activeTab()).toBe(expected);
    // ⚠️ THE COUNT, NOT JUST THE IDENTITY. `isActive` is an EXACT pathname
    // match against each tab's OWN set of paths, never a `startsWith` — a
    // prefix comparison would light Overview (`/clients/c1`) on every one of
    // these routes at once. Counting is what catches that.
    expect(
      screen.getAllByRole("link").filter((el) => el.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
  });

  it("marks no tab current on a route that is not one of these", async () => {
    // The print export renders no tabs of its own, but the exact match means a
    // nested route never borrows its parent's highlight.
    await renderAt(paths.clients.reportPrint("c1"));

    expect(activeTab()).toBeUndefined();
  });
});

describe("⚠️ ClientTabs — the tab list is now a function of what the Client holds (ADR 0015)", () => {
  it("shows Overview + LinkedIn Growth for a Client holding only LinkedIn", async () => {
    pathname.current = paths.clients.details("c1");
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN, OUTREACH], held: [LINKEDIN] });

    render(await ClientTabs({ clientId: "c1" }));

    expect(screen.getAllByRole("link").map((t) => t.textContent)).toEqual([
      "Overview",
      "LinkedIn Growth",
    ]);
  });

  it("shows Overview + Outreach System for a Client holding only Outreach", async () => {
    pathname.current = paths.clients.details("c1");
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN, OUTREACH], held: [OUTREACH] });

    render(await ClientTabs({ clientId: "c1" }));

    expect(screen.getAllByRole("link").map((t) => t.textContent)).toEqual([
      "Overview",
      "Outreach System",
    ]);
  });

  it("shows ONLY Overview for a Client assigned nothing", async () => {
    pathname.current = paths.clients.details("c1");
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN, OUTREACH], held: [] });

    render(await ClientTabs({ clientId: "c1" }));

    expect(screen.getAllByRole("link").map((t) => t.textContent)).toEqual(["Overview"]);
  });

  it("⚠️ shows every pipeline, CODE-LABELLED, when the registry could not be read", async () => {
    // ⚠️ NO LONGER THE EVERYDAY PATH: `supabase/arcbound-services.sql` has been
    // applied since 2026-08-14, so a real tab row is what renders now. This is
    // what a FAILED registry read renders, which is still reachable.
    // Hiding tabs over a failed read would take a working screen offline over a
    // database problem — the same self-inflicted-outage reasoning as S4's
    // `/upload` fallback. The labels come from `service-access.ts`'s own
    // fallback map, not from any real registry row.
    pathname.current = paths.clients.details("c1");
    getClientServicesMock.mockResolvedValue(null);

    render(await ClientTabs({ clientId: "c1" }));

    expect(screen.getAllByRole("link").map((t) => t.textContent)).toEqual([
      "Overview",
      "LinkedIn Metrics",
      "Outreach System",
    ]);
  });

  it("⚠️ a NULL-handler Service the Client holds unlocks no extra tab", async () => {
    const advisory: ArcboundService = { ...LINKEDIN, id: "s-advisory", handler: null };
    pathname.current = paths.clients.details("c1");
    getClientServicesMock.mockResolvedValue({ services: [advisory], held: [advisory] });

    render(await ClientTabs({ clientId: "c1" }));

    expect(screen.getAllByRole("link").map((t) => t.textContent)).toEqual(["Overview"]);
  });

  it("⚠️ LABELS COME FROM THE SERVICE'S OWN NAME, NOT A FIXED STRING (D17)", async () => {
    // Renaming a Service in Settings → Services must change the tab label.
    // This fixture's name matches no fixed string this code could plausibly
    // fall back to — which is exactly what would catch a hard-coded label.
    const renamedLinkedin: ArcboundService = {
      ...LINKEDIN,
      name: "Bryan's Custom LinkedIn Package",
    };
    pathname.current = paths.clients.details("c1");
    getClientServicesMock.mockResolvedValue({
      services: [renamedLinkedin],
      held: [renamedLinkedin],
    });

    render(await ClientTabs({ clientId: "c1" }));

    expect(
      screen.getByRole("link", { name: "Bryan's Custom LinkedIn Package" }),
    ).toBeInTheDocument();
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
    {
      href: paths.clients.details("c1"),
      label: "Overview",
      activePaths: [paths.clients.details("c1")],
    },
    {
      href: paths.clients.report("c1"),
      label: "LinkedIn Growth",
      activePaths: [paths.clients.report("c1"), paths.clients.posts("c1")],
    },
  ];

  it("marks the tab matching the current pathname active", () => {
    pathname.current = paths.clients.report("c1");

    render(<ClientTabsView tabs={tabs} />);

    expect(screen.getByRole("link", { name: "LinkedIn Growth" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("⚠️ the LinkedIn tab stays current on the Posts sub-route too (D18)", () => {
    pathname.current = paths.clients.posts("c1");

    render(<ClientTabsView tabs={tabs} />);

    expect(screen.getByRole("link", { name: "LinkedIn Growth" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("⚠️ EXACTLY ONE TAB MAY BE CURRENT ON ANY ROUTE — asserts the count, not just identity", () => {
    // ⚠️ THIS IS WHAT CATCHES A `startsWith` IMPLEMENTATION. Overview's href
    // (`/clients/c1`) is a PREFIX of the LinkedIn tab's own routes — a naive
    // `pathname.startsWith(tab.href)` would light BOTH tabs on `/clients/c1/report`.
    pathname.current = paths.clients.report("c1");

    render(<ClientTabsView tabs={tabs} />);

    expect(
      screen.getAllByRole("link").filter((el) => el.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
  });
});
