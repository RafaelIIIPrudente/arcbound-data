import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: the seam, next/cache and the role guard are mocked.
const { createMock, updateMock, statusMock, deleteMock, revalidateMock, requireAdminMock } =
  vi.hoisted(() => ({
    createMock: vi.fn(),
    updateMock: vi.fn(),
    statusMock: vi.fn(),
    deleteMock: vi.fn(),
    revalidateMock: vi.fn(),
    requireAdminMock: vi.fn(),
  }));
vi.mock("@/services/arcbound-services", () => ({
  createService: createMock,
  updateService: updateMock,
  setServiceStatus: statusMock,
  deleteService: deleteMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));
vi.mock("@/lib/auth/roles", () => ({ requireAdmin: requireAdminMock }));

import { paths } from "@/paths";

import {
  createServiceAction,
  deleteServiceAction,
  setServiceStatusAction,
  updateServiceAction,
} from "./actions";

const IDLE = { status: "idle" as const };
const SERVICE = "11111111-1111-1111-1111-111111111111";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** `requireAdmin()` denies by calling `redirect()`, which throws and never returns. */
const REDIRECT = () => new Error("NEXT_REDIRECT:/");

beforeEach(() => {
  for (const m of [createMock, updateMock, statusMock, deleteMock]) {
    m.mockReset();
    m.mockResolvedValue(undefined);
  }
  createMock.mockResolvedValue(SERVICE);
  revalidateMock.mockReset();
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue(undefined);
});

describe("createServiceAction", () => {
  it("registers an offering with a pipeline", async () => {
    const state = await createServiceAction(
      IDLE,
      form({
        name: "LinkedIn Growth",
        slug: "linkedin-growth",
        description: "Weekly scrapes.",
        handler: "linkedin_post_metrics",
      }),
    );

    expect(createMock).toHaveBeenCalledWith({
      name: "LinkedIn Growth",
      slug: "linkedin-growth",
      description: "Weekly scrapes.",
      handler: "linkedin_post_metrics",
    });
    expect(revalidateMock).toHaveBeenCalledWith(paths.settings.services);
    expect(state.status).toBe("saved");
  });

  it("⚠️ turns an unselected pipeline into NULL, not into an empty string", async () => {
    // ⚠️ THE MOST LIKELY WAY TO BREAK "VISIBILITY IS DATA, CAPABILITY IS CODE".
    //
    // An HTML select with no choice posts `""`, not null. `''` is not a legal
    // handler, so without this the CHECK constraint would reject the single most
    // common case — a listed offering with no pipeline — and the admin would see a
    // database constraint error for doing something entirely valid.
    const state = await createServiceAction(
      IDLE,
      form({ name: "Advisory", slug: "advisory", description: "", handler: "" }),
    );

    expect(createMock).toHaveBeenCalledWith({
      name: "Advisory",
      slug: "advisory",
      description: null,
      handler: null,
    });
    expect(state.status).toBe("saved");
  });

  it("refuses a handler that names no pipeline", async () => {
    // Capability is code: a value outside the union names something nobody wrote.
    const state = await createServiceAction(
      IDLE,
      form({ name: "Email", slug: "email", description: "", handler: "email_blasts" }),
    );

    expect(state.status).toBe("error");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("requires a name and a slug", async () => {
    const state = await createServiceAction(
      IDLE,
      form({ name: "", slug: "", description: "", handler: "" }),
    );

    expect(state.status).toBe("error");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("surfaces the database's refusal verbatim", async () => {
    // e.g. the partial unique index rejecting a second Service on one pipeline.
    createMock.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint "services_one_per_handler"'),
    );

    const state = await createServiceAction(
      IDLE,
      form({ name: "Dup", slug: "dup", description: "", handler: "linkedin_post_metrics" }),
    );

    expect(state).toEqual({
      status: "error",
      message: 'duplicate key value violates unique constraint "services_one_per_handler"',
    });
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("updateServiceAction", () => {
  it("renames, re-describes and re-orders", async () => {
    const state = await updateServiceAction(
      IDLE,
      form({ id: SERVICE, name: "Renamed", description: "New copy.", sort_order: "40" }),
    );

    expect(updateMock).toHaveBeenCalledWith({
      id: SERVICE,
      name: "Renamed",
      description: "New copy.",
      sortOrder: 40,
    });
    expect(state.status).toBe("saved");
  });

  it("⚠️ cannot send a handler even if the form posts one", async () => {
    // ⚠️ THE HANDLER IS IMMUTABLE AFTER CREATION (ADR 0015). Repointing a live
    // Service would silently reinterpret every engagement already attached to it.
    // `update_service` has no handler parameter; this asserts the action cannot
    // smuggle one through by echoing an extra form field.
    await updateServiceAction(
      IDLE,
      form({
        id: SERVICE,
        name: "Renamed",
        description: "",
        sort_order: "10",
        handler: "outreach_prospects",
      }),
    );

    const [payload] = updateMock.mock.calls[0]!;
    expect(payload).not.toHaveProperty("handler");
    expect(Object.keys(payload)).toEqual(["id", "name", "description", "sortOrder"]);
  });

  it("rejects a non-numeric sort order", async () => {
    const state = await updateServiceAction(
      IDLE,
      form({ id: SERVICE, name: "X", description: "", sort_order: "soon" }),
    );

    expect(state.status).toBe("error");
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("setServiceStatusAction", () => {
  it.each(["active", "archived"])("accepts %s", async (status) => {
    const state = await setServiceStatusAction(IDLE, form({ id: SERVICE, status }));

    expect(statusMock).toHaveBeenCalledWith(SERVICE, status);
    expect(state.status).toBe("saved");
  });

  it("rejects an unknown status", async () => {
    const state = await setServiceStatusAction(IDLE, form({ id: SERVICE, status: "deleted" }));

    expect(state.status).toBe("error");
    expect(statusMock).not.toHaveBeenCalled();
  });
});

describe("deleteServiceAction", () => {
  it("deletes and refreshes", async () => {
    const state = await deleteServiceAction(IDLE, form({ id: SERVICE }));

    expect(deleteMock).toHaveBeenCalledWith(SERVICE);
    expect(revalidateMock).toHaveBeenCalledWith(paths.settings.services);
    expect(state.status).toBe("saved");
  });

  it("⚠️ renders the database's refusal, including the count, rather than predicting it", async () => {
    // ⚠️ THE DELETE GUARD LIVES IN `delete_service` AND IN THE FOREIGN KEY.
    //
    // This action does not count engagements and refuse early — that would be a
    // second copy of the rule, computed from a stale read. It asks, and reports
    // what it was told. The count in the message is the whole reason the message
    // is useful, so it must survive unaltered.
    deleteMock.mockRejectedValueOnce(
      new Error("cannot delete: 4 client(s) still receive this service"),
    );

    const state = await deleteServiceAction(IDLE, form({ id: SERVICE }));

    expect(state).toEqual({
      status: "error",
      message: "cannot delete: 4 client(s) still receive this service",
    });
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("every action refuses a non-admin (ADR 0013/0015)", () => {
  const cases = [
    { name: "createServiceAction", run: createServiceAction, seam: createMock },
    { name: "updateServiceAction", run: updateServiceAction, seam: updateMock },
    { name: "setServiceStatusAction", run: setServiceStatusAction, seam: statusMock },
    { name: "deleteServiceAction", run: deleteServiceAction, seam: deleteMock },
  ];

  it.each(cases)("$name never reaches the seam", async ({ run, seam }) => {
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(
      run(IDLE, form({ id: SERVICE, name: "X", slug: "x", status: "archived", sort_order: "1" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(seam).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it.each(cases)("$name lets the redirect ESCAPE rather than catching it", async ({ run }) => {
    // ⚠️ `requireAdmin()` MUST SIT OUTSIDE THE try. These actions catch failures on
    // purpose — that is how the database's refusals get rendered — so a guard
    // inside the try would be caught too, and the denial would surface as a
    // message reading "NEXT_REDIRECT" instead of actually redirecting.
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    const outcome = await run(
      IDLE,
      form({ id: SERVICE, name: "X", slug: "x", status: "archived", sort_order: "1" }),
    ).then(
      () => ({ kind: "returned" as const }),
      () => ({ kind: "threw" as const }),
    );

    expect(outcome.kind).toBe("threw");
  });

  it.each(cases)("$name refuses BEFORE validating", async ({ run }) => {
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(run(IDLE, form({ id: "nonsense", name: "", slug: "" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });
});
