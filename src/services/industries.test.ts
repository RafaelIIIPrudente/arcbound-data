import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: the Supabase seam is mocked. Nothing hits Postgres — see the note in
// supabase/client-industry-writer.test.ts about what is and is not proven here.
const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: fromMock, rpc: rpcMock }),
}));

import {
  createIndustry,
  deleteIndustry,
  listIndustriesAdmin,
  setIndustryStatus,
  updateIndustry,
} from "./industries";

/** A thenable query builder: every chained method returns itself, then resolves. */
function table(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "order", "eq"]) chain[method] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

const ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: null, error: null });
  fromMock.mockReset();
});

describe("listIndustriesAdmin", () => {
  it("maps rows and keeps archived ones in the list", () => {
    // Archived industries belong on the ADMIN screen — it is the only place they
    // can be restored from. Filtering them out here would make retirement a
    // one-way door through a read, not a decision.
    fromMock.mockReturnValue(
      table({
        data: [
          { id: ID, name: "SaaS", status: "active" },
          { id: "22222222-2222-2222-2222-222222222222", name: "Fax", status: "archived" },
        ],
        error: null,
      }),
    );

    return listIndustriesAdmin().then((rows) => {
      expect(fromMock).toHaveBeenCalledWith("industries");
      expect(rows).toEqual([
        { id: ID, name: "SaaS", status: "active" },
        { id: "22222222-2222-2222-2222-222222222222", name: "Fax", status: "archived" },
      ]);
    });
  });

  it("⚠️ THROWS on a failed read — never an empty registry", async () => {
    // ⚠️ THE RULE THIS WHOLE SCREEN RESTS ON, and the one `listStaff()` states in
    // staff.ts: an empty list reads as "Arcbound recognises no industries", which
    // a caller has no way to tell apart from a broken query. The registry is
    // genuinely empty today, so the two would be indistinguishable in production
    // right now — and because names are unique case-insensitively, an admin who
    // believed "empty" would start recreating rows and collect constraint errors.
    fromMock.mockReturnValue(table({ data: null, error: { message: "permission denied" } }));

    await expect(listIndustriesAdmin()).rejects.toThrow(/permission denied/);
  });

  it("returns [] only for a read that genuinely found nothing", async () => {
    // The other half of the same rule: a SUCCESSFUL read of an empty table is a
    // real answer, and must not be dressed up as a failure either.
    fromMock.mockReturnValue(table({ data: [], error: null }));

    await expect(listIndustriesAdmin()).resolves.toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE RPC ARGUMENT NAMES ARE ASSERTED HERE AND NOWHERE ELSE.
//
// Every screen test above this seam mocks this module, so a typo in `p_name` or
// `p_status` would pass the entire suite and fail only against the real
// database — as a PostgREST "function does not exist" that names no parameter.
// These are the shapes S1's applied SQL declares.
// ─────────────────────────────────────────────────────────────────────────────
describe("the four admin writes call the RPCs S1 applied", () => {
  it("create_industry(p_name) and returns the new id", async () => {
    rpcMock.mockResolvedValueOnce({ data: ID, error: null });

    await expect(createIndustry("SaaS")).resolves.toBe(ID);
    expect(rpcMock).toHaveBeenCalledWith("create_industry", { p_name: "SaaS" });
  });

  it("update_industry(p_id, p_name)", async () => {
    await updateIndustry(ID, "Software");
    expect(rpcMock).toHaveBeenCalledWith("update_industry", { p_id: ID, p_name: "Software" });
  });

  it("set_industry_status(p_id, p_status)", async () => {
    await setIndustryStatus(ID, "archived");
    expect(rpcMock).toHaveBeenCalledWith("set_industry_status", { p_id: ID, p_status: "archived" });
  });

  it("delete_industry(p_id)", async () => {
    await deleteIndustry(ID);
    expect(rpcMock).toHaveBeenCalledWith("delete_industry", { p_id: ID });
  });

  it("⚠️ surfaces delete_industry's refusal VERBATIM, count intact", async () => {
    // ⚠️ THE SEAM MUST NOT SUMMARISE. `error.message` goes through untouched, so
    // the count the database put in it survives all the way to the screen.
    const refusal = "cannot delete: 3 client(s) are still recorded in this industry";
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: refusal } });

    await expect(deleteIndustry(ID)).rejects.toThrow(refusal);
  });

  it("⚠️ counts nothing itself before deleting", async () => {
    // The delete rule lives in `delete_industry` alone. A pre-check here would be
    // a second copy computed from an already-stale read — it would start refusing
    // deletes the database would have allowed, or offering ones it refuses.
    await deleteIndustry(ID);

    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
