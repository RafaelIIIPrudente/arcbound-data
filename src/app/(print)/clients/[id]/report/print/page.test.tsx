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
vi.mock("@/components/dashboard/report/print/report-cover", () => ({
  ReportCover: () => <div data-testid="report-cover" />,
}));
vi.mock("@/components/dashboard/report/print/print-report", () => ({
  PrintReport: () => <div data-testid="print-report" />,
}));

import type { ArcboundService } from "@/services/types";

import ClientReportPrintPage from "./page";

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

beforeEach(() => {
  getClientMock.mockReset();
  getClientMock.mockResolvedValue({
    id: CLIENT_ID,
    name: "Ada Lovelace",
    linkedin_url: "https://www.linkedin.com/in/adalovelace",
  });
  getClientReportMock.mockReset();
  getClientReportMock.mockResolvedValue({
    unavailable: false,
    period: { key: "all" },
    keyPerformance: { selected: {} },
    truncation: null,
  });
  getClientServicesMock.mockReset();
});

describe("⚠️ the print export is gated exactly as the on-screen report is", () => {
  it("renders the printable report when the Client holds LinkedIn Growth", async () => {
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN], held: [LINKEDIN] });

    render(await ClientReportPrintPage(params()));

    expect(screen.getByTestId("report-cover")).toBeInTheDocument();
    expect(screen.getByTestId("print-report")).toBeInTheDocument();
    expect(screen.queryByText(/not assigned/i)).toBeNull();
  });

  it("⚠️ NEVER produces a client-facing PDF for a Service the Client is not assigned", () => {
    // ⚠️ THIS IS THE ONE THAT LEAVES THE BUILDING. The on-screen report is seen by
    // staff only; this document is what staff hand or send to the Client. An
    // ungated print export would let a report render — and be exported — for an
    // engagement that does not exist, with no gate on screen to have caught it
    // first (a staff member could paste the print URL directly).
    return (async () => {
      getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });

      render(await ClientReportPrintPage(params()));

      expect(screen.getByText(/not assigned/i)).toBeInTheDocument();
      expect(screen.queryByTestId("report-cover")).toBeNull();
      expect(screen.queryByTestId("print-report")).toBeNull();
    })();
  });

  it("⚠️ renders normally AND warns, when the registry could not be read", async () => {
    getClientServicesMock.mockResolvedValue(null);

    render(await ClientReportPrintPage(params()));

    expect(screen.getByRole("alert")).toHaveTextContent(/could not be read/i);
    expect(screen.getByTestId("report-cover")).toBeInTheDocument();
  });

  it("still 404s for a client that does not exist (unchanged, pre-slice behaviour)", async () => {
    getClientMock.mockResolvedValueOnce(null);
    getClientServicesMock.mockResolvedValue({ services: [], held: [] });

    // `notFound()` signals via a thrown Next.js control-flow error, same as
    // every other page in this app — this only proves it still fires, not its
    // exact internal shape.
    await expect(ClientReportPrintPage(params())).rejects.toBeTruthy();
  });
});
