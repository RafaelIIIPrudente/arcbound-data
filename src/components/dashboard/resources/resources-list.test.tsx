import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Resource } from "@/services/types";

import { ResourcesList } from "./resources-list";

const resources: Resource[] = [
  {
    id: "RES-0001",
    title: "Scrape bookmarklet setup",
    url: "https://example.com/a",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "RES-0002",
    title: "Weekly ingestion checklist",
    url: "https://example.com/b",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
];

describe("ResourcesList", () => {
  it("renders each resource as a safe external link", () => {
    render(<ResourcesList resources={resources} />);

    const link = screen.getByRole("link", { name: /Scrape bookmarklet setup/ });
    expect(link).toHaveAttribute("href", "https://example.com/a");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Weekly ingestion checklist")).toBeInTheDocument();
  });

  it("shows the empty state when there are no resources", () => {
    render(<ResourcesList resources={[]} />);
    expect(screen.getByText("No resources yet")).toBeInTheDocument();
  });
});
