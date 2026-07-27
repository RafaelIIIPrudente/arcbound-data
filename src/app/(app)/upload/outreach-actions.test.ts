import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hermetic: mock the seam + the parser. This file is about the ENVELOPE and
// the ORDER OF OPERATIONS, so the payload is a fixed stub and nothing touches a
// database. ──────────────────────────────────────────────────────────────────
const { ingestMock, parseMock } = vi.hoisted(() => ({
  ingestMock: vi.fn(),
  parseMock: vi.fn(),
}));

vi.mock("@/services/outreach", () => ({ ingestOutreach: ingestMock }));
vi.mock("@/lib/parse-outreach", () => ({ parseOutreachCsv: parseMock }));

import { ingestOutreachAction } from "./outreach-actions";

const CLIENT = "11111111-1111-1111-1111-111111111111";
const ROWS = [{ full_name: "Dana Reyes", linkedin_url: "https://linkedin.com/in/dana" }];

function form(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("clientId", CLIENT);
  fd.set("rawText", "Full Name,LinkedIn URL\nDana,u");
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  ingestMock.mockReset();
  parseMock.mockReset();
  parseMock.mockReturnValue({ rows: ROWS, unknownHeaders: [] });
  ingestMock.mockResolvedValue({ uploadId: "up1", rowCount: 1435 });
});

describe("ingestOutreachAction — the happy path", () => {
  it("parses, ingests, and reports the snapshot's row count", async () => {
    const result = await ingestOutreachAction(null, form());

    expect(result).toEqual({ status: "ok", rowCount: 1435 });
    expect(ingestMock).toHaveBeenCalledTimes(1);
  });

  it("ATTRIBUTES BY THE SELECTED CLIENT, never by anything in the file", async () => {
    // ⚠️ ADR 0012's central rule, enforced at the last point a human choice can
    // still be honoured. Nothing downstream reads `owner` or any other column to
    // decide whose data this is.
    await ingestOutreachAction(null, form());

    expect(ingestMock.mock.calls[0]![0]).toBe(CLIENT);
  });

  it("hands the seam the parsed rows unchanged", async () => {
    await ingestOutreachAction(null, form());

    expect(ingestMock.mock.calls[0]![1]).toEqual(ROWS);
  });
});

describe("ingestOutreachAction — envelope validation", () => {
  it("rejects a missing client without calling the seam", async () => {
    const result = await ingestOutreachAction(null, form({ clientId: "" }));

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("unreachable");
    expect(result.errors.clientId?.[0]).toMatch(/client/i);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("rejects an empty file without calling the seam", async () => {
    const result = await ingestOutreachAction(null, form({ rawText: "" }));

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("unreachable");
    expect(result.errors.rawText?.[0]).toBeTruthy();
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only file", async () => {
    const result = await ingestOutreachAction(null, form({ rawText: "   \n  " }));

    expect(result.status).toBe("error");
    expect(ingestMock).not.toHaveBeenCalled();
  });
});

describe("ingestOutreachAction — a parse failure WRITES NOTHING", () => {
  // ⚠️ NO PARTIAL SNAPSHOTS, EVER. A snapshot's header row records how many rows
  // it carried; writing anything for a file that did not fully parse would make
  // that number a lie, and the row is immutable so nobody could correct it. The
  // parse must therefore complete BEFORE the seam is reached, not beside it.
  it("returns the parse error and never calls the seam", async () => {
    parseMock.mockReturnValue({ error: "Row 3: Full Name — Full Name is required" });

    const result = await ingestOutreachAction(null, form());

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("unreachable");
    expect(result.errors.payload?.[0]).toMatch(/Full Name is required/);
    // The assertion that fails if anyone reorders parse and ingest.
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("parses BEFORE it ingests, not concurrently", async () => {
    const order: string[] = [];
    parseMock.mockImplementation(() => {
      order.push("parse");
      return { rows: ROWS, unknownHeaders: [] };
    });
    ingestMock.mockImplementation(() => {
      order.push("ingest");
      return Promise.resolve({ uploadId: "up1", rowCount: 1 });
    });

    await ingestOutreachAction(null, form());

    expect(order).toEqual(["parse", "ingest"]);
  });
});

describe("ingestOutreachAction — the 25th column is reported, non-blockingly", () => {
  it("STILL SUCCEEDS when the file carries an unknown column", async () => {
    // ⚠️ NON-BLOCKING IS THE WHOLE DESIGN. Someone adding a column to the sheet
    // must not lose their upload over it; they must merely be told.
    parseMock.mockReturnValue({ rows: ROWS, unknownHeaders: ["Lead Score"] });

    const result = await ingestOutreachAction(null, form());

    expect(result.status).toBe("ok");
    expect(ingestMock).toHaveBeenCalledTimes(1);
  });

  it("names the ignored column verbatim in the warning", async () => {
    parseMock.mockReturnValue({ rows: ROWS, unknownHeaders: ["Lead Score"] });

    const result = await ingestOutreachAction(null, form());

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.warning).toContain("Lead Score");
  });

  it("names EVERY ignored column", async () => {
    parseMock.mockReturnValue({ rows: ROWS, unknownHeaders: ["Lead Score", "Territory"] });

    const result = await ingestOutreachAction(null, form());

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.warning).toContain("Lead Score");
    expect(result.warning).toContain("Territory");
  });

  it("says the data was NOT stored — not merely that a column was 'noticed'", async () => {
    // The warning has to be actionable. "We saw an extra column" invites the
    // reader to assume it landed somewhere.
    parseMock.mockReturnValue({ rows: ROWS, unknownHeaders: ["Lead Score"] });

    const result = await ingestOutreachAction(null, form());

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.warning).toMatch(/not stored|wasn't stored|were not saved/i);
  });

  it("attaches NO warning to a clean 24-column file", async () => {
    // ⚠️ NO FALSE ALARMS. A notice on every ordinary upload is a notice nobody
    // reads, and the one time it matters it would be invisible.
    const result = await ingestOutreachAction(null, form());

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.warning).toBeUndefined();
  });

  it("still reports the row count alongside the warning", async () => {
    parseMock.mockReturnValue({ rows: ROWS, unknownHeaders: ["Lead Score"] });

    const result = await ingestOutreachAction(null, form());

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.rowCount).toBe(1435);
  });

  it("reports a rowCount of 0 as 0 — a real answer, never absent", async () => {
    ingestMock.mockResolvedValue({ uploadId: "up1", rowCount: 0 });

    const result = await ingestOutreachAction(null, form());

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.rowCount).toBe(0);
    expect(result.rowCount).not.toBeUndefined();
  });
});
