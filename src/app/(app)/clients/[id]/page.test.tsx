import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientMock,
  listUploadsMock,
  getReportLinkMock,
  getRoleMock,
  servicesMock,
  assignedMock,
} = vi.hoisted(() => ({
  getClientMock: vi.fn(),
  listUploadsMock: vi.fn(),
  getReportLinkMock: vi.fn(),
  getRoleMock: vi.fn(),
  servicesMock: vi.fn(),
  assignedMock: vi.fn(),
}));

vi.mock("@/services/clients", () => ({ getClient: getClientMock }));
vi.mock("@/services/uploads", () => ({ listUploads: listUploadsMock }));
vi.mock("@/services/report-links", () => ({ getReportLink: getReportLinkMock }));
vi.mock("@/lib/auth/roles", () => ({
  getRole: getRoleMock,
  isAdmin: (role: string | null) => role === "admin",
}));
vi.mock("@/services/arcbound-services", () => ({
  listServices: servicesMock,
  listClientServices: assignedMock,
}));

// Heavy children stubbed — this test is about what the page READS and PASSES.
vi.mock("@/components/dashboard/client/client-tabs", () => ({ ClientTabs: () => null }));
vi.mock("@/components/dashboard/client/report-link-card", () => ({ ReportLinkCard: () => null }));
vi.mock("@/components/dashboard/client/upload-history", () => ({ UploadHistory: () => null }));
vi.mock("@/components/dashboard/client/follower-trend", () => ({
  FollowerTrendPanel: () => null,
  ConnectionsTrendPanel: () => null,
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
  servicesMock.mockReset();
  servicesMock.mockResolvedValue([SERVICE]);
  assignedMock.mockReset();
  assignedMock.mockResolvedValue([
    { clientId: CLIENT_ID, serviceId: SERVICE_A, createdAt: "2026-08-02", createdBy: null },
  ]);
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
    // ⚠️ THIS IS NOT HYPOTHETICAL: S1's SQL is not applied yet, so `listServices()`
    // throws against the live database TODAY. The Client Overview is an existing,
    // working screen — adding a card to it must not make an unapplied migration
    // break the client's uploads, KPIs and report link too.
    servicesMock.mockRejectedValueOnce(new Error('relation "services" does not exist'));

    render(await ClientDetailPage(params()));

    // The page still renders…
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    // …and says what went wrong rather than pretending the client has none.
    expect(screen.getByRole("alert")).toHaveTextContent(/services could not be read/i);
    expect(screen.queryByTestId("services-card")).toBeNull();
  });

  it("⚠️ does not report 'no services' when the read failed", async () => {
    // ⚠️ ABSENT IS NOT ZERO. Passing `[]` on failure would tell an admin this
    // client has no services — and once S4 lands, that reads as "cannot upload",
    // which would send them off to fix a problem that does not exist.
    assignedMock.mockRejectedValueOnce(new Error("boom"));

    render(await ClientDetailPage(params()));

    expect(screen.queryByTestId("services-card")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be read/i);
  });
});
