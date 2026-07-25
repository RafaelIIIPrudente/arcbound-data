import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Simulate being on a client detail route so we can assert Client List stays active.
vi.mock("next/navigation", () => ({ usePathname: () => "/clients/abc123" }));

import { SideNav } from "./side-nav";

describe("SideNav", () => {
  it("renders exactly the five ArcBase nav items", () => {
    render(<SideNav />);

    const labels = ["Dashboard", "Client List", "Add LI Post Metrics", "Resources", "Data Quality"];
    for (const label of labels) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }

    // ⚠️ "EXACTLY" USED TO BE A LIE. This test only looped over the labels it
    // knew about and never counted, so a sixth item would have slipped past it
    // in silence. The count is what makes the test's own name true.
    //
    // Scoped to the MENU, not the whole sidebar: the wordmark is also a link to
    // home, and it is chrome rather than a nav item. Counting every link in the
    // aside would make this fail for a reason that has nothing to do with the
    // menu — which is exactly what it did when the count was first added.
    const menu = screen.getByRole("navigation");
    expect(within(menu).getAllByRole("link")).toHaveLength(labels.length);
  });

  it("keeps Client List the active item on a client detail route", () => {
    render(<SideNav />);
    const active = screen.getByRole("link", { current: "page" });
    expect(active).toHaveTextContent("Client List");
  });
});
