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

// ── The PRE-WRITE name-match gate ────────────────────────────────────────────
// Attribution is a downstream name match (ADR 0009). When the scraped authors
// won't match the selected client, the posts are written and then never appear.
// The check is free (no database) and runs BEFORE the write.

/** The production string, verbatim (2026-08-18): duplicated name + Premium badge. */
const EITAN = "Eitan Hoenig Eitan Hoenig • You Premium • You";

/** A client the action can actually read. */
function client(name: string) {
  return { id: CLIENT, name, linkedinUrl: "https://x", postsCount: 0, createdAt: "" };
}

describe("ingestMetricsAction — the name-match gate runs BEFORE the write", () => {
  it("writes straight through when every scraped author matches", async () => {
    parseJsonMock.mockReturnValue({ rows: [{ post_name: "Bryan Wish • You" }] });
    getClientMock.mockResolvedValue(client("Bryan Wish"));

    const result = await ingestMetricsAction(null, form());

    expect(result.status).toBe("ok");
    expect(ingestMock).toHaveBeenCalledTimes(1);
  });

  it("⚠️ NOTHING IS WRITTEN when an author won't match — the seam is never called", async () => {
    // THE WHOLE SLICE. Fourteen posts were written and stranded before anyone was
    // told why. A warning that arrives after an irreversible write, on a screen
    // headed by a success summary, is indistinguishable from no warning at all.
    parseJsonMock.mockReturnValue({ rows: [{ post_name: EITAN }] });
    getClientMock.mockResolvedValue(client("Eitan Hoenig"));

    const result = await ingestMetricsAction(null, form());

    expect(result.status).toBe("name-mismatch");
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("carries the DISTINCT scraped names with counts, not a sentence", async () => {
    // "14 of 14 won't match" is a verdict. The scraped string beside the client's
    // name is a diagnosis someone can act on.
    parseJsonMock.mockReturnValue({
      rows: Array.from({ length: 14 }, () => ({ post_name: EITAN })),
    });
    getClientMock.mockResolvedValue(client("Eitan Hoenig"));

    const result = await ingestMetricsAction(null, form());

    expect(result.status).toBe("name-mismatch");
    if (result.status !== "name-mismatch") return;
    expect(result.report.clientName).toBe("Eitan Hoenig");
    expect(result.report.authors).toEqual([
      {
        postName: EITAN,
        cleaned: "Eitan Hoenig Eitan Hoenig • You Premium",
        count: 14,
        matches: false,
      },
    ]);
    expect(result.report.total).toBe(14);
    expect(result.report.mismatched).toBe(14);
  });

  it("⚠️ runs BEFORE format review — no formats are resolved for invisible posts", async () => {
    // Format Review lives inside the seam. If the gate sat after it, staff would
    // work through a review screen for posts that were never going to appear.
    ingestMock.mockResolvedValue({
      status: "review",
      posts: [{ linkedin_post_id: "a", snippet: "s" }],
    });
    parseJsonMock.mockReturnValue({ rows: [{ post_name: EITAN }] });
    getClientMock.mockResolvedValue(client("Eitan Hoenig"));

    const result = await ingestMetricsAction(null, form());

    expect(result.status).toBe("name-mismatch");
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("proceeds once confirmed, and the summary STILL carries the warning", async () => {
    // The confirmation is a decision, not a dismissal: the reminder belongs on
    // the screen staff actually keep.
    parseJsonMock.mockReturnValue({ rows: [{ post_name: EITAN }] });
    getClientMock.mockResolvedValue(client("Eitan Hoenig"));

    const result = await ingestMetricsAction(null, form({ confirmNameMismatch: "true" }));

    expect(result.status).toBe("ok");
    expect(ingestMock).toHaveBeenCalledTimes(1);
    expect(result.status === "ok" && result.warning).toContain("1 of 1");
    expect(result.status === "ok" && result.warning).toContain("Eitan Hoenig");
  });

  it("⚠️ a plain 'Name • You' upload is unchanged — no extra click, ever", async () => {
    // Bryan's scrape is clean and covers nearly every upload. A gate that fired
    // on the ordinary case would be clicked through without reading.
    parseJsonMock.mockReturnValue({
      rows: [{ post_name: "Bryan Wish • You" }, { post_name: "Bryan Wish • you" }],
    });
    getClientMock.mockResolvedValue(client("Bryan Wish"));

    const result = await ingestMetricsAction(null, form());

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.warning).toBeUndefined();
    expect(ingestMock).toHaveBeenCalledTimes(1);
  });
});

describe("ingestMetricsAction — when the client CANNOT be read", () => {
  // ⚠️ "COULD NOT CHECK" IS NOT "MATCHES". Blocking on an infrastructure failure
  // would strand staff holding data they cannot get in; silently passing would
  // claim a match nobody verified. It proceeds AND says it could not check.
  it("does NOT block when getClient throws", async () => {
    parseJsonMock.mockReturnValue({ rows: [{ post_name: EITAN }] });
    getClientMock.mockRejectedValue(new Error("Failed to load client: boom"));

    const result = await ingestMetricsAction(null, form());

    expect(result.status).toBe("ok");
    expect(ingestMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT claim a match when getClient throws — it says the check did not run", async () => {
    parseJsonMock.mockReturnValue({ rows: [{ post_name: EITAN }] });
    getClientMock.mockRejectedValue(new Error("boom"));

    const result = await ingestMetricsAction(null, form());

    expect(result.status === "ok" && result.warning).toMatch(/couldn't check|could not check/i);
  });

  it("does the same when the client row is simply absent", async () => {
    parseJsonMock.mockReturnValue({ rows: [{ post_name: EITAN }] });
    getClientMock.mockResolvedValue(null);

    const result = await ingestMetricsAction(null, form());

    expect(result.status).toBe("ok");
    expect(ingestMock).toHaveBeenCalledTimes(1);
    expect(result.status === "ok" && result.warning).toMatch(/couldn't check|could not check/i);
  });
});
