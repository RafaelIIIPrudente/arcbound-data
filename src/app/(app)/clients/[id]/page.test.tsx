import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { METRIC_DEFINITIONS } from "@/lib/metric-definitions";

const {
  getClientMock,
  listUploadsMock,
  getReportLinkMock,
  getRoleMock,
  getClientServicesMock,
  listIndustriesMock,
  listStaffDirectoryMock,
} = vi.hoisted(() => ({
  getClientMock: vi.fn(),
  listUploadsMock: vi.fn(),
  getReportLinkMock: vi.fn(),
  getRoleMock: vi.fn(),
  getClientServicesMock: vi.fn(),
  listIndustriesMock: vi.fn(),
  listStaffDirectoryMock: vi.fn(),
}));

vi.mock("@/services/clients", () => ({ getClient: getClientMock }));
vi.mock("@/services/industries", () => ({ listIndustriesAdmin: listIndustriesMock }));
vi.mock("@/services/staff", () => ({ listStaffDirectory: listStaffDirectoryMock }));
vi.mock("@/services/uploads", () => ({ listUploads: listUploadsMock }));
vi.mock("@/services/report-links", () => ({ getReportLink: getReportLinkMock }));
vi.mock("@/lib/auth/roles", () => ({
  getRole: getRoleMock,
  isAdmin: (role: string | null) => role === "admin",
}));
// ⚠️ ONE cached read now — `getClientServices` REPLACES the page's own local
// `loadServices` (which used to call `listServices` + `listClientServices`
// itself). Mocking the seam at this single function is what proves the page
// actually made the switch rather than keeping a second, parallel read alive.
vi.mock("@/services/arcbound-services", () => ({ getClientServices: getClientServicesMock }));

// Heavy children stubbed — this test is about what the page READS and PASSES.
vi.mock("@/components/dashboard/client/client-tabs", () => ({ ClientTabs: () => null }));
vi.mock("@/components/dashboard/client/report-link-card", () => ({ ReportLinkCard: () => null }));
vi.mock("@/components/dashboard/client/upload-history", () => ({ UploadHistory: () => null }));
vi.mock("@/components/dashboard/client/follower-trend", () => ({
  FollowerTrendPanel: () => null,
  ConnectionsTrendPanel: () => null,
}));
vi.mock("@/components/dashboard/client/client-industry-writer-card", () => ({
  ClientIndustryWriterCard: (props: {
    industry: { id: string } | null;
    writer: { userId: string } | null;
    industries: unknown[] | null;
    staff: unknown[] | null;
    isAdmin: boolean;
  }) => (
    <div
      data-testid="industry-writer-card"
      data-industry={props.industry?.id ?? ""}
      data-writer={props.writer?.userId ?? ""}
      // ⚠️ "null" AND "0" MUST BE TELLABLE APART HERE. A failed registry read
      // reaching the card as `[]` is the silent-wipe path (see the card header),
      // so the test asserts on which of the two arrived.
      data-industries={props.industries === null ? "null" : String(props.industries.length)}
      data-staff={props.staff === null ? "null" : String(props.staff.length)}
      data-is-admin={String(props.isAdmin)}
    />
  ),
}));
vi.mock("@/components/dashboard/client/client-services-card", () => ({
  ClientServicesCard: (props: { assignedIds: string[]; isAdmin: boolean }) => (
    <div
      data-testid="services-card"
      data-assigned={props.assignedIds.join(",")}
      data-is-admin={String(props.isAdmin)}
    />
  ),
}));

import ClientDetailPage from "./page";

const CLIENT_ID = "11111111-1111-1111-1111-111111111111";
const SERVICE_A = "aaaaaaaa-0000-0000-0000-000000000001";

const SERVICE = {
  id: SERVICE_A,
  slug: "linkedin-growth",
  name: "LinkedIn Growth",
  description: null,
  handler: "linkedin_post_metrics" as const,
  status: "active" as const,
  sortOrder: 10,
};

const INDUSTRY = {
  id: "bbbbbbbb-0000-0000-0000-000000000001",
  name: "SaaS",
  status: "active" as const,
};
const STAFF_ENTRY = {
  userId: "cccccccc-0000-0000-0000-000000000001",
  email: "ana@arcbound.com",
};

function params() {
  return { params: Promise.resolve({ id: CLIENT_ID }) };
}

beforeEach(() => {
  getClientMock.mockReset();
  getClientMock.mockResolvedValue({
    id: CLIENT_ID,
    name: "Ada Lovelace",
    linkedin_url: "https://www.linkedin.com/in/adalovelace",
    created_at: "2026-01-01T00:00:00.000Z",
    posts: 0,
  });
  listUploadsMock.mockReset();
  listUploadsMock.mockResolvedValue([]);
  getReportLinkMock.mockReset();
  getReportLinkMock.mockResolvedValue(null);
  getRoleMock.mockReset();
  getRoleMock.mockResolvedValue("admin");
  getClientServicesMock.mockReset();
  getClientServicesMock.mockResolvedValue({ services: [SERVICE], held: [SERVICE] });
  listIndustriesMock.mockReset();
  listIndustriesMock.mockResolvedValue([INDUSTRY]);
  listStaffDirectoryMock.mockReset();
  listStaffDirectoryMock.mockResolvedValue([STAFF_ENTRY]);
});

describe("the Client Overview — Services", () => {
  it("renders the client's assigned services", async () => {
    render(await ClientDetailPage(params()));

    const card = screen.getByTestId("services-card");
    expect(card).toHaveAttribute("data-assigned", SERVICE_A);
  });

  it("⚠️ passes isAdmin explicitly, so an analyst gets the read-only card", async () => {
    // ⚠️ THE SAME DISCIPLINE AS `ReportLinkCard` ON THIS PAGE. The prop is required
    // and the page answers it from the session — never defaulted.
    getRoleMock.mockResolvedValue("analyst");

    render(await ClientDetailPage(params()));

    expect(screen.getByTestId("services-card")).toHaveAttribute("data-is-admin", "false");
  });

  it("⚠️ survives a services read failure instead of taking the whole page down", async () => {
    // ⚠️ RARE SINCE 2026-08-14, WHEN `supabase/arcbound-services.sql` WAS
    // CONFIRMED APPLIED — but still reachable, because a registry read can fail
    // for reasons that have nothing to do with migrations. The Client Overview
    // is an existing, working screen, and a failed services read must not break
    // the client's uploads, KPIs and report link with it.
    getClientServicesMock.mockResolvedValueOnce(null);

    render(await ClientDetailPage(params()));

    // The page still renders…
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    // …and says what went wrong rather than pretending the client has none.
    expect(screen.getByRole("alert")).toHaveTextContent(/services could not be read/i);
    expect(screen.queryByTestId("services-card")).toBeNull();
  });

  it("⚠️ does not report 'no services' when the read failed", async () => {
    // ⚠️ ABSENT IS NOT ZERO. Passing `[]` on failure would tell an admin this
    // client has no services — which, since S4/S5, reads as "cannot upload" and
    // "no sections available", sending them off to fix a problem that may not
    // exist.
    getClientServicesMock.mockResolvedValueOnce(null);

    render(await ClientDetailPage(params()));

    expect(screen.queryByTestId("services-card")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be read/i);
  });

  it("calls getClientServices with the Client's id", async () => {
    render(await ClientDetailPage(params()));

    expect(getClientServicesMock).toHaveBeenCalledWith(CLIENT_ID);
  });
});

describe("the Client Overview — the ⓘ on each headline card", () => {
  it("defines all four cards", async () => {
    render(await ClientDetailPage(params()));

    for (const name of ["Uploads", "Posts", "Followers", "Connections"]) {
      expect(screen.getByRole("button", { name: `What is ${name}?` }), name).toBeInTheDocument();
    }
  });

  it("warns that the figure beside Posts is NOT the change in Posts", async () => {
    // ⚠️ THE MISREADING THIS TAB INVITES, AND THE REASON THESE CARDS HAVE AN ⓘ.
    // `postsDelta` is the last upload's `rowsInserted` — ArcBase's own ingest
    // audit — while the Posts count comes from the reporting data. Attribution
    // happens after an upload, so the two move independently. Read as a delta,
    // it is a wrong number sitting inside a correct card.
    const d = METRIC_DEFINITIONS.overviewPosts.definition;

    expect(d).toMatch(/NOT the change in this number/);
    expect(d).toMatch(/adjacent pipelines/);
  });

  it("says an absent Uploads figure is a failed READ, not an absence of uploads", async () => {
    expect(METRIC_DEFINITIONS.overviewUploads.definition).toMatch(/could not be read/i);
    expect(METRIC_DEFINITIONS.overviewUploads.definition).toMatch(/not that there have been none/i);
  });

  it("says a Connections dash is ORDINARY, and never softens to 0", async () => {
    // The em dash is the common case on this card — the count is optional at
    // capture — so a reader must not take it as a signal about the client.
    const d = METRIC_DEFINITIONS.overviewConnections.definition;

    expect(d).toMatch(/ORDINARY case/);
    expect(d).toMatch(/never softens to 0/);
  });

  it("says the audience deltas skip uploads that recorded no count", async () => {
    // Otherwise a reader assumes the comparison is against the immediately
    // previous upload, which it is not when that upload captured nothing.
    expect(METRIC_DEFINITIONS.overviewFollowers.definition).toMatch(
      /skipped rather than read as zero/,
    );
  });
});

describe("the Client Overview — Industry & writer (S4)", () => {
  it("hands the card the client's CURRENT values, which every save re-sends", async () => {
    // ⚠️ THE CARD CANNOT PRESERVE WHAT IT WAS NEVER GIVEN. `set_client_industry_writer`
    // applies both arguments including NULL, so the current industry and writer
    // are what a writer-only change has to carry through — they are inputs to the
    // form, not decoration.
    getClientMock.mockResolvedValue({
      id: CLIENT_ID,
      name: "Ada Lovelace",
      linkedin_url: "https://www.linkedin.com/in/adalovelace",
      created_at: "2026-01-01T00:00:00.000Z",
      posts: 0,
      industry: { id: INDUSTRY.id, name: "SaaS" },
      writer: { status: "resolved", userId: STAFF_ENTRY.userId, email: STAFF_ENTRY.email },
    });

    render(await ClientDetailPage(params()));

    const card = screen.getByTestId("industry-writer-card");
    expect(card).toHaveAttribute("data-industry", INDUSTRY.id);
    expect(card).toHaveAttribute("data-writer", STAFF_ENTRY.userId);
  });

  it("⚠️ passes isAdmin explicitly, so an analyst gets the read-only card", async () => {
    getRoleMock.mockResolvedValue("analyst");

    render(await ClientDetailPage(params()));

    expect(screen.getByTestId("industry-writer-card")).toHaveAttribute("data-is-admin", "false");
  });

  it("⚠️ passes `null` — NOT `[]` — when the industries read fails", async () => {
    // ⚠️ THE DISTINCTION IS THE SAFETY PROPERTY, NOT A NICETY. `[]` would make the
    // card render a picker with no option matching this Client's industry, and the
    // next save — of the WRITER — would silently clear it. `null` tells the card to
    // keep the current value in a hidden input instead.
    listIndustriesMock.mockRejectedValueOnce(new Error("denied"));

    render(await ClientDetailPage(params()));

    expect(screen.getByTestId("industry-writer-card")).toHaveAttribute("data-industries", "null");
  });

  it("passes `null` when the staff directory read fails", async () => {
    listStaffDirectoryMock.mockRejectedValueOnce(new Error("denied"));

    render(await ClientDetailPage(params()));

    expect(screen.getByTestId("industry-writer-card")).toHaveAttribute("data-staff", "null");
  });

  it("⚠️ neither read can take the page down", async () => {
    // Both are pickers for one card. The uploads, KPIs and report link on this page
    // have nothing to do with them and must survive their failure.
    listIndustriesMock.mockRejectedValueOnce(new Error("denied"));
    listStaffDirectoryMock.mockRejectedValueOnce(new Error("denied"));

    render(await ClientDetailPage(params()));

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByTestId("industry-writer-card")).toBeInTheDocument();
  });
});
