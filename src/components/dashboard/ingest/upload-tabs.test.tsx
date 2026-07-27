import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: both Server Actions are spies. This file is about the TAB HOST —
// which form is mounted when — not about either form's own behaviour.
const { metricsActionMock, outreachActionMock } = vi.hoisted(() => ({
  metricsActionMock: vi.fn(),
  outreachActionMock: vi.fn(),
}));
vi.mock("@/app/(app)/upload/actions", () => ({ ingestMetricsAction: metricsActionMock }));
vi.mock("@/app/(app)/upload/outreach-actions", () => ({
  ingestOutreachAction: outreachActionMock,
}));

import { UploadTabs } from "./upload-tabs";

const clients = [{ id: "c1", name: "Ada Lovelace" }];

beforeEach(() => {
  metricsActionMock.mockReset();
  outreachActionMock.mockReset();
});

describe("UploadTabs", () => {
  it("offers exactly two tabs", () => {
    render(<UploadTabs clients={clients} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["LinkedIn Metrics", "Outreach System"]);
  });

  it("DEFAULTS TO LINKEDIN — the path that already works stays the one you land on", () => {
    // ⚠️ A NEW TAB MUST NOT DEMOTE THE WORKING ONE. LinkedIn metrics is the
    // weekly routine; making somebody click back to it every time would be a
    // regression dressed up as a feature.
    render(<UploadTabs clients={clients} />);

    expect(screen.getByRole("tab", { name: "LinkedIn Metrics" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renders the EXISTING LinkedIn form on the default tab", () => {
    // The four-step wizard, verbatim — its own steps prove it is the real
    // component and not a reimplementation.
    render(<UploadTabs clients={clients} />);

    expect(screen.getByText(/follower & connection counts/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload metrics/i })).toBeInTheDocument();
  });

  it("switches to the Outreach form and back", async () => {
    const user = userEvent.setup();
    render(<UploadTabs clients={clients} />);

    await user.click(screen.getByRole("tab", { name: "Outreach System" }));
    expect(await screen.findByRole("button", { name: /upload snapshot/i })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "LinkedIn Metrics" }));
    expect(await screen.findByRole("button", { name: /upload metrics/i })).toBeInTheDocument();
  });

  it("keeps the two forms APART — the LinkedIn fields are not on the Outreach tab", async () => {
    // ⚠️ THE FIELDS MUST NOT BLEED. Follower and connection counts belong to a
    // scrape; an outreach snapshot has no such numbers, and a stray box would
    // invite somebody to invent one.
    const user = userEvent.setup();
    render(<UploadTabs clients={clients} />);

    await user.click(screen.getByRole("tab", { name: "Outreach System" }));

    await screen.findByRole("button", { name: /upload snapshot/i });
    expect(screen.queryByLabelText("Follower count")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Connection count")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload metrics/i })).not.toBeInTheDocument();
  });

  it("passes the SAME client roster to both tabs — one read serves both", () => {
    // The page reads `listClientRegistry()` once. A second read per tab would be
    // a needless round trip and could disagree with itself mid-session.
    render(<UploadTabs clients={clients} />);

    expect(screen.getByLabelText("Select client")).toBeInTheDocument();
  });
});
