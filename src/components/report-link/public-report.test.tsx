import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { BiPostRow } from "@/services/analytics";
import type { ClientReport, PostingCadence } from "@/services/types";

// The reused period picker calls next/navigation; stub it so the wrapper renders
// hermetically (no App Router context in the test).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/r/abc123",
}));

// The async wrapper fetches through the gate cookie + the token/grant read; mock
// both seams. buildClientReport (from client-report) runs FOR REAL below, proving
// the whole pipeline produces a rendered report from real rows.
const { grantMock, sourceMock } = vi.hoisted(() => ({ grantMock: vi.fn(), sourceMock: vi.fn() }));
vi.mock("@/lib/report-link-session", () => ({ getGateReadGrant: grantMock }));
vi.mock("@/services/report-links", () => ({ readReportLinkSource: sourceMock }));

import { PublicReport, PublicReportView } from "./public-report";

const CLIENT = "11111111-1111-1111-1111-111111111111";

function cadence(over: Partial<PostingCadence> = {}): PostingCadence {
  return {
    totalPosts: 5,
    datedPosts: 5,
    undatedPosts: 0,
    postsPerWeek: 1.2,
    medianGapDays: 5,
    longestGapDays: 12,
    daysSinceLastPost: 2,
    timeline: [Date.UTC(2026, 4, 1), Date.UTC(2026, 6, 18)],
    weekly: [],
    monthly: [],
    ...over,
  };
}

function makeReport(over: Partial<ClientReport> = {}): ClientReport {
  return {
    period: { kind: "all", key: "all", label: "All time" },
    availablePeriods: [{ kind: "all", key: "all", label: "All time" }],
    totalPostsAllTime: 5,
    keyPerformance: {
      selected: [
        { label: "Total posts", value: 5 },
        { label: "Avg interactions", value: 12 },
        { label: "Total interactions", value: 60 },
      ],
      matrix: [],
      perThousandFollowers: { label: "x", value: null, approximate: true },
    },
    interactionsComparison: [
      {
        scope: "selected",
        label: "All time",
        likes: 40,
        comments: 10,
        shares: 5,
        saves: null,
        savesPartial: false,
      },
    ],
    impressionsSeries: [
      { label: "May", value: 100 },
      { label: "Jun", value: 180 },
    ],
    impressionsBucket: "month",
    impressionsAverage: 140,
    impressionsByWeekday: [
      { label: "Sun", value: 0 },
      { label: "Mon", value: 120 },
      { label: "Tue", value: 0 },
      { label: "Wed", value: 200 },
      { label: "Thu", value: 0 },
      { label: "Fri", value: 0 },
      { label: "Sat", value: 0 },
    ],
    weekdayUndatedPosts: 0,
    interactionsByAsset: [{ format: "IMAGE", label: "Image", value: 12, count: 3 }],
    postTypeDistribution: [{ format: "IMAGE", label: "Image", value: 60, count: 3 }],
    cadence: cadence(),
    composition: {
      totalPosts: 5,
      analysedPosts: 5,
      unanalysablePosts: 0,
      hashtags: [{ tag: "saas", count: 2 }],
      medianLength: 500,
      pastFold: 1,
      withQuestion: 2,
      withLink: 1,
      withMention: 3,
      withEmoji: 4,
    },
    impressionsPostCount: 5,
    assetPostCount: 5,
    ...over,
  };
}

const FRESH = { currentAsOf: "2026-07-20T00:00:00.000Z", trackedSince: "2026-05-01T00:00:00.000Z" };

// ── PublicReportView (pure rendering) ────────────────────────────────────────
describe("PublicReportView — the client-facing wrapper (pure)", () => {
  it("renders the client name, the Report Status strip, and the report sections", () => {
    render(<PublicReportView report={makeReport()} clientName="Acme Corp" freshness={FRESH} />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText(/report status/i)).toBeInTheDocument();
    expect(screen.getByText(/key performance/i)).toBeInTheDocument();
    expect(screen.getByText(/engagement trends/i)).toBeInTheDocument();
    expect(screen.getByText(/content mix/i)).toBeInTheDocument();
    expect(screen.getByText(/content composition/i)).toBeInTheDocument();
    expect(screen.getByText(/posting cadence/i)).toBeInTheDocument();
  });

  it("keeps the period picker", () => {
    render(<PublicReportView report={makeReport()} clientName="Acme" freshness={FRESH} />);
    expect(screen.getByLabelText(/reporting period/i)).toBeInTheDocument();
  });

  it("OMITS all staff chrome: no /clients links (tabs, back-link, print), no dev banner", () => {
    const { container } = render(
      <PublicReportView
        report={makeReport({ truncation: { read: 200, total: 640 } })}
        clientName="Acme"
        freshness={FRESH}
      />,
    );
    expect(container.querySelectorAll('a[href*="/clients"]').length).toBe(0);
    expect(screen.queryByText(/client list/i)).toBeNull();
    expect(screen.queryByText(/print \/ export/i)).toBeNull();
    expect(container.textContent ?? "").not.toMatch(/read \d+ of \d+/i);
  });

  it("hides Posting cadence and Content composition when the period has no posts", () => {
    render(
      <PublicReportView
        clientName="Acme"
        freshness={FRESH}
        report={makeReport({
          cadence: cadence({ totalPosts: 0, datedPosts: 0, timeline: [] }),
          composition: {
            totalPosts: 0,
            analysedPosts: 0,
            unanalysablePosts: 0,
            hashtags: [],
            medianLength: null,
            pastFold: 0,
            withQuestion: 0,
            withLink: 0,
            withMention: 0,
            withEmoji: 0,
          },
        })}
      />,
    );
    expect(screen.queryByText(/posting cadence/i)).toBeNull();
    expect(screen.queryByText(/content composition/i)).toBeNull();
  });
});

// ── PublicReport (async — fetches through the grant) ─────────────────────────
function post(over: Partial<BiPostRow> = {}): BiPostRow {
  return {
    client_id: CLIENT,
    client_name: "Acme Corp",
    linkedin_post_id: "p1",
    post_url: null,
    post_content: "Hello #saas world",
    post_age: null,
    estimated_post_date: "2026-07-15T00:00:00.000Z",
    impressions: 100,
    likes: 10,
    comments: 2,
    reposts: 1,
    saves: null,
    interactions: 13,
    provided_engagement_rate: null,
    calculated_engagement_rate: null,
    scraped_at: "2026-07-20T00:00:00.000Z",
    uploaded_at: "2026-07-20T00:00:00.000Z",
    ...over,
  };
}

const SOURCE = {
  clientId: CLIENT,
  clientName: "Acme Corp",
  posts: [post()],
  uploads: [
    { createdAt: "2026-07-05T00:00:00.000Z", followerCount: 400 },
    { createdAt: "2026-07-20T00:00:00.000Z", followerCount: 500 },
  ],
  attributes: [
    { linkedin_post_id: "p1", post_format_type: "IMAGE", recorded_at: "2026-07-20T00:00:00.000Z" },
  ],
};

describe("PublicReport — fetches through the token + grant (async)", () => {
  beforeEach(() => {
    grantMock.mockReset();
    sourceMock.mockReset();
  });

  it("renders REAL report data (through buildClientReport) given a valid grant", async () => {
    grantMock.mockResolvedValueOnce("valid-grant");
    sourceMock.mockResolvedValueOnce(SOURCE);

    const ui = await PublicReport({ token: "abc123", period: undefined });
    const { container } = render(ui);

    expect(sourceMock).toHaveBeenCalledWith("abc123", "valid-grant");
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText(/report status/i)).toBeInTheDocument();
    // Freshness comes from the uploads the read returned (latest = 20 Jul 2026).
    expect(screen.getByText(/20 Jul 2026/)).toBeInTheDocument();
    // Still no leak into the authenticated app.
    expect(container.querySelectorAll('a[href*="/clients"]').length).toBe(0);
  });

  it("shows the neutral 'not available' state when the cookie carries NO grant (URL alone reads nothing)", async () => {
    grantMock.mockResolvedValueOnce(null);

    const ui = await PublicReport({ token: "abc123", period: undefined });
    render(ui);

    // ⚠️ TWO-FACTOR TO THE DATA: without a grant we never even call the read.
    expect(sourceMock).not.toHaveBeenCalled();
    expect(screen.getByText(/not available right now|check back/i)).toBeInTheDocument();
  });

  it("shows 'not available' when the grant is invalid/expired (read returns null)", async () => {
    grantMock.mockResolvedValueOnce("stale-grant");
    sourceMock.mockResolvedValueOnce(null);

    const ui = await PublicReport({ token: "abc123", period: undefined });
    const { container } = render(ui);

    expect(screen.getByText(/not available right now|check back/i)).toBeInTheDocument();
    expect(screen.queryByText(/key performance/i)).toBeNull();
    expect(container.querySelectorAll('a[href*="/clients"]').length).toBe(0);
  });
});
