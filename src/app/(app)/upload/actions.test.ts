import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hermetic: mock the seam + the payload parser. This file is about the
// ENVELOPE (the form fields around the payload), so the payload itself is a
// fixed stub and nothing touches a database. ─────────────────────────────────
const { ingestMock, getClientMock, parseJsonMock, parseCsvMock } = vi.hoisted(() => ({
  ingestMock: vi.fn(),
  getClientMock: vi.fn(),
  parseJsonMock: vi.fn(),
  parseCsvMock: vi.fn(),
}));

vi.mock("@/services/ingest", () => ({ ingestMetrics: ingestMock }));
vi.mock("@/services/clients", () => ({ getClient: getClientMock }));
vi.mock("@/lib/parse-metrics", () => ({ parseCsv: parseCsvMock, parseJson: parseJsonMock }));

import { ingestMetricsAction } from "./actions";

const CLIENT = "11111111-1111-1111-1111-111111111111";
const ROWS = [{ linkedin_post_id: "a", post_format_type: "text" }];

/** The form envelope, with only the field under test varying. */
function form(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("clientId", CLIENT);
  fd.set("sourceType", "json");
  fd.set("rawText", "[]");
  fd.set("followerCount", "18420");
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  ingestMock.mockReset();
  getClientMock.mockReset();
  parseCsvMock.mockReset();
  parseJsonMock.mockReset();
  parseJsonMock.mockReturnValue({ rows: ROWS });
  parseCsvMock.mockReturnValue({ rows: ROWS });
  ingestMock.mockResolvedValue({
    status: "ok",
    summary: { inserted: 1, updated: 0, unchanged: 0 },
  });
  getClientMock.mockResolvedValue(null);
});

describe("ingestMetricsAction — the connection count is OPTIONAL", () => {
  it("uploads successfully with the connections field BLANK", async () => {
    // ⚠️ THE WHOLE POINT OF THE FIELD BEING OPTIONAL. A staffer who does not have
    // the connection count to hand must still be able to land the scrape; making
    // this required would couple every post-metrics upload to a number that is
    // not always available.
    const result = await ingestMetricsAction(null, form({ connectionsCount: "" }));

    expect(result.status).toBe("ok");
    expect(ingestMock).toHaveBeenCalledTimes(1);
  });

  it("uploads successfully when the connections field is ABSENT entirely", async () => {
    const result = await ingestMetricsAction(null, form());

    expect(result.status).toBe("ok");
  });

  it("passes a blank connections field to the seam as undefined — never 0", async () => {
    // ⚠️ `z.coerce.number()` turns "" into 0. If that slipped through, every
    // upload left blank would record a measured zero into an immutable audit
    // row. Blank must reach the seam as "no value", full stop.
    await ingestMetricsAction(null, form({ connectionsCount: "" }));

    expect(ingestMock.mock.calls[0]![0].connectionsCount).toBeUndefined();
    expect(ingestMock.mock.calls[0]![0].connectionsCount).not.toBe(0);
  });

  it("passes a supplied connections count through to the seam", async () => {
    await ingestMetricsAction(null, form({ connectionsCount: "4820" }));

    expect(ingestMock.mock.calls[0]![0].connectionsCount).toBe(4820);
  });

  it("accepts a thousands-separated connections count", async () => {
    await ingestMetricsAction(null, form({ connectionsCount: "4,820" }));

    expect(ingestMock.mock.calls[0]![0].connectionsCount).toBe(4820);
  });

  it("keeps an explicit ZERO as 0 — a measured zero is a fact, not a blank", async () => {
    await ingestMetricsAction(null, form({ connectionsCount: "0" }));

    expect(ingestMock.mock.calls[0]![0].connectionsCount).toBe(0);
  });

  it.each(["-3", "1.5", "abc"])("rejects %s and never reaches the seam", async (bad) => {
    const result = await ingestMetricsAction(null, form({ connectionsCount: bad }));

    expect(result.status).toBe("error");
    expect(result.status === "error" && result.errors.connectionsCount?.[0]).toBeTruthy();
    // An invalid envelope must not write anything (invariant #4).
    expect(ingestMock).not.toHaveBeenCalled();
  });
});

describe("ingestMetricsAction — the follower count stays REQUIRED", () => {
  it("rejects a blank follower count, exactly as before", async () => {
    const result = await ingestMetricsAction(null, form({ followerCount: "" }));

    expect(result.status).toBe("error");
    expect(result.status === "error" && result.errors.followerCount?.[0]).toBeTruthy();
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("still passes a supplied follower count through", async () => {
    await ingestMetricsAction(null, form({ followerCount: "18,420" }));

    expect(ingestMock.mock.calls[0]![0].followerCount).toBe(18420);
  });
});
