import { beforeEach, describe, expect, it, vi } from "vitest";

const { setMock, revalidateMock, requireAdminMock } = vi.hoisted(() => ({
  setMock: vi.fn(),
  revalidateMock: vi.fn(),
  requireAdminMock: vi.fn(),
}));
vi.mock("@/services/arcbound-services", () => ({ setClientServices: setMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));
vi.mock("@/lib/auth/roles", () => ({ requireAdmin: requireAdminMock }));

import { paths } from "@/paths";

import { setClientServicesAction } from "./services-actions";

const IDLE = { status: "idle" as const };
const CLIENT = "11111111-1111-1111-1111-111111111111";
const SERVICE_A = "aaaaaaaa-0000-0000-0000-000000000001";
const SERVICE_B = "aaaaaaaa-0000-0000-0000-000000000002";

/** Mirrors a real submit: `service_id` appears once per ticked checkbox. */
function form(clientId: string, serviceIds: string[]): FormData {
  const fd = new FormData();
  fd.set("client_id", clientId);
  for (const id of serviceIds) fd.append("service_id", id);
  return fd;
}

const REDIRECT = () => new Error("NEXT_REDIRECT:/");

beforeEach(() => {
  setMock.mockReset();
  setMock.mockResolvedValue(undefined);
  revalidateMock.mockReset();
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue(undefined);
});

describe("setClientServicesAction", () => {
  it("⚠️ reads EVERY ticked box, not just the last one", () => {
    // ⚠️ `Object.fromEntries(formData)` KEEPS ONLY THE LAST VALUE OF A REPEATED
    // FIELD. Used here it would silently reduce a three-service submission to one,
    // and `setClientServices` replaces the whole set — so the other two would be
    // deleted. The action must use `getAll`.
    return setClientServicesAction(IDLE, form(CLIENT, [SERVICE_A, SERVICE_B])).then(() => {
      expect(setMock).toHaveBeenCalledWith(CLIENT, [SERVICE_A, SERVICE_B]);
    });
  });

  it("saves and revalidates the client's overview", async () => {
    const state = await setClientServicesAction(IDLE, form(CLIENT, [SERVICE_A]));

    expect(revalidateMock).toHaveBeenCalledWith(paths.clients.details(CLIENT));
    expect(state.status).toBe("saved");
  });

  it("⚠️ accepts an EMPTY set — removing every service is a legitimate act", async () => {
    // ⚠️ NOT AN ERROR. An admin may correctly end an engagement entirely. Rejecting
    // this would make "no services" unreachable through the UI even though the
    // database, the card and S4 all treat it as a real state.
    const state = await setClientServicesAction(IDLE, form(CLIENT, []));

    expect(setMock).toHaveBeenCalledWith(CLIENT, []);
    expect(state.status).toBe("saved");
  });

  it("rejects a malformed client id without touching the seam", async () => {
    const state = await setClientServicesAction(IDLE, form("not-a-uuid", [SERVICE_A]));

    expect(state.status).toBe("error");
    expect(setMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed service id without touching the seam", async () => {
    const state = await setClientServicesAction(IDLE, form(CLIENT, ["nonsense"]));

    expect(state.status).toBe("error");
    expect(setMock).not.toHaveBeenCalled();
  });

  it("surfaces the database's refusal verbatim", async () => {
    setMock.mockRejectedValueOnce(new Error("unknown client 1234"));

    const state = await setClientServicesAction(IDLE, form(CLIENT, [SERVICE_A]));

    expect(state).toEqual({ status: "error", message: "unknown client 1234" });
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("setClientServicesAction refuses a non-admin", () => {
  it("never reaches the seam", async () => {
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(setClientServicesAction(IDLE, form(CLIENT, [SERVICE_A]))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(setMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("⚠️ lets the redirect ESCAPE rather than catching it into an error state", async () => {
    // ⚠️ `requireAdmin()` MUST SIT OUTSIDE THE try. This action catches failures on
    // purpose — that is how the database's refusal is rendered — so a guard inside
    // the try would be caught too and the denial would surface as a message reading
    // "NEXT_REDIRECT" instead of redirecting.
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    const outcome = await setClientServicesAction(IDLE, form(CLIENT, [SERVICE_A])).then(
      () => ({ kind: "returned" as const }),
      () => ({ kind: "threw" as const }),
    );

    expect(outcome.kind).toBe("threw");
  });

  it("refuses BEFORE validating", async () => {
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(
      setClientServicesAction(IDLE, form("nonsense", ["also-nonsense"])),
    ).rejects.toThrow("NEXT_REDIRECT");
  });
});
