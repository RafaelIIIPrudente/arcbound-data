import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
      connections: { label: "Connections", value: null },
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
// ─────────────────────────────────────────────────────────────────────────────
// THE STAFF / CLIENT BOUNDARY, ASSERTED FROM THE CLIENT'S SIDE.
//
// `/r/[token]` renders the SAME period picker the two staff screens do. The
// custom-range calendar is withheld here by a prop that fails closed, and this
// block exists so that a future edit which flips that default cannot land
// quietly: the failure would be a client silently gaining a control over a
// reporting window nobody decided to give them.
// ─────────────────────────────────────────────────────────────────────────────
describe("PublicReportView — A CLIENT IS NEVER GIVEN THE CUSTOM DATE RANGE", () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    window.matchMedia = ((query: string) => ({
      media: query,
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });

  /** Opens the period picker, which is the only place a calendar could appear. */
  async function openPicker() {
    const user = userEvent.setup();
    render(<PublicReportView report={makeReport()} clientName="Acme" freshness={FRESH} />);
    await user.click(screen.getByRole("button", { name: "Reporting period" }));
    // The picker's options are mounted, so the popover is genuinely open — this
    // is what stops the assertions below passing against a closed popover.
    await screen.findByRole("button", { name: "All time" });
  }

  it("renders NO CALENDAR, WITH THE PICKER OPEN", async () => {
    await openPicker();

    expect(document.querySelector("[data-slot=calendar]")).toBeNull();
    expect(document.querySelectorAll("[data-slot=calendar] table")).toHaveLength(0);
  });

  it("renders NO CUSTOM AFFORDANCE — no wording a client could act on", async () => {
    await openPicker();

    expect(document.body.textContent ?? "").not.toMatch(/custom/i);
  });

  it("still gives the client its period picker — only the calendar is withheld", async () => {
    // The gate narrows ONE affordance. A client keeps the named periods; if this
    // ever fails, the boundary has been drawn in the wrong place.
    await openPicker();

    expect(screen.getByRole("button", { name: "Reporting period" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All time" })).toBeInTheDocument();
  });
});

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

  it("carries NO metric ⓘ — the definitions are a staff affordance", () => {
    // ⚠️ THE PUBLIC BOUNDARY. `KeyPerformance` is shared with the staff report,
    // which DOES render an ⓘ beside each figure; it is opt-in there and this
    // wrapper does not opt in. Anything that appears here is something a Client
    // sees, so a control arriving by inheritance rather than by decision is the
    // shape of change this test exists to catch.
    render(<PublicReportView report={makeReport()} clientName="Acme" freshness={FRESH} />);

    expect(screen.queryByRole("button", { name: /^What is / })).not.toBeInTheDocument();
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
    { createdAt: "2026-07-05T00:00:00.000Z", followerCount: 400, connectionsCount: 4820 },
    { createdAt: "2026-07-20T00:00:00.000Z", followerCount: 500, connectionsCount: null },
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

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE CLIENT-FACING SURFACE IS WHERE A FABRICATED NUMBER COSTS MOST. Nobody
// on staff sees this page before the client does, and the connection count is
// optional at capture — so an unrecorded count must arrive here as UNKNOWN and
// render as an em dash, never as a zero and never as the follower figure. What
// the client sees is a RAW COUNT: no per-1,000 rate, no "all time", no
// approximation mark.
// ─────────────────────────────────────────────────────────────────────────────
describe("PublicReport — the connection count", () => {
  beforeEach(() => {
    grantMock.mockReset();
    sourceMock.mockReset();
  });

  /** The footer row carrying `label`, so a claim can be scoped to one line. */
  function lineFor(label: RegExp) {
    return screen.getByText(label).closest("div")!.parentElement!;
  }

  it("shows the RAW count from the newest upload that recorded one", async () => {
    grantMock.mockResolvedValueOnce("valid-grant");
    // The newest upload carried none, so the figure falls back to the 5 Jul
    // reading (4,820) rather than reporting nothing.
    sourceMock.mockResolvedValueOnce(SOURCE);

    const ui = await PublicReport({ token: "abc123", period: undefined });
    render(ui);

    expect(screen.getByText(/^connections/i)).toBeInTheDocument();
    expect(screen.getByText("4,820")).toBeInTheDocument();
  });

  it("mentions connections EXACTLY ONCE to the client — the raw line, no rate", async () => {
    // Any reinstated connection-derived figure makes this two, whatever it is
    // named. The client sees one connections figure: the count.
    grantMock.mockResolvedValueOnce("valid-grant");
    sourceMock.mockResolvedValueOnce(SOURCE);

    const ui = await PublicReport({ token: "abc123", period: undefined });
    const { container } = render(ui);

    expect(container.textContent!.match(/connections/gi)).toHaveLength(1);
  });

  it("labels the count neither 'all time' nor approximate", async () => {
    // ⚠️ IT IS A SNAPSHOT FROM ONE SCRAPE. Either qualifier would describe it
    // wrongly to the one audience that cannot ask a follow-up question.
    grantMock.mockResolvedValueOnce("valid-grant");
    sourceMock.mockResolvedValueOnce(SOURCE);

    const ui = await PublicReport({ token: "abc123", period: undefined });
    render(ui);

    const line = lineFor(/^connections/i);
    expect(line).not.toHaveTextContent(/all time/i);
    expect(line).not.toHaveTextContent(/approx/i);
  });

  it("renders an em dash — never 0 — when NO upload carried a connection count, and KEEPS the line", async () => {
    grantMock.mockResolvedValueOnce("valid-grant");
    sourceMock.mockResolvedValueOnce({
      ...SOURCE,
      uploads: SOURCE.uploads.map((u) => ({ ...u, connectionsCount: null })),
    });

    const ui = await PublicReport({ token: "abc123", period: undefined });
    render(ui);

    const line = lineFor(/^connections/i);
    expect(line).toBeInTheDocument();
    expect(within(line).getByText("—")).toBeInTheDocument();
    expect(within(line).queryByText("0")).not.toBeInTheDocument();
  });

  it("never substitutes the follower count for a missing connection count", async () => {
    grantMock.mockResolvedValueOnce("valid-grant");
    sourceMock.mockResolvedValueOnce({
      ...SOURCE,
      uploads: [
        { createdAt: "2026-07-20T00:00:00.000Z", followerCount: 500, connectionsCount: null },
      ],
    });

    const ui = await PublicReport({ token: "abc123", period: undefined });
    render(ui);

    // The FOLLOWER average is computable (500 followers); the connection count is
    // simply absent, and 500 must not leak across into it.
    const followerLine = lineFor(/avg interactions per 1k followers/i);
    const connectionLine = lineFor(/^connections/i);
    expect(within(followerLine).queryByText("—")).not.toBeInTheDocument();
    expect(within(connectionLine).getByText("—")).toBeInTheDocument();
    expect(within(connectionLine).queryByText("500")).not.toBeInTheDocument();
  });
});
