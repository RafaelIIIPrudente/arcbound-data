import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Customer } from "@/services/types";

import { CustomersTable } from "./customers-table";

const rows: Customer[] = [
  {
    id: "1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: "Analytical Engines",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "2",
    name: "Alan Turing",
    email: "alan@example.com",
    company: "Bletchley Labs",
    status: "pending",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
];

describe("CustomersTable", () => {
  it("renders a row per customer with a status badge", () => {
    render(<CustomersTable data={rows} />);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Alan Turing")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("shows an empty state when there are no customers", () => {
    render(<CustomersTable data={[]} />);
    expect(screen.getByText("No customers found.")).toBeInTheDocument();
  });
});
