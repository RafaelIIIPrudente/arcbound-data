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

import type { ArcboundService } from "@/services/types";

import { UploadTabs } from "./upload-tabs";

const CLIENT = "c1";

const LINKEDIN: ArcboundService = {
  id: "s-linkedin",
  slug: "linkedin-growth",
  name: "LinkedIn Growth",
  description: null,
  handler: "linkedin_post_metrics",
  status: "active",
  sortOrder: 10,
};
const OUTREACH: ArcboundService = {
  id: "s-outreach",
  slug: "outreach-system",
  name: "Outreach System",
  description: null,
  handler: "outreach_prospects",
  status: "active",
  sortOrder: 20,
};
/** A listed offering with no ingestion pipeline — a real state, not a gap. */
const ADVISORY: ArcboundService = {
  id: "s-advisory",
  slug: "advisory",
  name: "Advisory",
  description: null,
  handler: null,
  status: "active",
  sortOrder: 30,
};
/** Retired in S2, but this Client still holds it — the engagement is live. */
const ARCHIVED_LINKEDIN: ArcboundService = { ...LINKEDIN, status: "archived" };

beforeEach(() => {
  metricsActionMock.mockReset();
  outreachActionMock.mockReset();
});

describe("UploadTabs — the tabs are the Client's services", () => {
  it("offers a tab per held service with a pipeline", () => {
    render(<UploadTabs clientId={CLIENT} services={[LINKEDIN, OUTREACH]} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["LinkedIn Metrics", "Outreach System"]);
  });

  it("⚠️ offers ONLY what this Client holds", () => {
    // ⚠️ THE POINT OF THE WHOLE SLICE. Before this, both tabs appeared for every
    // Client whether or not Arcbound did that work for them — so "no data yet" and
    // "we do not do this for them" looked identical.
    render(<UploadTabs clientId={CLIENT} services={[OUTREACH]} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Outreach System"]);
    expect(screen.queryByRole("tab", { name: /linkedin/i })).toBeNull();
  });

  it("DEFAULTS TO LINKEDIN — the path that already works stays the one you land on", () => {
    // ⚠️ A NEW TAB MUST NOT DEMOTE THE WORKING ONE. LinkedIn metrics is the
    // weekly routine; making somebody click back to it every time would be a
    // regression dressed up as a feature.
    render(<UploadTabs clientId={CLIENT} services={[OUTREACH, LINKEDIN]} />);

    const tabs = screen.getAllByRole("tab");
    // First in the strip regardless of the order the services arrived in…
    expect(tabs[0]).toHaveTextContent("LinkedIn Metrics");
    // …and selected.
    expect(screen.getByRole("tab", { name: "LinkedIn Metrics" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("selects the only tab when the Client has no LinkedIn service", () => {
    render(<UploadTabs clientId={CLIENT} services={[OUTREACH]} />);

    expect(screen.getByRole("tab", { name: "Outreach System" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renders the EXISTING LinkedIn form on the default tab", () => {
    // Its own steps prove it is the real component and not a reimplementation.
    render(<UploadTabs clientId={CLIENT} services={[LINKEDIN]} />);

    expect(screen.getByText(/follower & connection counts/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload metrics/i })).toBeInTheDocument();
  });

  it("switches to the Outreach form and back", async () => {
    const user = userEvent.setup();
    render(<UploadTabs clientId={CLIENT} services={[LINKEDIN, OUTREACH]} />);

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
    render(<UploadTabs clientId={CLIENT} services={[LINKEDIN, OUTREACH]} />);

    await user.click(screen.getByRole("tab", { name: "Outreach System" }));

    await screen.findByRole("button", { name: /upload snapshot/i });
    expect(screen.queryByLabelText("Follower count")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Connection count")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload metrics/i })).not.toBeInTheDocument();
  });

  it("⚠️ the forms no longer own a client selector — the Client is chosen above them", () => {
    // Replaces the old "passes the SAME client roster to both tabs" assertion:
    // one read still serves both, but the selection now lives in IngestPanel, so
    // switching tabs cannot lose or disagree about who was picked.
    render(<UploadTabs clientId={CLIENT} services={[LINKEDIN]} />);

    expect(screen.queryByLabelText("Select client")).toBeNull();
  });
});

describe("UploadTabs — a service with no pipeline", () => {
  it("⚠️ produces NO tab, and that is correct rather than missing", () => {
    // ⚠️ "LISTED BUT NOT INGESTIBLE" IS A REAL STATE (ADR 0015). Advisory is
    // genuinely sold; it simply has nothing to upload.
    render(<UploadTabs clientId={CLIENT} services={[LINKEDIN, ADVISORY]} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["LinkedIn Metrics"]);
  });

  it("⚠️ says so in words when the Client holds ONLY no-pipeline services", () => {
    // ⚠️ AN EMPTY TAB STRIP WOULD BE INDISTINGUISHABLE FROM A BUG. The Client has
    // services — they just do not ingest — and that is a different fact from
    // having none at all, which is what the prompt component covers.
    render(<UploadTabs clientId={CLIENT} services={[ADVISORY]} />);

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByText(/no upload/i)).toBeInTheDocument();
    expect(screen.getByText(/advisory/i)).toBeInTheDocument();
  });
});

describe("⚠️ UploadTabs — a HELD service that has since been ARCHIVED", () => {
  it("⚠️ KEEPS its tab, so a retirement cannot strip a live engagement", () => {
    // ⚠️ THE ENGAGEMENT IS LIVE UNTIL SOMEBODY UN-ASSIGNS IT (D11). S2's archive
    // was deliberately non-destructive: it retires an offering from the REGISTRY
    // without touching the Clients who already hold it. Hiding the tab here would
    // let a registry-level decision silently remove a working upload path from a
    // Client mid-engagement — the exact silent outage this workstream exists to
    // prevent.
    render(<UploadTabs clientId={CLIENT} services={[ARCHIVED_LINKEDIN]} />);

    expect(screen.getByRole("tab", { name: /linkedin metrics/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload metrics/i })).toBeInTheDocument();
  });

  it("labels the tab ARCHIVED and says the service is archived but still assigned", () => {
    // Uploading still works, but the person doing it should know the offering has
    // been retired — otherwise the first they hear of it is when it disappears.
    render(<UploadTabs clientId={CLIENT} services={[ARCHIVED_LINKEDIN]} />);

    expect(screen.getByRole("tab", { name: /archived/i })).toBeInTheDocument();
    expect(screen.getByText(/archived but still assigned/i)).toBeInTheDocument();
  });

  it("does not label an active service as archived", () => {
    render(<UploadTabs clientId={CLIENT} services={[LINKEDIN]} />);

    expect(screen.queryByText(/archived but still assigned/i)).toBeNull();
    expect(screen.getByRole("tab", { name: "LinkedIn Metrics" })).toBeInTheDocument();
  });
});
