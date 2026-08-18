import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: mock the service seam, next/cache and the role guard. Nothing hits
// the DB. `normalizeLinkedInUrl` is deliberately NOT mocked — it is pure, and the
// ordering test below depends on a genuinely invalid URL being rejected by it.
const { createClientMock, setServicesMock, revalidateMock, requireAdminMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  setServicesMock: vi.fn(),
  revalidateMock: vi.fn(),
  requireAdminMock: vi.fn(),
}));
vi.mock("@/services/clients", () => ({ createClient: createClientMock }));
vi.mock("@/services/arcbound-services", () => ({ setClientServices: setServicesMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));
vi.mock("@/lib/auth/roles", () => ({ requireAdmin: requireAdminMock }));

import { paths } from "@/paths";

import { createClientAction } from "./actions";

const IDLE = { status: "idle" as const };
const NEW_CLIENT = "11111111-1111-1111-1111-111111111111";
const SERVICE_A = "aaaaaaaa-0000-0000-0000-000000000001";
const SERVICE_B = "aaaaaaaa-0000-0000-0000-000000000002";

function form(fields: Record<string, string>, serviceIds: string[] = []): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  // Mirrors a real submit: one `service_id` entry per ticked checkbox.
  for (const id of serviceIds) fd.append("service_id", id);
  return fd;
}

const VALID = { name: "Ada Lovelace", linkedin_url: "https://www.linkedin.com/in/adalovelace" };

/** `requireAdmin()` denies by calling `redirect()`, which throws and never returns. */
const REDIRECT = () => new Error("NEXT_REDIRECT:/");

beforeEach(() => {
  createClientMock.mockReset();
  createClientMock.mockResolvedValue({ id: NEW_CLIENT, name: "Ada Lovelace" });
  setServicesMock.mockReset();
  setServicesMock.mockResolvedValue(undefined);
  revalidateMock.mockReset();
  // Default: the caller IS an admin.
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue(undefined);
});

describe("createClientAction — as an admin", () => {
  it("registers the client and revalidates the list", async () => {
    const state = await createClientAction(IDLE, form(VALID, [SERVICE_A]));

    // S4 widened this call: `industry_id` and `writer_id` now ride in the SAME
    // insert (D7), and both are `null` when the form offered no pickers.
    expect(createClientMock).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      linkedin_url: expect.stringContaining("adalovelace"),
      industry_id: null,
      writer_id: null,
    });
    expect(revalidateMock).toHaveBeenCalledWith(paths.clients.list);
    expect(state).toMatchObject({ status: "created", clientId: NEW_CLIENT });
  });

  it("returns field errors without touching the seam when the form is empty", async () => {
    const state = await createClientAction(IDLE, form({ name: "", linkedin_url: "" }));

    expect(state.status).toBe("error");
    expect(state.status === "error" && state.errors).toBeDefined();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("⚠️ CREATES THE CLIENT FIRST, THEN ASSIGNS ITS SERVICES", async () => {
    // ⚠️ ORDER IS NOT A PREFERENCE — IT IS A FOREIGN KEY.
    //
    // `client_services.client_id` references `clients(id)`, so assigning first
    // would fail against a row that does not exist yet. Two assertions, because
    // each catches a different way of getting it wrong: the call ORDER catches a
    // reordering, and the ID LINKAGE catches an implementation that invented or
    // guessed an id instead of using the one `createClient()` handed back.
    await createClientAction(IDLE, form(VALID, [SERVICE_A, SERVICE_B]));

    expect(createClientMock.mock.invocationCallOrder[0]).toBeLessThan(
      setServicesMock.mock.invocationCallOrder[0]!,
    );
    expect(setServicesMock).toHaveBeenCalledWith(NEW_CLIENT, [SERVICE_A, SERVICE_B]);
  });

  it("⚠️ reads EVERY ticked service, not just the last one", async () => {
    // `Object.fromEntries(formData)` keeps only the last value of a repeated field.
    await createClientAction(IDLE, form(VALID, [SERVICE_A, SERVICE_B]));

    expect(setServicesMock).toHaveBeenCalledWith(NEW_CLIENT, [SERVICE_A, SERVICE_B]);
  });
});

describe("createClientAction — registering with NO services", () => {
  it("⚠️ succeeds, but says the client cannot receive uploads yet", async () => {
    // ⚠️ NOT AN ERROR. A Client may legitimately be registered before the
    // engagement is finalised. But saying nothing would be the same silent-outage
    // failure the S1 backfill exists to prevent: once /upload filters by Services
    // (S4), this Client has no upload path and nobody has been told.
    const state = await createClientAction(IDLE, form(VALID, []));

    expect(state.status).toBe("created_without_services");
    expect(state.status === "created_without_services" && state.message).toMatch(
      /cannot receive uploads/i,
    );
    expect(revalidateMock).toHaveBeenCalledWith(paths.clients.list);
  });

  it("does not call the assignment seam at all when nothing was selected", async () => {
    await createClientAction(IDLE, form(VALID, []));

    expect(setServicesMock).not.toHaveBeenCalled();
  });
});

describe("createClientAction — PARTIAL SUCCESS", () => {
  it("⚠️ reports a created client whose services failed as its OWN outcome", async () => {
    // ⚠️ NEITHER SUCCESS NOR FAILURE, AND THE DISTINCTION IS THE POINT.
    //
    // The Client EXISTS — it cannot be un-created, and a retry would duplicate it
    // (there is no unique constraint on clients, ADR 0009). But it has no Services,
    // so once S4 lands it cannot be uploaded to. Reporting plain success hides a
    // client that is broken on arrival; reporting a plain error invites the admin
    // to submit again and make two of them. The state must name the consequence
    // and point at where to fix it.
    setServicesMock.mockRejectedValueOnce(new Error('relation "services" does not exist'));

    const state = await createClientAction(IDLE, form(VALID, [SERVICE_A]));

    expect(state.status).toBe("created_services_failed");
    expect(state.status === "created_services_failed" && state.clientId).toBe(NEW_CLIENT);
    expect(state.status === "created_services_failed" && state.message).toMatch(
      /cannot receive uploads/i,
    );
    // The client is real, so the list must still refresh to show it.
    expect(revalidateMock).toHaveBeenCalledWith(paths.clients.list);
  });

  it("reports a failed client creation as a plain error, with no client id", async () => {
    createClientMock.mockRejectedValueOnce(new Error("insert failed"));

    const state = await createClientAction(IDLE, form(VALID, [SERVICE_A]));

    expect(state.status).toBe("error");
    expect(setServicesMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("createClientAction refuses a non-admin (ADR 0013)", () => {
  it("never reaches the seam, and does not revalidate", async () => {
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(createClientAction(IDLE, form(VALID))).rejects.toThrow("NEXT_REDIRECT");

    // ⚠️ The point is that NO client was registered — not merely that something
    // went wrong afterwards.
    expect(createClientMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("⚠️ refuses BEFORE validating, so an analyst learns nothing from the form", async () => {
    // A deliberately INVALID payload. If the guard ran after `safeParse`, this
    // would return tidy field errors and resolve — telling a non-admin that their
    // input was the problem, when in truth they were never allowed to submit at
    // all. Refusal must precede every other branch, so this THROWS instead.
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(
      createClientAction(IDLE, form({ name: "", linkedin_url: "not-a-url" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(createClientMock).not.toHaveBeenCalled();
  });
});

describe("createClientAction — industry and writer (S4)", () => {
  const INDUSTRY = "bbbbbbbb-0000-0000-0000-000000000001";
  /** `normalizeLinkedInUrl` is not mocked; it strips `www.` before the seam. */
  const NORMALIZED_URL = "https://linkedin.com/in/adalovelace";
  const WRITER = "cccccccc-0000-0000-0000-000000000001";

  it("⚠️ passes BOTH straight into createClient, for the SAME insert", () => {
    // ⚠️ ONE WRITE, NOT TWO (D7). A follow-up `set_client_industry_writer` call
    // would add a fifth outcome to this action's four: a Client that exists, with
    // services, silently missing the industry and writer the admin chose — and
    // retrying would duplicate the Client, because `clients` has no unique
    // constraint (ADR 0009).
    return createClientAction(
      IDLE,
      form({ ...VALID, industry_id: INDUSTRY, writer_id: WRITER }),
    ).then(() => {
      expect(createClientMock).toHaveBeenCalledWith({
        name: VALID.name,
        linkedin_url: NORMALIZED_URL,
        industry_id: INDUSTRY,
        writer_id: WRITER,
      });
    });
  });

  it("treats an unset picker as not-recorded, never as a validation failure", async () => {
    // Both are optional at registration: an engagement can be registered before
    // either is known, and refusing that would block the create path over nothing.
    const result = await createClientAction(
      IDLE,
      form({ ...VALID, industry_id: "", writer_id: "" }),
    );

    expect(result.status).toBe("created_without_services");
    expect(createClientMock).toHaveBeenCalledWith({
      name: VALID.name,
      linkedin_url: NORMALIZED_URL,
      industry_id: null,
      writer_id: null,
    });
  });

  it("registers a Client when the fields are absent entirely", async () => {
    // ⚠️ ABSENT IS FINE HERE AND REFUSED ON THE EDIT PATH — the asymmetry is the
    // point. A new Client has no current value to lose, so absent and empty mean
    // the same true thing. An EXISTING Client's absent field cannot be told apart
    // from a deliberate clear, which is why the edit action rejects it.
    const result = await createClientAction(IDLE, form(VALID));

    expect(result.status).toBe("created_without_services");
    expect(createClientMock).toHaveBeenCalledWith({
      name: VALID.name,
      linkedin_url: NORMALIZED_URL,
      industry_id: null,
      writer_id: null,
    });
  });

  it("refuses a malformed id before anything is created", async () => {
    const result = await createClientAction(IDLE, form({ ...VALID, industry_id: "nope" }));

    expect(result.status).toBe("error");
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
