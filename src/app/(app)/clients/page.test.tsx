import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// THE CLIENT LIST PAGE — THE WIRING NOBODY HAD TESTED.
//
// This page had no test file at all until S5, and S4 added three admin-only
// registry reads to it: the services list, the industries registry and the staff
// directory, fetched together and each degrading to `null` on failure. That is
// the "View tested, wiring not" shape this repo has been bitten by before — the
// components those props feed are covered in detail, and the code deciding WHAT
// reaches them was covered by nothing.
//
// ⚠️ `null` AND `[]` ARE THE POINT. `null` means the read FAILED; `[]` means the
// registry is genuinely empty — which, for industries, is the state it is in
// today and will be until an admin adds rows. The dialog says something
// different for each ("could not be read" vs "add them under Settings,
// Industries"), so a page that collapsed one into the other would send someone
// to add rows that already exist, or hide an outage behind an empty picker.
// ─────────────────────────────────────────────────────────────────────────────

const { listClientsMock, listServicesMock, listIndustriesMock, listWritersMock, getRoleMock } =
  vi.hoisted(() => ({
    listClientsMock: vi.fn(),
    listServicesMock: vi.fn(),
    listIndustriesMock: vi.fn(),
    listWritersMock: vi.fn(),
    getRoleMock: vi.fn(),
  }));

vi.mock("@/services/clients", () => ({ listClients: listClientsMock }));
vi.mock("@/services/arcbound-services", () => ({ listServices: listServicesMock }));
vi.mock("@/services/industries", () => ({ listIndustriesAdmin: listIndustriesMock }));
vi.mock("@/services/writers", () => ({ listWritersAdmin: listWritersMock }));
vi.mock("@/lib/auth/roles", () => ({
  getRole: getRoleMock,
  isAdmin: (role: string | null) => role === "admin",
}));

// ⚠️ THE STUB REPORTS "null" AND "0" AS DIFFERENT STRINGS, because that is the
// distinction under test. A stub that rendered `props.industries?.length ?? 0`
// would pass whichever one arrived.
vi.mock("@/components/dashboard/client/add-client-dialog", () => ({
  AddClientDialog: (props: {
    services: unknown[] | null;
    industries: unknown[] | null;
    writers: unknown[] | null;
  }) => (
    <div
      data-testid="add-client-dialog"
      data-services={props.services === null ? "null" : String(props.services.length)}
      data-industries={props.industries === null ? "null" : String(props.industries.length)}
      data-writers={props.writers === null ? "null" : String(props.writers.length)}
    />
  ),
}));
vi.mock("@/components/dashboard/client/clients-table", () => ({
  ClientsTable: (props: { data: { id: string }[]; q?: string }) => (
    <div
      data-testid="clients-table"
      data-ids={props.data.map((c) => c.id).join(",")}
      data-q={props.q ?? ""}
    />
  ),
}));

import ClientsPage from "./page";

const SERVICE = { id: "s1", slug: "linkedin-growth", name: "LinkedIn Growth" };
const INDUSTRY = { id: "i1", name: "SaaS", status: "active" as const };
const WRITER = { id: "u1", name: "Ana Wells", status: "active" as const };

function client(id: string, name: string) {
  return {
    id,
    name,
    linkedin_url: `https://linkedin.com/in/${id}`,
    createdAt: "2026-01-04T09:00:00.000Z",
    postsCount: 0,
    lastUpload: null,
    industry: null,
    writer: null,
  };
}

function props(q?: string) {
  return { searchParams: Promise.resolve(q === undefined ? {} : { q }) };
}

beforeEach(() => {
  listClientsMock.mockReset();
  listClientsMock.mockResolvedValue({ items: [client("c1", "Ada Lovelace")], total: 1 });
  listServicesMock.mockReset();
  listServicesMock.mockResolvedValue([SERVICE]);
  listIndustriesMock.mockReset();
  listIndustriesMock.mockResolvedValue([INDUSTRY]);
  listWritersMock.mockReset();
  listWritersMock.mockResolvedValue([WRITER]);
  getRoleMock.mockReset();
  getRoleMock.mockResolvedValue("admin");
});

describe("the Client List page — what it reads, and for whom", () => {
  it("hands the table its rows and the filter from the URL", async () => {
    listClientsMock.mockResolvedValue({
      items: [client("c1", "Ada"), client("c2", "Grace")],
      total: 2,
    });

    render(await ClientsPage(props("ada")));

    const table = screen.getByTestId("clients-table");
    expect(table).toHaveAttribute("data-ids", "c1,c2");
    expect(table).toHaveAttribute("data-q", "ada");
    expect(listClientsMock).toHaveBeenCalledWith({ q: "ada", pageSize: 500 });
  });

  it("gives an admin all three registries", async () => {
    render(await ClientsPage(props()));

    const dialog = screen.getByTestId("add-client-dialog");
    expect(dialog).toHaveAttribute("data-services", "1");
    expect(dialog).toHaveAttribute("data-industries", "1");
    expect(dialog).toHaveAttribute("data-writers", "1");
  });

  it("⚠️ triggers NO registry read at all for an analyst", async () => {
    // ⚠️ NOT MERELY HIDING THE DIALOG. An analyst cannot register a client, so
    // the three reads that exist to fill its pickers are work with no consumer —
    // and one of them, the writers registry, is a list of colleagues' email
    // addresses that a read-only viewer has no reason to have fetched.
    getRoleMock.mockResolvedValue("analyst");

    render(await ClientsPage(props()));

    expect(screen.queryByTestId("add-client-dialog")).toBeNull();
    expect(listServicesMock).not.toHaveBeenCalled();
    expect(listIndustriesMock).not.toHaveBeenCalled();
    expect(listWritersMock).not.toHaveBeenCalled();
    // …and the roster itself still renders in full. The analyst loses the
    // dialog, not the page.
    expect(screen.getByTestId("clients-table")).toHaveAttribute("data-ids", "c1");
  });
});

describe("⚠️ a failed registry read and an empty one do NOT converge", () => {
  it("passes `null` for a registry whose read threw", async () => {
    listIndustriesMock.mockRejectedValue(new Error("boom"));
    listWritersMock.mockRejectedValue(new Error("boom"));
    listServicesMock.mockRejectedValue(new Error("boom"));

    render(await ClientsPage(props()));

    const dialog = screen.getByTestId("add-client-dialog");
    expect(dialog).toHaveAttribute("data-services", "null");
    expect(dialog).toHaveAttribute("data-industries", "null");
    expect(dialog).toHaveAttribute("data-writers", "null");
  });

  it("⚠️ passes `[]` for a registry that read fine and holds nothing", async () => {
    // ⚠️ THE STATE THE INDUSTRIES REGISTRY IS ACTUALLY IN TODAY. It is empty and
    // stays empty until an admin adds rows, so `[]` is the ordinary answer here —
    // not an error, and the dialog's "add them under Settings, Industries" is
    // the right thing to say about it.
    listIndustriesMock.mockResolvedValue([]);

    render(await ClientsPage(props()));

    expect(screen.getByTestId("add-client-dialog")).toHaveAttribute("data-industries", "0");
  });

  it("⚠️ tells the two apart — the same screen, two different answers", async () => {
    // Rendered twice in one test on purpose: the assertion is that the values
    // DIFFER, which neither render can establish alone.
    listIndustriesMock.mockResolvedValue([]);
    const { unmount } = render(await ClientsPage(props()));
    const empty = screen.getByTestId("add-client-dialog").getAttribute("data-industries");
    unmount();

    listIndustriesMock.mockRejectedValue(new Error("boom"));
    render(await ClientsPage(props()));
    const failed = screen.getByTestId("add-client-dialog").getAttribute("data-industries");

    expect(empty).toBe("0");
    expect(failed).toBe("null");
    expect(empty).not.toBe(failed);
  });

  it("survives a failed read rather than taking the roster down with it", async () => {
    listIndustriesMock.mockRejectedValue(new Error("boom"));

    render(await ClientsPage(props()));

    expect(screen.getByTestId("clients-table")).toHaveAttribute("data-ids", "c1");
  });
});

describe("the caption tells staff what they cannot change", () => {
  it("⚠️ no longer claims records are immutable — S4 made two columns editable", async () => {
    // ⚠️ THE SENTENCE S4 FALSIFIED. An admin can now record and re-record a
    // Client's industry and writer from the detail page, so "records are
    // immutable" is a promise this product stopped keeping. What is still true —
    // and is the fact with teeth, because the name is the key scraped posts are
    // attributed on — is that the name and the LinkedIn URL cannot be changed.
    render(await ClientsPage(props()));

    expect(screen.queryByText(/records are immutable/i)).toBeNull();
    expect(screen.getByText(/names and URLs locked/i)).toBeInTheDocument();
  });

  it("counts the clients, singular and plural", async () => {
    render(await ClientsPage(props()));
    expect(screen.getByText(/^1 client ·/)).toBeInTheDocument();

    listClientsMock.mockResolvedValue({
      items: [client("c1", "Ada"), client("c2", "Grace")],
      total: 2,
    });
    render(await ClientsPage(props()));
    expect(screen.getByText(/^2 clients ·/)).toBeInTheDocument();
  });
});
