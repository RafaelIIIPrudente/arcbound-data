import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getClientMock, getClientPostsMock, getClientServicesMock } = vi.hoisted(() => ({
  getClientMock: vi.fn(),
  getClientPostsMock: vi.fn(),
  getClientServicesMock: vi.fn(),
}));
vi.mock("@/services/clients", () => ({ getClient: getClientMock }));
vi.mock("@/services/client-posts", () => ({ getClientPosts: getClientPostsMock }));
vi.mock("@/services/arcbound-services", () => ({ getClientServices: getClientServicesMock }));
// The tab row reads getClientServices itself; stub it so this file tests only
// what THIS page decides, not the tab strip's own filtering (covered in
// client-tabs.test.tsx). The period picker needs a Next.js router context this
// file does not set up — it is not what this test file is about either.
vi.mock("@/components/dashboard/client/client-tabs", () => ({ ClientTabs: () => null }));
vi.mock("@/components/dashboard/report/report-period-picker", () => ({
  ReportPeriodPicker: () => null,
}));
// A stub carrying a recognisable marker, so this file can assert whether the real
// content rendered at all WITHOUT depending on the table's own column shape —
// that shape belongs to posts-table.test.tsx, not to a test about gating.
vi.mock("@/components/dashboard/posts/posts-table", () => ({
  PostsTable: () => <div data-testid="posts-table" />,
}));

import type { ArcboundService } from "@/services/types";

import ClientPostsPage from "./page";

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

const POSTS_OK = {
  unavailable: false,
  truncation: null,
  cappedTo: null,
  totalInPeriod: 12,
  rows: [{ linkedin_post_id: "1" }],
  availablePeriods: [],
  period: { key: "all" },
};

beforeEach(() => {
  getClientMock.mockReset();
  getClientMock.mockResolvedValue({
    id: CLIENT_ID,
    name: "Ada Lovelace",
    linkedin_url: "https://www.linkedin.com/in/adalovelace",
    postsCount: 12,
  });
  getClientPostsMock.mockReset();
  getClientPostsMock.mockResolvedValue(POSTS_OK);
  getClientServicesMock.mockReset();
});

describe("ClientPostsPage — gated on linkedin_post_metrics (ADR 0015)", () => {
  it("renders the real posts data when the Client holds LinkedIn Growth", async () => {
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN], held: [LINKEDIN] });

    render(await ClientPostsPage(params()));

    expect(screen.queryByText(/not assigned/i)).toBeNull();
    expect(screen.getByTestId("posts-table")).toBeInTheDocument();
  });

  it("⚠️ says NOT ASSIGNED, never NO DATA, when the Client does not hold it", async () => {
    // ⚠️ THE CENTRAL ASSERTION OF THIS SLICE. This Client might hold real,
    // withheld posts data — an admin un-assigned LinkedIn Growth after ingesting
    // some, or the S1 backfill missed them. "No posts" would assert a measurement
    // this page never made.
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });

    render(await ClientPostsPage(params()));

    expect(screen.getByText(/not assigned/i)).toBeInTheDocument();
    expect(screen.queryByText(/no posts/i)).toBeNull();
  });

  it("⚠️ does NOT render the real posts data for an unassigned Client", async () => {
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });

    render(await ClientPostsPage(params()));

    expect(screen.queryByTestId("posts-table")).toBeNull();
  });

  it("⚠️ renders normally AND warns, when the registry could not be read", async () => {
    // ⚠️ THIS IS THE LIVE PATH TODAY (S1's SQL is not applied). `canSee` fails
    // OPEN on a null read, so the real content still renders — the notice is what
    // stops an empty result underneath from being mistaken for "ran and found
    // nothing" when the true state is "we don't know if this even applies".
    getClientServicesMock.mockResolvedValue(null);

    render(await ClientPostsPage(params()));

    expect(screen.getByRole("alert")).toHaveTextContent(/could not be read/i);
    expect(screen.queryByText(/not assigned/i)).toBeNull();
  });

  it("renders on a direct URL — no notFound(), no redirect", async () => {
    // The Client exists; the page just states a fact about their assignment. A 404
    // would be a lie, and a redirect would hide a state staff may legitimately
    // want to see (e.g. right before assigning the Service).
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });

    const { container } = render(await ClientPostsPage(params()));

    expect(container.firstChild).not.toBeNull();
  });
});
