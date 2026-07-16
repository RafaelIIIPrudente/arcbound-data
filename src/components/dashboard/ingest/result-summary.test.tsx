import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResultSummary } from "./result-summary";

describe("ResultSummary", () => {
  it("shows the three counts and the completion state", () => {
    render(
      <ResultSummary summary={{ inserted: 8, updated: 3, unchanged: 2 }} onReset={() => {}} />,
    );

    expect(screen.getByText("Upload complete")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Inserted")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.getByText("Unchanged")).toBeInTheDocument();
  });

  it("links 'View analytics' to the dashboard and wires 'Upload another'", async () => {
    const onReset = vi.fn();
    const user = (await import("@testing-library/user-event")).default.setup();
    render(<ResultSummary summary={{ inserted: 1, updated: 0, unchanged: 0 }} onReset={onReset} />);

    expect(screen.getByRole("link", { name: "View analytics" })).toHaveAttribute("href", "/");

    await user.click(screen.getByRole("button", { name: "Upload another" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
