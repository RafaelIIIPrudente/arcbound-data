import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientMock,
  latestSnapshotMock,
  listOutreachUploadsMock,
  getClientServicesMock,
  buildEmailAnalyticsMock,
  getSessionMock,
  getRoleMock,
  snapshotHistoryMock,
  snapshotByIdMock,
  movementPanelMock,
} = vi.hoisted(() => ({
  getClientMock: vi.fn(),
  latestSnapshotMock: vi.fn(),
  listOutreachUploadsMock: vi.fn(),
  getClientServicesMock: vi.fn(),
  buildEmailAnalyticsMock: vi.fn(() => ({ status: "not-in-export" })),
  getSessionMock: vi.fn(),
  getRoleMock: vi.fn(),
  snapshotHistoryMock: vi.fn(),
  snapshotByIdMock: vi.fn(),
  movementPanelMock: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: getSessionMock }));
// ⚠️ `isAdmin` is NOT mocked — it is a pure one-liner and mocking it would let a
// wrong role read as admin without any test noticing.
vi.mock("@/lib/auth/roles", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getRole: getRoleMock,
}));
vi.mock("@/components/dashboard/outreach/snapshot-history", () => ({
  SnapshotHistory: (props: unknown) => {
    snapshotHistoryMock(props);
    return <div data-testid="snapshot-history" />;
  },
}));
vi.mock("@/services/clients", () => ({ getClient: getClientMock }));
vi.mock("@/services/outreach", () => ({
  latestSnapshot: latestSnapshotMock,
  listOutreachUploads: listOutreachUploadsMock,
  snapshotById: snapshotByIdMock,
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
  OutreachMovementPanel: (props: unknown) => {
    movementPanelMock(props);
    return null;
  },
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

const CURRENT_USER = "77777777-7777-7777-7777-777777777777";

/** An `OutreachUpload` as `listOutreachUploads` returns it. */
function upload(over: Record<string, unknown> = {}) {
  return {
    id: "u1",
    clientId: CLIENT_ID,
    rowCount: 1435,
    createdAt: "2026-08-03T09:00:00.000Z",
    hasEmailChannel: true,
    uploadedBy: null,
    voidedAt: null,
    voidedBy: null,
    ...over,
  };
}

beforeEach(() => {
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ id: CURRENT_USER });
  getRoleMock.mockReset();
  getRoleMock.mockResolvedValue("analyst");
  snapshotHistoryMock.mockReset();
  snapshotByIdMock.mockReset();
  snapshotByIdMock.mockResolvedValue({ status: "ok", prospects: [], truncated: false, total: 0 });
  movementPanelMock.mockReset();
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

describe("the snapshot history and its per-row permission", () => {
  const OTHER_USER = "99999999-9999-9999-9999-999999999999";

  function historyProps() {
    return snapshotHistoryMock.mock.calls.at(-1)![0] as {
      rows: { id: string; canVoid: boolean; uploadedBy: string; voidedBy: string }[] | null;
      clientName: string;
    };
  }

  it("renders in the ALL-VOIDED state — the only route to an un-void", async () => {
    // ⚠️ IF THIS REGRESSES, a Client whose snapshots were all voided gets a panel
    // explaining the problem and no way to fix it.
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });
    latestSnapshotMock.mockResolvedValue({ status: "all-voided", voidedCount: 2 });

    render(await ClientOutreachPage(params()));

    expect(screen.getByTestId("snapshot-history")).toBeInTheDocument();
    expect(screen.getByTestId("outreach-all-voided")).toBeInTheDocument();
  });

  it("does NOT render for a Client who does not hold the Outreach service", async () => {
    getClientServicesMock.mockResolvedValue({ services: [LINKEDIN], held: [LINKEDIN] });

    render(await ClientOutreachPage(params()));

    expect(screen.queryByTestId("snapshot-history")).toBeNull();
  });

  it("passes the CLIENT NAME through, for the void confirmation", async () => {
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });

    render(await ClientOutreachPage(params()));

    expect(historyProps().clientName).toBe("Ada Lovelace");
  });

  it("⚠️ passes rows: null straight through when the history could not be read IN FULL", async () => {
    // `listOutreachUploads` nulls a TRUNCATED read as well as a failed one.
    // Flattening it to `[]` here would render a partial history as "no
    // snapshots" — a confident lie.
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });
    listOutreachUploadsMock.mockResolvedValue(null);

    render(await ClientOutreachPage(params()));

    expect(historyProps().rows).toBeNull();
  });

  it("⚠️ grants canVoid on the caller's OWN row and withholds it on another's", async () => {
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });
    listOutreachUploadsMock.mockResolvedValue([
      upload({ id: "mine", uploadedBy: CURRENT_USER }),
      upload({ id: "theirs", uploadedBy: OTHER_USER }),
    ]);

    render(await ClientOutreachPage(params()));

    const rows = historyProps().rows!;
    expect(rows.find((r) => r.id === "mine")!.canVoid).toBe(true);
    expect(rows.find((r) => r.id === "theirs")!.canVoid).toBe(false);
  });

  it("⚠️ withholds canVoid from a NON-ADMIN on a NULL-uploader row", async () => {
    // ⚠️ Under the RPC's fail-closed guard a null uploader matches NOBODY, so a
    // control here would raise 42501 on every press.
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });
    listOutreachUploadsMock.mockResolvedValue([upload({ id: "orphan", uploadedBy: null })]);

    render(await ClientOutreachPage(params()));

    expect(historyProps().rows![0]!.canVoid).toBe(false);
    expect(historyProps().rows![0]!.uploadedBy).toBe("unrecorded");
  });

  it("grants an ADMIN canVoid on every row, including the null-uploader one", async () => {
    // The discriminator: `is_admin()` is the RPC's second arm, and without it
    // nobody could correct a snapshot written from the SQL editor.
    getRoleMock.mockResolvedValue("admin");
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });
    listOutreachUploadsMock.mockResolvedValue([
      upload({ id: "orphan", uploadedBy: null }),
      upload({ id: "theirs", uploadedBy: OTHER_USER }),
    ]);

    render(await ClientOutreachPage(params()));

    expect(historyProps().rows!.every((r) => r.canVoid)).toBe(true);
  });
});

describe("movement compares against the previous LIVE snapshot", () => {
  // ⚠️ `listOutreachUploads` DELIBERATELY INCLUDES VOIDED ROWS (S2) so staff can
  // see and reverse them. Movement reads the same list, so it must step PAST
  // them — comparing against a snapshot someone voided is exactly the stale
  // reading the void feature exists to remove.

  const live = (id: string, createdAt: string) => ({
    id,
    clientId: CLIENT_ID,
    rowCount: 100,
    createdAt,
    hasEmailChannel: true,
    uploadedBy: null,
    voidedAt: null,
    voidedBy: null,
  });
  const voided = (id: string, createdAt: string) => ({
    ...live(id, createdAt),
    voidedAt: "2026-08-14T10:00:00.000Z",
  });

  beforeEach(() => {
    getClientServicesMock.mockResolvedValue({ services: [OUTREACH], held: [OUTREACH] });
  });

  it("⚠️ SKIPS a voided predecessor and compares against the live one beneath it", async () => {
    // u1 is on screen; u2 was voided; u3 is the newest snapshot still counting.
    listOutreachUploadsMock.mockResolvedValue([
      live("u1", "2026-08-10T09:00:00.000Z"),
      voided("u2", "2026-08-05T09:00:00.000Z"),
      live("u3", "2026-08-01T09:00:00.000Z"),
    ]);

    await ClientOutreachPage(params());

    expect(snapshotByIdMock).toHaveBeenCalledWith(CLIENT_ID, "u3");
    expect(snapshotByIdMock).not.toHaveBeenCalledWith(CLIENT_ID, "u2");
  });

  it("reports SINGLE when every older snapshot is voided", async () => {
    // ⚠️ NOT a comparison against a voided row, and not a crash: with no live
    // predecessor there is genuinely nothing to compare against, which is the
    // same state as having uploaded only once.
    listOutreachUploadsMock.mockResolvedValue([
      live("u1", "2026-08-10T09:00:00.000Z"),
      voided("u2", "2026-08-05T09:00:00.000Z"),
    ]);

    // Rendered, not merely awaited: the panel is a CHILD, so awaiting the page
    // function alone runs `readMovement` but never invokes the component.
    render(await ClientOutreachPage(params()));

    expect(snapshotByIdMock).not.toHaveBeenCalled();
    expect(movementPanelMock.mock.calls.at(-1)![0]).toEqual({ state: { status: "single" } });
  });

  it("still compares against an ordinary live predecessor", async () => {
    // The discriminator: a fix that skipped everything would satisfy the tests
    // above while breaking movement entirely.
    listOutreachUploadsMock.mockResolvedValue([
      live("u1", "2026-08-10T09:00:00.000Z"),
      live("u2", "2026-08-05T09:00:00.000Z"),
    ]);

    await ClientOutreachPage(params());

    expect(snapshotByIdMock).toHaveBeenCalledWith(CLIENT_ID, "u2");
  });
});
