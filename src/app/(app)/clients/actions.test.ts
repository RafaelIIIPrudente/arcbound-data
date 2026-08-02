import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: mock the service seam, next/cache and the role guard. Nothing hits
// the DB. `normalizeLinkedInUrl` is deliberately NOT mocked — it is pure, and the
// ordering test below depends on a genuinely invalid URL being rejected by it.
const { createClientMock, revalidateMock, requireAdminMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidateMock: vi.fn(),
  requireAdminMock: vi.fn(),
}));
vi.mock("@/services/clients", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));
vi.mock("@/lib/auth/roles", () => ({ requireAdmin: requireAdminMock }));

import { paths } from "@/paths";

import { createClientAction } from "./actions";

const IDLE = { ok: false };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const VALID = { name: "Ada Lovelace", linkedin_url: "https://www.linkedin.com/in/adalovelace" };

/** `requireAdmin()` denies by calling `redirect()`, which throws and never returns. */
const REDIRECT = () => new Error("NEXT_REDIRECT:/");

beforeEach(() => {
  createClientMock.mockReset();
  createClientMock.mockResolvedValue(undefined);
  revalidateMock.mockReset();
  // Default: the caller IS an admin.
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue(undefined);
});

describe("createClientAction — as an admin", () => {
  it("registers the client and revalidates the list", async () => {
    const state = await createClientAction(IDLE, form(VALID));

    expect(createClientMock).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      linkedin_url: expect.stringContaining("adalovelace"),
    });
    expect(revalidateMock).toHaveBeenCalledWith(paths.clients.list);
    expect(state).toEqual({ ok: true });
  });

  it("returns field errors without touching the seam when the form is empty", async () => {
    const state = await createClientAction(IDLE, form({ name: "", linkedin_url: "" }));

    expect(state.ok).toBe(false);
    expect(state.errors).toBeDefined();
    expect(createClientMock).not.toHaveBeenCalled();
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
