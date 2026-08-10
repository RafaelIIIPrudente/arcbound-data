import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminMock, listMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  listMock: vi.fn(),
}));
vi.mock("@/lib/auth/roles", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/services/arcbound-services", () => ({ listServicesAdmin: listMock }));

import ServicesPage from "./page";

/** `requireAdmin()` denies by calling `redirect()`, which throws and never returns. */
const REDIRECT = () => new Error("NEXT_REDIRECT:/");

const REGISTRY = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "linkedin-growth",
    name: "LinkedIn Growth",
    description: null,
    handler: "linkedin_post_metrics" as const,
    status: "active" as const,
    sortOrder: 10,
    clientCount: 4,
    uploadCount: 37,
    canDelete: false,
  },
];

beforeEach(() => {
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue(undefined);
  listMock.mockReset();
  listMock.mockResolvedValue(REGISTRY);
});

describe("the Services registry page", () => {
  it("renders the registry for an admin", async () => {
    render(await ServicesPage());

    expect(screen.getByText("LinkedIn Growth")).toBeInTheDocument();
  });

  it("⚠️ refuses an analyst BEFORE reading the registry", async () => {
    // ⚠️ THE ORDER IS THE ASSERTION, NOT JUST THE REDIRECT. `list_services_admin`
    // is admin-gated in SQL too, but a page that fetched first and guarded second
    // would still have caused the read to run on a denied caller's behalf.
    requireAdminMock.mockRejectedValueOnce(REDIRECT());

    await expect(ServicesPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(listMock).not.toHaveBeenCalled();
  });

  it("⚠️ degrades to the unavailable state instead of blanking the screen", async () => {
    // ⚠️ A THROW HERE WOULD HIT THE ERROR BOUNDARY and lose the distinction the
    // component exists to draw: the admin would see a generic failure rather than
    // "the registry could not be read, and that is not the same as empty".
    listMock.mockRejectedValueOnce(new Error("permission denied for function"));

    render(await ServicesPage());

    expect(screen.getByRole("alert")).toHaveTextContent(/could not be read/i);
  });
});
