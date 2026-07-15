import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  it("renders the title and description", () => {
    render(<ErrorState title="Custom title" description="Custom description" />);
    expect(screen.getByText("Custom title")).toBeInTheDocument();
    expect(screen.getByText("Custom description")).toBeInTheDocument();
  });

  it("shows a 'Try again' button that calls onReset when clicked", async () => {
    const onReset = vi.fn();
    render(<ErrorState onReset={onReset} />);
    const button = screen.getByRole("button", { name: /try again/i });
    expect(button).toBeInTheDocument();
    await userEvent.click(button);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("never surfaces a raw error, and shows a support reference only with a digest", () => {
    const { rerender } = render(<ErrorState description="A friendly, generic message." />);
    // No raw error text and no reference line without a digest.
    expect(screen.queryByText(/TypeError: cannot read properties/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();

    rerender(<ErrorState description="A friendly, generic message." digest="abc123" />);
    expect(screen.getByText("Reference: abc123")).toBeInTheDocument();
  });
});
