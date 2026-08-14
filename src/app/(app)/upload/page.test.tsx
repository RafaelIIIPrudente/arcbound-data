import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { registryMock, servicesMock, assignmentsMock, getRoleMock } = vi.hoisted(() => ({
  registryMock: vi.fn(),
  servicesMock: vi.fn(),
  assignmentsMock: vi.fn(),
  getRoleMock: vi.fn(),
}));
vi.mock("@/services/clients", () => ({ listClientRegistry: registryMock }));
vi.mock("@/services/arcbound-services", () => ({
  listServices: servicesMock,
  listAllClientServices: assignmentsMock,
}));
vi.mock("@/lib/auth/roles", () => ({
  getRole: getRoleMock,
  isAdmin: (role: string | null) => role === "admin",
}));
vi.mock("@/components/dashboard/ingest/ingest-panel", () => ({
  IngestPanel: (props: { registry: unknown; isAdmin: boolean; clients: { id: string }[] }) => (
    <div
      data-testid="ingest-panel"
      data-registry={props.registry === null ? "unreadable" : "ok"}
      data-is-admin={String(props.isAdmin)}
      data-clients={props.clients.length}
    />
  ),
}));

import UploadPage from "./page";

const SERVICE = {
  id: "s-linkedin",
  slug: "linkedin-growth",
  name: "LinkedIn Growth",
  description: null,
  handler: "linkedin_post_metrics" as const,
  status: "active" as const,
  sortOrder: 10,
};

beforeEach(() => {
  registryMock.mockReset();
  registryMock.mockResolvedValue([{ id: "c1", name: "Ada Lovelace" }]);
  servicesMock.mockReset();
  servicesMock.mockResolvedValue([SERVICE]);
  assignmentsMock.mockReset();
  assignmentsMock.mockResolvedValue([
    { clientId: "c1", serviceId: SERVICE.id, createdAt: "2026-08-03", createdBy: null },
  ]);
  getRoleMock.mockReset();
  getRoleMock.mockResolvedValue("admin");
});

describe("the upload page — what it reads", () => {
  it("hands the panel the registry, the assignments and the viewer's role", async () => {
    render(await UploadPage());

    const panel = screen.getByTestId("ingest-panel");
    expect(panel).toHaveAttribute("data-registry", "ok");
    expect(panel).toHaveAttribute("data-is-admin", "true");
    expect(panel).toHaveAttribute("data-clients", "1");
  });

  it("passes isAdmin false for an analyst", async () => {
    // /upload is NOT admin-gated — an analyst reaches it and uploads. The role only
    // decides whether the inline assign control is offered.
    getRoleMock.mockResolvedValue("analyst");

    render(await UploadPage());

    expect(screen.getByTestId("ingest-panel")).toHaveAttribute("data-is-admin", "false");
  });
});

describe("⚠️ the services read must never take this page down", () => {
  it("⚠️ degrades to an unreadable registry when listServices throws", async () => {
    // ⚠️ RARE SINCE 2026-08-14, WHEN `supabase/arcbound-services.sql` WAS
    // CONFIRMED APPLIED — the read ordinarily succeeds now. It can still fail,
    // and if that propagated it would take the entire weekly ingestion routine
    // offline, which is why this degradation is tested rather than assumed.
    servicesMock.mockRejectedValueOnce(new Error('relation "services" does not exist'));

    render(await UploadPage());

    expect(screen.getByTestId("ingest-panel")).toHaveAttribute("data-registry", "unreadable");
  });

  it("degrades when the assignments read throws", async () => {
    assignmentsMock.mockRejectedValueOnce(new Error("Service assignments are incomplete"));

    render(await UploadPage());

    expect(screen.getByTestId("ingest-panel")).toHaveAttribute("data-registry", "unreadable");
  });

  it("⚠️ NEVER passes an empty registry in place of a failed read", async () => {
    // ⚠️ `[]` WOULD BE A CLAIM, AND A FALSE ONE. It says "this client has no
    // services", which after this slice renders as "you cannot upload" — sending
    // staff to assign Services that may already be assigned, for a transient read
    // error. `null` says "we do not know", which is the truth.
    servicesMock.mockRejectedValueOnce(new Error("boom"));

    render(await UploadPage());

    expect(screen.getByTestId("ingest-panel")).not.toHaveAttribute("data-registry", "ok");
  });
});

describe("the pre-existing client-registry behaviour is unchanged", () => {
  it("⚠️ still THROWS when the client registry itself cannot be read", async () => {
    // ⚠️ THE ORIGINAL ⚠️ BLOCK ON THIS PAGE STILL STANDS. A failed client read is
    // not an empty roster: mapping it to `[]` would render "no clients registered
    // — add one first" and block ingestion over a transient error. That distinction
    // predates this slice and must survive it.
    registryMock.mockResolvedValue(null);

    await expect(UploadPage()).rejects.toThrow(/failed to load clients/i);
  });

  it("still renders the empty state when nobody is registered", async () => {
    registryMock.mockResolvedValue([]);

    render(await UploadPage());

    expect(screen.queryByTestId("ingest-panel")).toBeNull();
  });

  it("⚠️ does not read services at all when there are no clients", async () => {
    // Nothing to upload for, so the extra reads are pure cost — and on a database
    // where the registry does not exist yet, pure noise in the logs.
    registryMock.mockResolvedValue([]);

    await UploadPage();

    expect(servicesMock).not.toHaveBeenCalled();
    expect(assignmentsMock).not.toHaveBeenCalled();
  });
});
