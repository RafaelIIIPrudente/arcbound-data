import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Simulate being on a client detail route so we can assert Client List stays active.
vi.mock("next/navigation", () => ({ usePathname: () => "/clients/abc123" }));

import { SideNav } from "./side-nav";

describe("SideNav", () => {
  it("renders exactly the four ArcBase nav items", () => {
    render(<SideNav />);
    for (const label of ["Dashboard", "Client List", "Add LI Post Metrics", "Resources"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("keeps Client List the active item on a client detail route", () => {
    render(<SideNav />);
    const active = screen.getByRole("link", { current: "page" });
    expect(active).toHaveTextContent("Client List");
  });
});
