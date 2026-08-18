import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: the Supabase seam is mocked. Nothing hits Postgres — see the note in
// supabase/writers-registry.test.ts about what is and is not proven here.
//
// ⚠️ THE MIRROR OF `industries.test.ts`, AND THE RPC NAMES ARE THE ASSERTIONS.
// A writer is a registry entry, not an account (ADR 0017): this seam must reach
// `create_writer` / `update_writer` / `set_writer_status` / `delete_writer` and
// must never touch `auth.users`, `list_staff`, or `list_staff_directory` — the
// model it replaced.
const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: fromMock, rpc: rpcMock }),
}));

import {
  createWriter,
  deleteWriter,
  listWritersAdmin,
  setWriterStatus,
  updateWriter,
} from "./writers";

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

describe("listWritersAdmin", () => {
  it("maps rows and keeps archived ones in the list", () => {
    // Archived writers belong on the ADMIN screen — it is the only place they
    // can be restored from. Filtering them out here would make retirement a
    // one-way door through a read, not a decision.
    fromMock.mockReturnValue(
      table({
        data: [
          { id: ID, name: "Ryan Prior", status: "active" },
          { id: "22222222-2222-2222-2222-222222222222", name: "Bo Chen", status: "archived" },
        ],
        error: null,
      }),
    );

    return listWritersAdmin().then((rows) => {
      expect(fromMock).toHaveBeenCalledWith("writers");
      expect(rows).toEqual([
        { id: ID, name: "Ryan Prior", status: "active" },
        { id: "22222222-2222-2222-2222-222222222222", name: "Bo Chen", status: "archived" },
      ]);
    });
  });

  it("⚠️ THROWS on a failed read — never an empty registry", async () => {
    // ⚠️ THE RULE THIS WHOLE SCREEN RESTS ON, and the one `listStaff()` states in
    // staff.ts: an empty list reads as "Arcbound recognises no writers", which
    // a caller has no way to tell apart from a broken query. The registry is
    // genuinely empty today, so the two would be indistinguishable in production
    // right now — and because names are unique case-insensitively, an admin who
    // believed "empty" would start recreating rows and collect constraint errors.
    fromMock.mockReturnValue(table({ data: null, error: { message: "permission denied" } }));

    await expect(listWritersAdmin()).rejects.toThrow(/permission denied/);
  });

  it("returns [] only for a read that genuinely found nothing", async () => {
    // The other half of the same rule: a SUCCESSFUL read of an empty table is a
    // real answer, and must not be dressed up as a failure either.
    fromMock.mockReturnValue(table({ data: [], error: null }));

    await expect(listWritersAdmin()).resolves.toEqual([]);
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
  it("create_writer(p_name) and returns the new id", async () => {
    rpcMock.mockResolvedValueOnce({ data: ID, error: null });

    await expect(createWriter("Ryan Prior")).resolves.toBe(ID);
    expect(rpcMock).toHaveBeenCalledWith("create_writer", { p_name: "Ryan Prior" });
  });

  it("update_writer(p_id, p_name)", async () => {
    await updateWriter(ID, "Software");
    expect(rpcMock).toHaveBeenCalledWith("update_writer", { p_id: ID, p_name: "Software" });
  });

  it("set_writer_status(p_id, p_status)", async () => {
    await setWriterStatus(ID, "archived");
    expect(rpcMock).toHaveBeenCalledWith("set_writer_status", { p_id: ID, p_status: "archived" });
  });

  it("delete_writer(p_id)", async () => {
    await deleteWriter(ID);
    expect(rpcMock).toHaveBeenCalledWith("delete_writer", { p_id: ID });
  });

  it("⚠️ surfaces delete_writer's refusal VERBATIM, count intact", async () => {
    // ⚠️ THE SEAM MUST NOT SUMMARISE. `error.message` goes through untouched, so
    // the count the database put in it survives all the way to the screen.
    const refusal = "cannot delete: 3 client(s) are still recorded against this writer";
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: refusal } });

    await expect(deleteWriter(ID)).rejects.toThrow(refusal);
  });

  it("⚠️ counts nothing itself before deleting", async () => {
    // The delete rule lives in `delete_writer` alone. A pre-check here would be
    // a second copy computed from an already-stale read — it would start refusing
    // deletes the database would have allowed, or offering ones it refuses.
    await deleteWriter(ID);

    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

describe("⚠️ the writers seam never reaches for an account", () => {
  it("touches no staff RPC and no auth table", async () => {
    // ⚠️ THE WHOLE POINT OF ADR 0017, ASSERTED RATHER THAN INTENDED. Binding a
    // writer to `auth.users` meant recording who writes for a Client required
    // issuing that person a login and, under ADR 0013, a read grant over every
    // Client. A registry row grants nothing, and this seam is where a well-meant
    // "resolve the writer's email" would be added back.
    fromMock.mockReturnValue(table({ data: [], error: null }));
    await listWritersAdmin();

    await createWriter("Alex Moreau");
    await updateWriter(ID, "Alex Moreau");
    await setWriterStatus(ID, "archived");
    await deleteWriter(ID);

    const called = rpcMock.mock.calls.map(([name]) => name as string);
    expect(called).toEqual([
      "create_writer",
      "update_writer",
      "set_writer_status",
      "delete_writer",
    ]);
    expect(called).not.toContain("list_staff");
    expect(called).not.toContain("list_staff_directory");
    expect(fromMock.mock.calls.map(([t]) => t)).toEqual(["writers"]);
  });
});
