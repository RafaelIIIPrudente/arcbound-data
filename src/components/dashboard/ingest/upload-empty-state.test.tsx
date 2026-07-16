import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UploadEmptyState } from "./upload-empty-state";

describe("UploadEmptyState", () => {
  it("guides the user to add a client, linking to the clients list", () => {
    render(<UploadEmptyState />);

    expect(screen.getByText("Add a client first")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Clients" })).toHaveAttribute("href", "/clients");
  });
});
