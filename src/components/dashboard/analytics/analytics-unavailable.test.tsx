import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnalyticsUnavailable } from "./analytics-unavailable";

describe("AnalyticsUnavailable", () => {
  it("shows a calm, distinct unavailable message (no dev-tells)", () => {
    render(<AnalyticsUnavailable />);

    expect(screen.getByText("Analytics unavailable")).toBeInTheDocument();
    expect(screen.getByText(/try again shortly/i)).toBeInTheDocument();
    // It must not be confused with the genuinely-empty state.
    expect(screen.queryByText(/no posts yet/i)).not.toBeInTheDocument();
  });
});
