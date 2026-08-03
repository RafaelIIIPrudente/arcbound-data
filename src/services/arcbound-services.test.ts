import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: the Supabase seam is mocked. Nothing hits Postgres — see the note in
// supabase/arcbound-services.test.ts about what is and is not proven by tests.
const { rpcMock, fromMock, readAllPagesMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  readAllPagesMock: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: fromMock, rpc: rpcMock }),
}));
// Only the pager is replaced; `asPage` stays real so the reader is exercised.
vi.mock("@/lib/supabase/paged", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/paged")>()),
  readAllPages: readAllPagesMock,
}));

import {
  createService,
  deleteService,
  listAllClientServices,
  listClientServices,
  listServices,
  listServicesAdmin,
  setClientServices,
  setServiceStatus,
  updateService,
} from "./arcbound-services";

/** A thenable query builder: every chained method returns itself, then resolves. */
function table(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "in", "range"]) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

const LINKEDIN_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "linkedin-growth",
  name: "LinkedIn Growth",
  description: "Weekly scrapes.",
  handler: "linkedin_post_metrics",
  status: "active",
  sort_order: 10,
};
/** A real, listed offering with no pipeline behind it. */
const ADVISORY_ROW = {
  id: "22222222-2222-2222-2222-222222222222",
  slug: "advisory",
  name: "Advisory",
  description: null,
  handler: null,
  status: "active",
  sort_order: 30,
};

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

describe("listServices", () => {
  it("⚠️ preserves a NULL handler as null, never coercing it away", () => {
    // ⚠️ "LISTED BUT NOT INGESTIBLE" IS A REAL STATE. Mapping a null handler to a
    // string, or dropping the row, would erase the distinction between an offering
    // Arcbound sells without a pipeline and one that has one — the same collapse
    // this codebase refuses between "absent" and "zero".
    fromMock.mockReturnValueOnce(table({ data: [LINKEDIN_ROW, ADVISORY_ROW], error: null }));

    return expect(listServices()).resolves.toEqual([
      {
        id: LINKEDIN_ROW.id,
        slug: "linkedin-growth",
        name: "LinkedIn Growth",
        description: "Weekly scrapes.",
        handler: "linkedin_post_metrics",
        status: "active",
        sortOrder: 10,
      },
      {
        id: ADVISORY_ROW.id,
        slug: "advisory",
        name: "Advisory",
        description: null,
        handler: null,
        status: "active",
        sortOrder: 30,
      },
    ]);
  });

  it("reads from the services table", async () => {
    fromMock.mockReturnValueOnce(table({ data: [], error: null }));

    await listServices();

    expect(fromMock).toHaveBeenCalledWith("services");
  });

  it("throws rather than reporting an empty registry when the read fails", async () => {
    // An empty list here reads as "Arcbound sells nothing", which a caller cannot
    // distinguish from a broken read.
    fromMock.mockReturnValueOnce(table({ data: null, error: { message: "permission denied" } }));

    await expect(listServices()).rejects.toThrow(/permission denied/);
  });

  it("returns an empty list when there genuinely are no rows", async () => {
    fromMock.mockReturnValueOnce(table({ data: null, error: null }));

    await expect(listServices()).resolves.toEqual([]);
  });
});

describe("listClientServices", () => {
  it("maps a Client's engagements", async () => {
    fromMock.mockReturnValueOnce(
      table({
        data: [
          {
            client_id: "c1",
            service_id: LINKEDIN_ROW.id,
            created_at: "2026-08-02T00:00:00.000Z",
            created_by: null,
          },
        ],
        error: null,
      }),
    );

    await expect(listClientServices("c1")).resolves.toEqual([
      {
        clientId: "c1",
        serviceId: LINKEDIN_ROW.id,
        createdAt: "2026-08-02T00:00:00.000Z",
        // null = written by the backfill, not by a person. Preserved, not defaulted.
        createdBy: null,
      },
    ]);
    expect(fromMock).toHaveBeenCalledWith("client_services");
  });

  it("throws when the read fails", async () => {
    fromMock.mockReturnValueOnce(table({ data: null, error: { message: "boom" } }));

    await expect(listClientServices("c1")).rejects.toThrow(/boom/);
  });
});

describe("listServicesAdmin", () => {
  it("maps the derived counts and the delete affordance", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          ...LINKEDIN_ROW,
          client_count: 4,
          upload_count: 37,
          can_delete: false,
        },
        {
          ...ADVISORY_ROW,
          client_count: 0,
          // ⚠️ A NULL-handler Service has no pipeline, so 0 uploads is a FACT
          // about the offering — not a missing join.
          upload_count: 0,
          can_delete: true,
        },
      ],
      error: null,
    });

    const rows = await listServicesAdmin();

    expect(rpcMock).toHaveBeenCalledWith("list_services_admin");
    expect(rows[0]).toMatchObject({ clientCount: 4, uploadCount: 37, canDelete: false });
    expect(rows[1]).toMatchObject({ handler: null, uploadCount: 0, canDelete: true });
  });

  it("throws when the caller is not an admin", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "admin role required" } });

    await expect(listServicesAdmin()).rejects.toThrow(/admin role required/);
  });
});

describe("the mutating wrappers pass through and report", () => {
  it("createService sends every field and returns the new id", async () => {
    rpcMock.mockResolvedValueOnce({ data: LINKEDIN_ROW.id, error: null });

    const id = await createService({
      name: "Advisory",
      slug: "advisory",
      description: null,
      handler: null,
    });

    expect(rpcMock).toHaveBeenCalledWith("create_service", {
      p_name: "Advisory",
      p_slug: "advisory",
      p_description: null,
      p_handler: null,
    });
    expect(id).toBe(LINKEDIN_ROW.id);
  });

  it("⚠️ updateService sends NO handler — it is immutable after creation", async () => {
    // ⚠️ THE ABSENCE IS THE CONTRACT. `update_service` has no handler parameter
    // because repointing a live Service would silently reinterpret every
    // engagement attached to it. This asserts the seam cannot smuggle one in.
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    await updateService({ id: "s1", name: "Renamed", description: null, sortOrder: 5 });

    const [, payload] = rpcMock.mock.calls[0]!;
    expect(payload).toEqual({
      p_id: "s1",
      p_name: "Renamed",
      p_description: null,
      p_sort_order: 5,
    });
    expect(payload).not.toHaveProperty("p_handler");
  });

  it("setServiceStatus archives", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    await setServiceStatus("s1", "archived");

    expect(rpcMock).toHaveBeenCalledWith("set_service_status", {
      p_id: "s1",
      p_status: "archived",
    });
  });

  it("setClientServices replaces the whole set", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    await setClientServices("c1", ["s1", "s2"]);

    expect(rpcMock).toHaveBeenCalledWith("set_client_services", {
      p_client_id: "c1",
      p_service_ids: ["s1", "s2"],
    });
  });
});

describe("deleteService does NOT re-implement the delete guard", () => {
  it("⚠️ always calls the function, and surfaces its refusal verbatim", async () => {
    // ⚠️ THE RULE LIVES IN `delete_service` AND IN THE FOREIGN KEY — NOT HERE.
    //
    // It would be easy for this module to count engagements first and refuse
    // early. That would be a second copy of the rule, computed from a read that is
    // already stale, and it would drift from the database's answer. This wrapper
    // asks, then reports what it was told — including the count the function put
    // in the message, which is the only reason the message is useful.
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "cannot delete: 4 client(s) still receive this service" },
    });

    await expect(deleteService("s1")).rejects.toThrow(
      /cannot delete: 4 client\(s\) still receive this service/,
    );
    // It asked, rather than deciding for itself.
    expect(rpcMock).toHaveBeenCalledWith("delete_service", { p_id: "s1" });
  });

  it("resolves when the function permits the delete", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    await expect(deleteService("s1")).resolves.toBeUndefined();
  });
});

describe("listAllClientServices — every engagement, for the upload screen", () => {
  const ROW = {
    client_id: "c1",
    service_id: "aaaaaaaa-0000-0000-0000-000000000001",
    created_at: "2026-08-02T00:00:00.000Z",
    created_by: null,
  };

  beforeEach(() => {
    readAllPagesMock.mockReset();
    readAllPagesMock.mockResolvedValue({
      rows: [ROW],
      unavailable: false,
      truncated: false,
      total: 1,
    });
  });

  it("maps every row, for every client", async () => {
    await expect(listAllClientServices()).resolves.toEqual([
      {
        clientId: "c1",
        serviceId: ROW.service_id,
        createdAt: ROW.created_at,
        createdBy: null,
      },
    ]);
  });

  it("reads client_services unfiltered, on a TOTAL order, with no per-client `eq`", async () => {
    // The chain self-returns so the reader's real call sequence is exercised —
    // including BOTH `.order()` calls, which a single-level stub would have hidden.
    const eq = vi.fn();
    const order = vi.fn();
    const chain: Record<string, unknown> = { eq };
    for (const method of ["select", "range"]) chain[method] = () => chain;
    chain.order = (...args: unknown[]) => {
      order(...args);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve);
    fromMock.mockReturnValue(chain);

    await listAllClientServices();
    // Exercise the reader the pager was handed.
    const reader = readAllPagesMock.mock.calls[0]![0] as (
      f: number,
      t: number,
    ) => PromiseLike<unknown>;
    await reader(0, 999);

    expect(fromMock).toHaveBeenCalledWith("client_services");
    expect(eq).not.toHaveBeenCalled();

    // ⚠️ `(client_id, service_id)` IS THE PRIMARY KEY, AND ORDERING BY BOTH IS WHAT
    // MAKES THE ORDER TOTAL. Pages are issued concurrently; ordering by `client_id`
    // alone leaves ties, and ties across concurrent ranges silently overlap or skip
    // rows — a wrong row set with no error, which is exactly the failure mode this
    // whole function is paged to avoid.
    expect(order).toHaveBeenCalledWith("client_id", { ascending: true });
    expect(order).toHaveBeenCalledWith("service_id", { ascending: true });
  });

  it("throws when the read failed", async () => {
    readAllPagesMock.mockResolvedValue({
      rows: [],
      unavailable: true,
      truncated: false,
      total: null,
    });

    await expect(listAllClientServices()).rejects.toThrow(/could not be read/i);
  });

  it("⚠️ THROWS on truncation rather than returning a partial set", async () => {
    // ⚠️ THE SILENT-TRUNCATION TRAP, AND WHY PARTIAL DATA IS WORSE THAN NO DATA.
    //
    // A truncated read is a PREFIX. Any Client whose rows fell off the end would
    // arrive at /upload holding zero services — which after this slice renders as
    // "no services assigned, you cannot upload". That is a false statement about a
    // real Client, produced by a row cap, with no error anywhere to explain it.
    //
    // Throwing sends the page to its registry-unreadable branch instead, which
    // shows BOTH pipeline tabs. Over-showing tabs is recoverable; silently
    // stripping someone's upload path in the middle of the weekly routine is not.
    readAllPagesMock.mockResolvedValue({
      rows: [ROW],
      unavailable: false,
      truncated: true,
      total: 90000,
    });

    await expect(listAllClientServices()).rejects.toThrow(/incomplete/i);
  });
});
