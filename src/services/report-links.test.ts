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
      // This bundle predates the S6 SQL, so it carries no `outreach` key at all —
      // which is exactly the state of every database until staff apply the script.
      outreach: null,
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

describe("readReportLinkSource — the OUTREACH aggregate (S6, counts only)", () => {
  function withOutreach(outreach: unknown) {
    return {
      client_id: CLIENT,
      client_name: "Acme Corp",
      posts: [],
      uploads: [],
      attributes: [],
      outreach,
    };
  }

  it("maps the five counts and the snapshot timestamp, field by field", async () => {
    rpcMock.mockResolvedValueOnce({
      data: withOutreach({
        snapshot_at: "2026-07-27T09:00:00.000Z",
        total_prospects: 1435,
        sent: 1230,
        connected: 217,
        replied: 39,
        meetings_booked: 8,
      }),
      error: null,
    });

    const src = await readReportLinkSource("tok", "grant");

    expect(src!.outreach).toEqual({
      snapshotAt: "2026-07-27T09:00:00.000Z",
      totalProspects: 1435,
      sent: 1230,
      connected: 217,
      replied: 39,
      meetingsBooked: 8,
      // ⚠️ S4: no `has_email_channel` key at all in this bundle — the SQL-first
      // OR pre-S4-SQL state. Never a crash, never zeros.
      email: { status: "not-in-export" },
    });
  });

  it("maps an ABSENT outreach key to null — NEVER to zeros", async () => {
    // ⚠️ THE STATE OF EVERY DATABASE UNTIL STAFF APPLY THE S6 SCRIPT. The key does
    // not exist at all. A Client with 1,230 requests sent would then read "0
    // requests sent" — a false statement, and worse than rendering nothing.
    rpcMock.mockResolvedValueOnce({
      data: {
        client_id: CLIENT,
        client_name: "Acme Corp",
        posts: [],
        uploads: [],
        attributes: [],
      },
      error: null,
    });

    const src = await readReportLinkSource("tok", "grant");

    expect(src!.outreach).toBeNull();
    expect(src!.outreach).not.toEqual(
      expect.objectContaining({ sent: 0, connected: 0, replied: 0, meetingsBooked: 0 }),
    );
  });

  it("maps an explicit null outreach (the Client has no snapshot) to null", async () => {
    // "This Client has no outreach uploaded" — a different sentence from "this
    // Client's outreach shows zero", and the SQL says which one is true.
    rpcMock.mockResolvedValueOnce({ data: withOutreach(null), error: null });
    expect((await readReportLinkSource("tok", "grant"))!.outreach).toBeNull();
  });

  it("maps a MALFORMED outreach (a count missing) to null — never a partial of zeros", async () => {
    rpcMock.mockResolvedValueOnce({
      data: withOutreach({
        snapshot_at: "2026-07-27T09:00:00.000Z",
        total_prospects: 1435,
        sent: 1230,
        connected: 217,
        // `replied` and `meetings_booked` absent — an older/partial shape.
      }),
      error: null,
    });

    expect((await readReportLinkSource("tok", "grant"))!.outreach).toBeNull();
  });

  it("maps a non-numeric count to null rather than coercing it", async () => {
    rpcMock.mockResolvedValueOnce({
      data: withOutreach({
        snapshot_at: "2026-07-27T09:00:00.000Z",
        total_prospects: 1435,
        sent: "1230",
        connected: 217,
        replied: 39,
        meetings_booked: 8,
      }),
      error: null,
    });

    expect((await readReportLinkSource("tok", "grant"))!.outreach).toBeNull();
  });

  it("maps a missing snapshot_at to null — an undated figure states nothing", async () => {
    rpcMock.mockResolvedValueOnce({
      data: withOutreach({
        total_prospects: 1435,
        sent: 1230,
        connected: 217,
        replied: 39,
        meetings_booked: 8,
      }),
      error: null,
    });

    expect((await readReportLinkSource("tok", "grant"))!.outreach).toBeNull();
  });

  it("keeps a genuine zero as a zero — zero meetings is a measurement, not an absence", async () => {
    rpcMock.mockResolvedValueOnce({
      data: withOutreach({
        snapshot_at: "2026-07-27T09:00:00.000Z",
        total_prospects: 1435,
        sent: 1230,
        connected: 217,
        replied: 39,
        meetings_booked: 0,
      }),
      error: null,
    });

    expect((await readReportLinkSource("tok", "grant"))!.outreach!.meetingsBooked).toBe(0);
  });

  it("carries NO prospect string through the seam, whatever the RPC sends", async () => {
    // Defence in depth: the SQL is the privacy boundary, but a future SQL edit that
    // leaked a name must not reach a rendered page through this mapping.
    rpcMock.mockResolvedValueOnce({
      data: withOutreach({
        snapshot_at: "2026-07-27T09:00:00.000Z",
        total_prospects: 1435,
        sent: 1230,
        connected: 217,
        replied: 39,
        meetings_booked: 8,
        full_name: "Dana Whitfield",
        linkedin_url: "https://www.linkedin.com/in/dana-whitfield",
        stage: "Meeting Booked",
      }),
      error: null,
    });

    const src = await readReportLinkSource("tok", "grant");

    expect(JSON.stringify(src!.outreach)).not.toMatch(
      /Dana Whitfield|linkedin\.com|Meeting Booked/,
    );
    expect(Object.keys(src!.outreach!).sort()).toEqual([
      "connected",
      "email",
      "meetingsBooked",
      "replied",
      "sent",
      "snapshotAt",
      "totalProspects",
    ]);
  });
});

describe("readReportLinkSource — the EMAIL block, parsed as OPTIONAL (S4, D9)", () => {
  function withEmailOutreach(over: Record<string, unknown> = {}) {
    return {
      client_id: CLIENT,
      client_name: "Acme Corp",
      posts: [],
      uploads: [],
      attributes: [],
      outreach: {
        snapshot_at: "2026-07-27T09:00:00.000Z",
        total_prospects: 1435,
        sent: 1230,
        connected: 217,
        replied: 39,
        meetings_booked: 8,
        ...over,
      },
    };
  }

  it("⚠️ CODE-FIRST DEPLOY: no has_email_channel key at all → email is not-in-export, and the LinkedIn side is UNAFFECTED", async () => {
    // ⚠️ THE DEPLOY-ORDER CASE D9 EXISTS FOR. The new TypeScript build reads a
    // payload from the OLD SQL, which carries none of the five new keys. This
    // must not crash, must not zero the email figures, and — critically — must
    // not fail the whole outreach object; the LinkedIn side is still complete
    // and must still render.
    rpcMock.mockResolvedValueOnce({ data: withEmailOutreach(), error: null });

    const src = await readReportLinkSource("tok", "grant");

    expect(src!.outreach!.email).toEqual({ status: "not-in-export" });
    expect(src!.outreach!.totalProspects).toBe(1435);
    expect(src!.outreach!.sent).toBe(1230);
  });

  it("has_email_channel: false → email is not-in-export, identically to the absent-key case", async () => {
    rpcMock.mockResolvedValueOnce({
      data: withEmailOutreach({
        has_email_channel: false,
        email_sent: 0,
        email_replied: 0,
        email_meetings_booked: 0,
        combined_meetings: 8,
      }),
      error: null,
    });

    const src = await readReportLinkSource("tok", "grant");

    // ⚠️ EVEN THOUGH THE SQL SENT NUMBERS. The flag decides, not whether the
    // numeric keys happen to be present — a pre-S1 snapshot's columns are all
    // NULL, so the SQL's own counts would already read 0 there, but a snapshot
    // rebuilt for this test with real-looking zeros must STILL be ignored.
    expect(src!.outreach!.email).toEqual({ status: "not-in-export" });
  });

  it("has_email_channel: true with all four counts present → email is ok, mapped field by field", async () => {
    rpcMock.mockResolvedValueOnce({
      data: withEmailOutreach({
        has_email_channel: true,
        email_sent: 645,
        email_replied: 39,
        email_meetings_booked: 13,
        combined_meetings: 19,
      }),
      error: null,
    });

    const src = await readReportLinkSource("tok", "grant");

    expect(src!.outreach!.email).toEqual({
      status: "ok",
      sent: 645,
      replied: 39,
      meetingsBooked: 13,
      combinedMeetings: 19,
    });
  });

  it("⚠️ has_email_channel: true but a count is missing → falls back to not-in-export, WITHOUT failing the LinkedIn side", async () => {
    // A malformed email block degrades only the email side — the LinkedIn
    // figures came from the SAME query and are independently valid.
    rpcMock.mockResolvedValueOnce({
      data: withEmailOutreach({
        has_email_channel: true,
        email_sent: 645,
        email_replied: 39,
        // email_meetings_booked and combined_meetings absent
      }),
      error: null,
    });

    const src = await readReportLinkSource("tok", "grant");

    expect(src!.outreach!.email).toEqual({ status: "not-in-export" });
    expect(src!.outreach!.totalProspects).toBe(1435);
  });

  it("has_email_channel: true but a count is non-numeric → falls back to not-in-export, never a coerced figure", async () => {
    rpcMock.mockResolvedValueOnce({
      data: withEmailOutreach({
        has_email_channel: true,
        email_sent: "645",
        email_replied: 39,
        email_meetings_booked: 13,
        combined_meetings: 19,
      }),
      error: null,
    });

    const src = await readReportLinkSource("tok", "grant");

    expect(src!.outreach!.email).toEqual({ status: "not-in-export" });
  });

  it("keeps a genuine zero in the email block as a zero", async () => {
    rpcMock.mockResolvedValueOnce({
      data: withEmailOutreach({
        has_email_channel: true,
        email_sent: 0,
        email_replied: 0,
        email_meetings_booked: 0,
        combined_meetings: 8,
      }),
      error: null,
    });

    const src = await readReportLinkSource("tok", "grant");

    expect(src!.outreach!.email).toEqual({
      status: "ok",
      sent: 0,
      replied: 0,
      meetingsBooked: 0,
      combinedMeetings: 8,
    });
  });

  it("carries no prospect string through the email block either, whatever the RPC sends", async () => {
    rpcMock.mockResolvedValueOnce({
      data: withEmailOutreach({
        has_email_channel: true,
        email_sent: 645,
        email_replied: 39,
        email_meetings_booked: 13,
        combined_meetings: 19,
        email_best_email: "dana@northwind.io",
        email_notes: "called twice",
      }),
      error: null,
    });

    const src = await readReportLinkSource("tok", "grant");

    expect(JSON.stringify(src!.outreach!.email)).not.toMatch(/dana@northwind\.io|called twice/);
  });
});
