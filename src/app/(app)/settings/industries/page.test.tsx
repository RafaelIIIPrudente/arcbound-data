import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminMock, listMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  listMock: vi.fn(),
}));
vi.mock("@/lib/auth/roles", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/services/industries", () => ({ listIndustriesAdmin: listMock }));

import IndustriesPage from "./page";

/** `requireAdmin()` denies by calling `redirect()`, which throws and never returns. */
const REDIRECT = () => new Error("NEXT_REDIRECT:/");

const REGISTRY = [
  { id: "11111111-1111-1111-1111-111111111111", name: "SaaS", status: "active" as const },
];

beforeEach(() => {
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue(undefined);
  listMock.mockReset();
  listMock.mockResolvedValue(REGISTRY);
});

describe("the Industries registry page", () => {
  it("renders the registry for an admin", async () => {
    render(await IndustriesPage());

    expect(screen.getByText("SaaS")).toBeInTheDocument();
  });

  it("⚠️ refuses an analyst BEFORE reading the registry", async () => {
    // ⚠️ THE ORDER IS THE ASSERTION, NOT JUST THE REDIRECT. Reading `industries`
    // is permitted to every authenticated user by RLS, so nothing in the database
    // would stop this read happening on a denied caller's behalf — the guard's
    // position is the only thing that does.
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(IndustriesPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(listMock).not.toHaveBeenCalled();
  });

  it("⚠️ degrades to the unavailable state instead of blanking the screen", async () => {
    // ⚠️ `listIndustriesAdmin` THROWS rather than returning `[]` — right, because
    // a caller cannot tell an empty roster from a broken query. But an unhandled
    // throw here reaches the error boundary and blanks the page, losing the very
    // distinction the screen exists to draw. Catching it turns "we do not know"
    // into something the page can say out loud.
    listMock.mockRejectedValueOnce(new Error("permission denied for table industries"));

    render(await IndustriesPage());

    expect(screen.getByRole("alert")).toHaveTextContent(/could not be read/i);
  });

  it("⚠️ renders the EMPTY registry as an invitation, not a failure", async () => {
    // ⚠️ TODAY'S REAL STATE. The registry ships empty by decision, so this is the
    // first thing anyone will see on this screen.
    listMock.mockResolvedValueOnce([]);

    render(await IndustriesPage());

    expect(screen.getByRole("status").textContent).toMatch(/none yet|no industries/i);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
