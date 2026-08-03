import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getClientMock, getClientReportMock, getClientServicesMock } = vi.hoisted(() => ({
  getClientMock: vi.fn(),
  getClientReportMock: vi.fn(),
  getClientServicesMock: vi.fn(),
}));
vi.mock("@/services/clients", () => ({ getClient: getClientMock }));
vi.mock("@/services/client-report", () => ({ getClientReport: getClientReportMock }));
vi.mock("@/services/arcbound-services", () => ({ getClientServices: getClientServicesMock }));
vi.mock("@/components/dashboard/client/client-tabs", () => ({ ClientTabs: () => null }));
vi.mock("@/components/dashboard/report/report-period-picker", () => ({
  ReportPeriodPicker: () => null,
}));
// A stub carrying the tabs it was handed — this file is about the GATE, not
// about `SectionTabs`' own pathname-highlighting (covered in
// section-tabs.test.tsx), and the real component needs a router context this
// file does not set up.
vi.mock("@/components/dashboard/client/section-tabs", () => ({
  SectionTabs: ({ tabs }: { tabs: { href: string; label: string }[] }) => (
    <div data-testid="section-tabs">{tabs.map((t) => t.label).join(",")}</div>
  ),
}));
// Every section component below is a stub carrying a recognisable marker — this
// file is about the GATE, not about what any section computes (out of Scope).
vi.mock("@/components/dashboard/report/key-performance", () => ({
  KeyPerformance: () => <div data-testid="key-performance" />,
}));
vi.mock("@/components/dashboard/report/impressions-by-month-chart", () => ({
  ImpressionsByMonthChart: () => null,
}));
vi.mock("@/components/dashboard/report/impressions-by-weekday-chart", () => ({
  ImpressionsByWeekdayChart: () => null,
}));
vi.mock("@/components/dashboard/report/interactions-by-asset-chart", () => ({
  InteractionsByAssetChart: () => null,
}));
vi.mock("@/components/dashboard/report/interactions-comparison", () => ({
  InteractionsComparison: () => null,
}));
vi.mock("@/components/dashboard/report/content-composition", () => ({
  ContentComposition: () => null,
}));
vi.mock("@/components/dashboard/report/posting-cadence", () => ({ PostingCadence: () => null }));
vi.mock("@/components/dashboard/report/post-type-distribution-chart", () => ({
  PostTypeDistributionChart: () => null,
}));

import type { ArcboundService } from "@/services/types";

import ClientReportPage from "./page";

const CLIENT_ID = "11111111-1111-1111-1111-111111111111";

function params() {
  return { params: Promise.resolve({ id: CLIENT_ID }), searchParams: Promise.resolve({}) };
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

const REPORT_OK = {
  unavailable: false,
  truncation: null,
  availablePeriods: [],
  period: { key: "all" },
  keyPerformance: { selected: {} },
  totalPostsAllTime: 4,
  interactionsComparison: [],
  impressionsSeries: [],
  impressionsAverage: 0,
  impressionsPostCount: 4,
  impressionsByWeekday: [],
  weekdayUndatedPosts: 0,
  cadence: { totalPosts: 0 },
  interactionsByAsset: [],
  assetPostCount: 4,
  postTypeDistribution: [],
  composition: { totalPosts: 0 },
};

beforeEach(() => {
  getClientMock.mockReset();
  getClientMock.mockResolvedValue({
    id: CLIENT_ID,
    name: "Ada Lovelace",
    linkedin_url: "https://www.linkedin.com/in/adalovelace",
  });
  getClientReportMock.mockReset();
  getClientReportMock.mockResolvedValue(REPORT_OK);
  getClientServicesMock.mockReset();
});

describe("ClientReportPage — gated on linkedin_post_metrics (ADR 0015)", () => {
  it("renders the real report when the Client holds LinkedIn Growth", async () => {
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN], held: [LINKEDIN] });

    render(await ClientReportPage(params()));

    expect(screen.queryByText(/not assigned/i)).toBeNull();
    expect(screen.getByTestId("key-performance")).toBeInTheDocument();
  });

  it("⚠️ says NOT ASSIGNED, never NO DATA, when the Client does not hold it", async () => {
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });

    render(await ClientReportPage(params()));

    expect(screen.getByText(/not assigned/i)).toBeInTheDocument();
    expect(screen.queryByText(/no report data/i)).toBeNull();
  });

  it("⚠️ does NOT render report sections for an unassigned Client", async () => {
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });

    render(await ClientReportPage(params()));

    expect(screen.queryByTestId("key-performance")).toBeNull();
  });

  it("⚠️ renders normally AND warns, when the registry could not be read", async () => {
    getClientServicesMock.mockResolvedValue(null);

    render(await ClientReportPage(params()));

    expect(screen.getByRole("alert")).toHaveTextContent(/could not be read/i);
    expect(screen.queryByText(/not assigned/i)).toBeNull();
    expect(screen.getByTestId("key-performance")).toBeInTheDocument();
  });

  it("renders on a direct URL — no notFound(), no redirect", async () => {
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });

    const { container } = render(await ClientReportPage(params()));

    expect(container.firstChild).not.toBeNull();
  });
});

describe("⚠️ ClientReportPage — the LinkedIn sub-nav (D17/D18)", () => {
  it("renders the Report ⇄ Posts sub-nav under the tab row, on this page", async () => {
    // ⚠️ BOTH PAGES, OR POSTS IS A DEAD END. This page and posts/page.tsx must
    // both render it — see the identical test on posts/page.test.tsx.
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN], held: [LINKEDIN] });

    render(await ClientReportPage(params()));

    expect(screen.getByTestId("section-tabs")).toHaveTextContent("Report,Posts");
  });

  it("renders the sub-nav even when the Client is not assigned — the row states where you are, not a verdict", async () => {
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });

    render(await ClientReportPage(params()));

    expect(screen.getByTestId("section-tabs")).toBeInTheDocument();
  });
});
