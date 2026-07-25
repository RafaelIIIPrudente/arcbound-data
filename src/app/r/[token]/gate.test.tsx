import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The gate binds a server action; stub the module so the client component can
// mount without the action's server-only deps being pulled into the test.
vi.mock("./actions", () => ({ submitAccessCode: vi.fn() }));

import { ReportLinkGate } from "./gate";

describe("ReportLinkGate", () => {
  it("renders an Access Code field and a submit control", () => {
    render(<ReportLinkGate token="abc123" />);
    expect(screen.getByLabelText(/access code/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view report/i })).toBeInTheDocument();
  });

  it("shows no error and no oracle wording in the idle state", () => {
    const { container } = render(<ReportLinkGate token="abc123" />);
    expect(screen.queryByRole("alert")).toBeNull();
    // Never hint at WHICH of link/code is wrong, and never grade.
    expect(container.textContent ?? "").not.toMatch(
      /wrong code|unknown link|incorrect code|not found/i,
    );
    expect(container.textContent ?? "").not.toMatch(
      /\b(best|optimal|recommended?|top|score|grade)\b/i,
    );
  });
});
