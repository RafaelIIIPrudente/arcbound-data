import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Client } from "@/services/types";

import { ClientsTable } from "./clients-table";

const rows: Client[] = [
  {
    id: "CLIENT-0001",
    name: "Bryan Wish",
    linkedin_url: "https://linkedin.com/in/bryanwish",
    createdAt: "2026-01-04T09:00:00.000Z",
    postsCount: 5,
  },
  {
    id: "CLIENT-0002",
    name: "Senthil Kumar",
    linkedin_url: "https://linkedin.com/in/senthilkumar",
    createdAt: "2026-01-06T11:30:00.000Z",
    postsCount: 62,
  },
];

describe("ClientsTable", () => {
  it("renders a row per client with the name and scheme-stripped LinkedIn URL", () => {
    render(<ClientsTable data={rows} />);

    expect(screen.getByRole("link", { name: "Bryan Wish" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Senthil Kumar" })).toBeInTheDocument();
    expect(screen.getByText("linkedin.com/in/bryanwish")).toBeInTheDocument();
    expect(screen.getByText("linkedin.com/in/senthilkumar")).toBeInTheDocument();
  });

  it("shows an empty state when there are no clients", () => {
    render(<ClientsTable data={[]} />);
    expect(screen.getByText("No clients found.")).toBeInTheDocument();
  });
});
