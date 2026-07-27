import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hermetic: mock the Supabase server client + cookies. Nothing hits the DB. ──
const { rpcMock, state } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  state: {
    // getReportLink's single-row read is driven from here.
    row: null as unknown,
    error: null as { message: string } | null,
    selectArgs: [] as string[],
    eqCalls: [] as unknown[][],
    isCalls: [] as unknown[][],
  },
}));

vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    rpc: rpcMock,
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = (cols: string) => {
        state.selectArgs.push(cols);
        return chain;
      };
      chain.eq = (...a: unknown[]) => {
        state.eqCalls.push(a);
        return chain;
      };
      chain.is = (...a: unknown[]) => {
        state.isCalls.push(a);
        return chain;
      };
      chain.maybeSingle = () =>
        Promise.resolve({ data: state.error ? null : state.row, error: state.error });
      return chain;
    },
  }),
}));

import {
  getReportLink,
  issueReportLink,
  readReportLinkSource,
  resolveReportLink,
  revokeReportLink,
  rotateReportLink,
} from "./report-links";

const CLIENT = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  rpcMock.mockReset();
  state.row = null;
  state.error = null;
  state.selectArgs = [];
  state.eqCalls = [];
  state.isCalls = [];
});

describe("issueReportLink", () => {
  it("returns the /r/<token> URL and the raw Access Code exactly once", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { token: "abc123", access_code: "CODE2345" },
      error: null,
    });

    const issued = await issueReportLink(CLIENT);

    expect(rpcMock).toHaveBeenCalledWith("issue_report_link", { p_client_id: CLIENT });
    expect(issued.url).toContain("/r/abc123");
    expect(issued.accessCode).toBe("CODE2345");
  });

  it("throws with the database message when the RPC errors", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "already has an active link" } });
    await expect(issueReportLink(CLIENT)).rejects.toThrow(/already has an active link/);
  });
});

describe("rotateReportLink", () => {
  it("returns a fresh URL + Access Code", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { token: "def456", access_code: "NEW23456" },
      error: null,
    });

    const issued = await rotateReportLink(CLIENT);

    expect(rpcMock).toHaveBeenCalledWith("rotate_report_link", { p_client_id: CLIENT });
    expect(issued.url).toContain("/r/def456");
    expect(issued.accessCode).toBe("NEW23456");
  });

  it("throws when the RPC errors", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(rotateReportLink(CLIENT)).rejects.toThrow(/boom/);
  });
});

describe("revokeReportLink", () => {
  it("calls the revoke RPC and resolves void", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(revokeReportLink(CLIENT)).resolves.toBeUndefined();
    expect(rpcMock).toHaveBeenCalledWith("revoke_report_link", { p_client_id: CLIENT });
  });

  it("throws when the RPC errors", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "nope" } });
    await expect(revokeReportLink(CLIENT)).rejects.toThrow(/nope/);
  });
});

describe("getReportLink", () => {
  it("returns the active link's metadata — and NEVER selects access_code_hash", async () => {
    state.row = {
      client_id: CLIENT,
      token: "tok789",
      created_at: "2026-07-25T10:00:00.000Z",
      last_accessed_at: "2026-07-25T12:00:00.000Z",
    };

    const status = await getReportLink(CLIENT);

    expect(status).toEqual({
      clientId: CLIENT,
      url: expect.stringContaining("/r/tok789"),
      createdAt: "2026-07-25T10:00:00.000Z",
      lastAccessedAt: "2026-07-25T12:00:00.000Z",
      active: true,
    });
    // The hash must never leave the database via this seam.
    expect(state.selectArgs.join(" ")).not.toContain("access_code_hash");
    // Scoped to the ACTIVE link (revoked_at is null) for this client.
    expect(state.eqCalls).toContainEqual(["client_id", CLIENT]);
    expect(state.isCalls).toContainEqual(["revoked_at", null]);
  });

  it("returns null when the Client has no active link", async () => {
    state.row = null;
    expect(await getReportLink(CLIENT)).toBeNull();
  });

  it("returns null (never throws) when the read fails", async () => {
    state.error = { message: "read failed" };
    expect(await getReportLink(CLIENT)).toBeNull();
  });
});

describe("resolveReportLink (the public gate — fails closed)", () => {
  it("resolves ok with the clientId AND the read grant on a matching token + code", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { status: "ok", client_id: CLIENT, read_grant: "deadbeefcafef00d" },
      error: null,
    });

    const result = await resolveReportLink("tok", "CODE2345");

    expect(rpcMock).toHaveBeenCalledWith("resolve_report_link", {
      p_token: "tok",
      p_code: "CODE2345",
    });
    expect(result).toEqual({ ok: true, clientId: CLIENT, readGrant: "deadbeefcafef00d" });
  });

  it("fails closed to invalid when status is ok but the read grant is missing", async () => {
    // A success without a grant is malformed — treat as denied, never grant a
    // session that can't read anything.
    rpcMock.mockResolvedValueOnce({ data: { status: "ok", client_id: CLIENT }, error: null });
    expect(await resolveReportLink("tok", "CODE2345")).toEqual({ ok: false, reason: "invalid" });
  });

  it("maps a wrong code to invalid", async () => {
    rpcMock.mockResolvedValueOnce({ data: { status: "invalid" }, error: null });
    expect(await resolveReportLink("tok", "WRONG")).toEqual({ ok: false, reason: "invalid" });
  });

  it("maps an unknown/revoked token to invalid — IDENTICAL to a wrong code (no oracle)", async () => {
    // The DB returns 'invalid' for both a bad token and a bad code; the service
    // must not manufacture a distinction the DB deliberately withholds.
    rpcMock.mockResolvedValueOnce({ data: { status: "invalid" }, error: null });
    const badToken = await resolveReportLink("nope", "CODE2345");
    rpcMock.mockResolvedValueOnce({ data: { status: "invalid" }, error: null });
    const badCode = await resolveReportLink("tok", "nope");
    expect(badToken).toEqual(badCode);
  });

  it("maps a locked link to locked", async () => {
    rpcMock.mockResolvedValueOnce({ data: { status: "locked" }, error: null });
    expect(await resolveReportLink("tok", "WRONG")).toEqual({ ok: false, reason: "locked" });
  });

  it("fails closed to invalid when the RPC returns an error (e.g. DB not yet applied)", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "function does not exist" } });
    expect(await resolveReportLink("tok", "CODE2345")).toEqual({ ok: false, reason: "invalid" });
  });

  it("fails closed to invalid when the RPC throws", async () => {
    rpcMock.mockRejectedValueOnce(new Error("network down"));
    expect(await resolveReportLink("tok", "CODE2345")).toEqual({ ok: false, reason: "invalid" });
  });

  it("fails closed to invalid on a malformed result (ok without a client_id)", async () => {
    rpcMock.mockResolvedValueOnce({ data: { status: "ok", read_grant: "x" }, error: null });
    expect(await resolveReportLink("tok", "CODE2345")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("readReportLinkSource (token + grant → the report source, fails closed)", () => {
  const bundle = {
    client_id: CLIENT,
    client_name: "Acme Corp",
    posts: [{ linkedin_post_id: "p1", client_id: CLIENT, impressions: 100 }],
    uploads: [
      { created_at: "2026-07-10T00:00:00.000Z", follower_count: 400, connections_count: 4820 },
      { created_at: "2026-07-20T00:00:00.000Z", follower_count: 500, connections_count: null },
    ],
    attributes: [
      {
        linkedin_post_id: "p1",
        post_format_type: "image",
        recorded_at: "2026-07-20T00:00:00.000Z",
      },
    ],
  };

  it("maps the bundle for a valid token + grant", async () => {
    rpcMock.mockResolvedValueOnce({ data: bundle, error: null });

    const src = await readReportLinkSource("tok", "grant123");

    expect(rpcMock).toHaveBeenCalledWith("report_link_read", {
      p_token: "tok",
      p_grant: "grant123",
    });
    expect(src).toEqual({
      clientId: CLIENT,
      clientName: "Acme Corp",
      posts: bundle.posts,
      uploads: [
        { createdAt: "2026-07-10T00:00:00.000Z", followerCount: 400, connectionsCount: 4820 },
        { createdAt: "2026-07-20T00:00:00.000Z", followerCount: 500, connectionsCount: null },
      ],
      attributes: bundle.attributes,
    });
  });

  it("returns null (no data) when the grant is invalid/expired — the RPC returns null", async () => {
    // ⚠️ THE TWO-FACTOR REACHES THE DATA. A token WITHOUT a valid grant reads
    // nothing: the definer function returns SQL null, which maps to null here.
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await readReportLinkSource("tok", "bad-or-expired")).toBeNull();
  });

  it("fails closed to null on an RPC error", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await readReportLinkSource("tok", "grant")).toBeNull();
  });

  it("fails closed to null when the RPC throws", async () => {
    rpcMock.mockRejectedValueOnce(new Error("network down"));
    expect(await readReportLinkSource("tok", "grant")).toBeNull();
  });
});

describe("readReportLinkSource — the connection count reaches the public report", () => {
  it("maps connections_count on every upload, keeping an absent one null", async () => {
    // ⚠️ THE DEFINER READ RETURNS WHOLE UPLOAD ROWS (`to_jsonb(u)`), so the new
    // column arrives with no SQL change — but it still has to be MAPPED here, or
    // the public report silently reports every client as having no connections.
    rpcMock.mockResolvedValueOnce({
      data: {
        client_id: CLIENT,
        client_name: "Acme Corp",
        posts: [],
        uploads: [
          { created_at: "2026-07-10T00:00:00.000Z", follower_count: 400, connections_count: 4820 },
          { created_at: "2026-07-20T00:00:00.000Z", follower_count: 500, connections_count: null },
        ],
        attributes: [],
      },
      error: null,
    });

    const src = await readReportLinkSource("tok", "grant");

    expect(src!.uploads[0]!.connectionsCount).toBe(4820);
    expect(src!.uploads[1]!.connectionsCount).toBeNull();
  });

  it("maps a MISSING connections_count key to null — never 0", async () => {
    // Rows written before the column existed carry no key at all.
    rpcMock.mockResolvedValueOnce({
      data: {
        client_id: CLIENT,
        posts: [],
        uploads: [{ created_at: "2026-07-10T00:00:00.000Z", follower_count: 400 }],
        attributes: [],
      },
      error: null,
    });

    const src = await readReportLinkSource("tok", "grant");

    expect(src!.uploads[0]!.connectionsCount).toBeNull();
    expect(src!.uploads[0]!.connectionsCount).not.toBe(0);
  });
});
