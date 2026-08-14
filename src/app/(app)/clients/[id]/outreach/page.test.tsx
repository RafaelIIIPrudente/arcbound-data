import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientMock,
  latestSnapshotMock,
  listOutreachUploadsMock,
  getClientServicesMock,
  buildEmailAnalyticsMock,
} = vi.hoisted(() => ({
  getClientMock: vi.fn(),
  latestSnapshotMock: vi.fn(),
  listOutreachUploadsMock: vi.fn(),
  getClientServicesMock: vi.fn(),
  buildEmailAnalyticsMock: vi.fn(() => ({ status: "not-in-export" })),
}));
vi.mock("@/services/clients", () => ({ getClient: getClientMock }));
vi.mock("@/services/outreach", () => ({
  latestSnapshot: latestSnapshotMock,
  listOutreachUploads: listOutreachUploadsMock,
  snapshotById: vi.fn(),
}));
vi.mock("@/services/arcbound-services", () => ({ getClientServices: getClientServicesMock }));
vi.mock("@/components/dashboard/client/client-tabs", () => ({ ClientTabs: () => null }));
// The four-state read (unavailable / empty / ok) is Scope-excluded — this file
// tests only the NEW gate in front of all of them.
vi.mock("@/components/dashboard/outreach/outreach-states", () => ({
  OutreachNoSnapshot: () => <div data-testid="outreach-no-snapshot" />,
  OutreachUnavailable: () => <div data-testid="outreach-unavailable" />,
  OutreachAllVoided: ({ voidedCount }: { voidedCount: number | null }) => (
    <div data-testid="outreach-all-voided" data-count={String(voidedCount)} />
  ),
  OutreachTruncated: () => null,
}));
vi.mock("@/components/dashboard/outreach/outreach-kpis", () => ({
  OutreachKpis: () => <div data-testid="outreach-kpis" />,
}));
vi.mock("@/components/dashboard/outreach/outreach-funnel", () => ({ OutreachFunnel: () => null }));
vi.mock("@/components/dashboard/outreach/outreach-breakdown-chart", () => ({
  OutreachBreakdownChart: () => null,
}));
vi.mock("@/components/dashboard/outreach/outreach-sent-chart", () => ({
  OutreachSentChart: () => null,
}));
vi.mock("@/components/dashboard/outreach/outreach-movement", () => ({
  OutreachMovementPanel: () => null,
}));
vi.mock("@/components/dashboard/outreach/outreach-disclosure", () => ({
  OutreachDisclosure: () => null,
}));
vi.mock("@/components/dashboard/outreach/prospect-table", () => ({
  ProspectTable: () => <div data-testid="prospect-table" />,
}));
vi.mock("@/components/dashboard/outreach/email-funnel-panel", () => ({
  EmailFunnelPanel: ({ emailAnalytics }: { emailAnalytics: { status: string } }) => (
    <div data-testid="email-funnel-panel" data-status={emailAnalytics.status} />
  ),
}));
vi.mock("@/services/outreach-analytics", () => ({
  buildOutreachAnalytics: () => ({
    funnel: [],
    stage: [],
    connectionStatus: [],
    replyStatus: [],
    followUps: [],
    sentOverTime: [],
    totalProspects: 0,
    unrecognisedReplyValues: [],
    unreadableFollowUpCounts: 0,
  }),
  outreachMovement: vi.fn(),
  sentTrend: () => [],
}));
vi.mock("@/services/email-analytics", () => ({ buildEmailAnalytics: buildEmailAnalyticsMock }));

import type { ArcboundService } from "@/services/types";

import ClientOutreachPage from "./page";

const CLIENT_ID = "11111111-1111-1111-1111-111111111111";

function params() {
  return { params: Promise.resolve({ id: CLIENT_ID }) };
}

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

const SNAPSHOT_OK = {
  status: "ok" as const,
  prospects: [{ id: "p1" }],
  truncated: false,
  total: 1,
  upload: { id: "u1", createdAt: "2026-08-03", hasEmailChannel: true },
};

beforeEach(() => {
  getClientMock.mockReset();
  getClientMock.mockResolvedValue({
    id: CLIENT_ID,
    name: "Ada Lovelace",
    linkedin_url: "https://www.linkedin.com/in/adalovelace",
  });
  latestSnapshotMock.mockReset();
  latestSnapshotMock.mockResolvedValue(SNAPSHOT_OK);
  listOutreachUploadsMock.mockReset();
  listOutreachUploadsMock.mockResolvedValue([{ id: "u1", createdAt: "2026-08-03" }]);
  getClientServicesMock.mockReset();
  buildEmailAnalyticsMock.mockReset();
  buildEmailAnalyticsMock.mockReturnValue({ status: "not-in-export" });
});

describe("ClientOutreachPage — gated on outreach_prospects (ADR 0015)", () => {
  it("renders the real outreach data when the Client holds Outreach System", async () => {
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });

    render(await ClientOutreachPage(params()));

    expect(screen.queryByText(/not assigned/i)).toBeNull();
    expect(screen.getByTestId("outreach-kpis")).toBeInTheDocument();
  });

  it("⚠️ says NOT ASSIGNED, never NO DATA, when the Client does not hold it", async () => {
    // ⚠️ THE ORIGINAL PRODUCTION BUG, RESTATED. Before this slice EVERY Client got
    // an Outreach tab and an empty funnel — reading as "we ran outreach and got
    // nothing" for a Client Arcbound has never run outreach for.
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN], held: [LINKEDIN] });

    render(await ClientOutreachPage(params()));

    expect(screen.getByText(/not assigned/i)).toBeInTheDocument();
    expect(screen.queryByTestId("outreach-no-snapshot")).toBeNull();
    expect(screen.queryByTestId("outreach-unavailable")).toBeNull();
  });

  it("⚠️ does NOT render outreach sections for an unassigned Client, even with real snapshot data", async () => {
    // ⚠️ THE SNAPSHOT READ SUCCEEDS in this test — proving the gate checks the
    // ASSIGNMENT, not merely whether a snapshot happens to exist.
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN], held: [LINKEDIN] });

    render(await ClientOutreachPage(params()));

    expect(screen.queryByTestId("outreach-kpis")).toBeNull();
    expect(screen.queryByTestId("prospect-table")).toBeNull();
  });

  it("⚠️ renders normally AND warns, when the registry could not be read", async () => {
    getClientServicesMock.mockResolvedValue(null);

    render(await ClientOutreachPage(params()));

    expect(screen.getByRole("alert")).toHaveTextContent(/could not be read/i);
    expect(screen.queryByText(/not assigned/i)).toBeNull();
    expect(screen.getByTestId("outreach-kpis")).toBeInTheDocument();
  });

  it("renders on a direct URL — no notFound(), no redirect", async () => {
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN], held: [LINKEDIN] });

    const { container } = render(await ClientOutreachPage(params()));

    expect(container.firstChild).not.toBeNull();
  });
});

describe("ClientOutreachPage — the Email funnel panel (S3, 2026-08-10)", () => {
  it("⚠️ calls buildEmailAnalytics with the snapshot's rows AND upload.hasEmailChannel", async () => {
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });

    await ClientOutreachPage(params());

    expect(buildEmailAnalyticsMock).toHaveBeenCalledWith(SNAPSHOT_OK.prospects, true);
  });

  it("passes a `false` hasEmailChannel through untouched — never defaulted to true", async () => {
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });
    latestSnapshotMock.mockResolvedValue({
      ...SNAPSHOT_OK,
      upload: { ...SNAPSHOT_OK.upload, hasEmailChannel: false },
    });

    await ClientOutreachPage(params());

    expect(buildEmailAnalyticsMock).toHaveBeenCalledWith(SNAPSHOT_OK.prospects, false);
  });

  it("renders the Email panel beside the LinkedIn funnel for an assigned Client", async () => {
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });

    render(await ClientOutreachPage(params()));

    expect(screen.getByTestId("email-funnel-panel")).toBeInTheDocument();
  });

  it("does NOT render the Email panel for an unassigned Client", async () => {
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN], held: [LINKEDIN] });

    render(await ClientOutreachPage(params()));

    expect(screen.queryByTestId("email-funnel-panel")).toBeNull();
    expect(buildEmailAnalyticsMock).not.toHaveBeenCalled();
  });
});

describe("all-voided is its own rendering, never the 'never uploaded' one", () => {
  it("renders the voided panel — NOT the no-snapshot one — and passes the count", async () => {
    // ⚠️ THE COLLAPSE THIS STATE EXISTS TO PREVENT. `OutreachNoSnapshot` says
    // "Nothing has been uploaded for this client" and offers Add Data. Shown to
    // a Client whose colleague voided their upload an hour ago that is false,
    // and it invites re-uploading data ArcBase already holds.
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });
    latestSnapshotMock.mockResolvedValue({ status: "all-voided", voidedCount: 3 });

    render(await ClientOutreachPage(params()));

    expect(screen.getByTestId("outreach-all-voided")).toHaveAttribute("data-count", "3");
    expect(screen.queryByTestId("outreach-no-snapshot")).toBeNull();
    expect(screen.queryByTestId("outreach-kpis")).toBeNull();
  });

  it("keeps EMPTY rendering the no-snapshot panel — the two states did not merge", async () => {
    // The discriminator: without this, the test above could pass by pointing
    // `empty` at the voided panel too.
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });
    latestSnapshotMock.mockResolvedValue({ status: "empty" });

    render(await ClientOutreachPage(params()));

    expect(screen.getByTestId("outreach-no-snapshot")).toBeInTheDocument();
    expect(screen.queryByTestId("outreach-all-voided")).toBeNull();
  });

  it("passes a NULL count through rather than defaulting it to zero", async () => {
    // `voidedCount: null` means the database declined an exact count. A 0 would
    // contradict the state itself — this branch exists because at least one
    // voided snapshot is there.
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });
    latestSnapshotMock.mockResolvedValue({ status: "all-voided", voidedCount: null });

    render(await ClientOutreachPage(params()));

    expect(screen.getByTestId("outreach-all-voided")).toHaveAttribute("data-count", "null");
  });
});
