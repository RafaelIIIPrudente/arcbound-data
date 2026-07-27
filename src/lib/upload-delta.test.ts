import { describe, expect, it } from "vitest";

import type { Upload } from "@/services/types";

import { connectionsDelta, followersDelta, postsDelta } from "./upload-delta";

/** Uploads arrive newest-first, as `listUploads` returns them. */
function upload(over: Partial<Upload> & { id: string }): Upload {
  return {
    clientId: "c1",
    sourceType: "csv",
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsUnchanged: 0,
    followerCount: null,
    connectionsCount: null,
    createdAt: "2026-07-22T10:00:00.000Z",
    ...over,
  };
}

describe("postsDelta", () => {
  it("reports what the MOST RECENT ingest inserted", () => {
    const delta = postsDelta([
      upload({ id: "u2", rowsInserted: 24 }),
      upload({ id: "u1", rowsInserted: 5 }),
    ]);

    // The newest upload only — not 29, which is the running total.
    expect(delta).toEqual({ value: 24, direction: "up" });
  });

  it("calls an ingest that inserted nothing FLAT, not absent", () => {
    // A real, known zero: the upload ran and added no new posts. Distinct from
    // `null`, which the card renders as no delta at all.
    expect(postsDelta([upload({ id: "u1", rowsInserted: 0 })])).toEqual({
      value: 0,
      direction: "flat",
    });
  });

  it("returns null when there is nothing to report", () => {
    expect(postsDelta([])).toBeNull();
    // A failed uploads read must not surface as a confident zero.
    expect(postsDelta(null)).toBeNull();
  });
});

describe("followersDelta", () => {
  it("subtracts the previous recorded count from the latest", () => {
    const delta = followersDelta([
      upload({ id: "u2", followerCount: 24460 }),
      upload({ id: "u1", followerCount: 24417 }),
    ]);

    expect(delta).toEqual({ value: 43, direction: "up" });
  });

  it("reports a DECLINE as down, with a negative value", () => {
    const delta = followersDelta([
      upload({ id: "u2", followerCount: 24400 }),
      upload({ id: "u1", followerCount: 24460 }),
    ]);

    expect(delta).toEqual({ value: -60, direction: "down" });
  });

  it("SKIPS older uploads that recorded no count rather than treating them as zero", () => {
    const delta = followersDelta([
      upload({ id: "u3", followerCount: 24460 }),
      upload({ id: "u2", followerCount: null }), // skipped, not read as 0
      upload({ id: "u1", followerCount: 24417 }),
    ]);

    // Treating the null as zero would have produced +24,460 then -24,417 —
    // wildly wrong numbers that would still have looked like plausible deltas.
    expect(delta).toEqual({ value: 43, direction: "up" });
  });

  it("reports NOTHING when the newest upload recorded no count", () => {
    const delta = followersDelta([
      upload({ id: "u3", followerCount: null }),
      upload({ id: "u2", followerCount: 24460 }),
      upload({ id: "u1", followerCount: 24417 }),
    ]);

    // ⚠️ THE CARD SHOWS THE NEWEST UPLOAD'S COUNT, so here it shows an em dash.
    // Measuring +43 between the two older uploads would print a change next to
    // a figure that is not on screen — "— ▲43".
    expect(delta).toBeNull();
  });

  it("returns null when only ONE upload recorded a count", () => {
    const delta = followersDelta([
      upload({ id: "u2", followerCount: 24460 }),
      upload({ id: "u1", followerCount: null }),
    ]);

    // Nothing to compare against. Showing +24,460 here would read as explosive
    // growth on a client's very first ingest.
    expect(delta).toBeNull();
  });

  it("reports an unchanged follower count as FLAT, not absent", () => {
    const delta = followersDelta([
      upload({ id: "u2", followerCount: 24460 }),
      upload({ id: "u1", followerCount: 24460 }),
    ]);

    // A flat week is a real finding, not missing data.
    expect(delta).toEqual({ value: 0, direction: "flat" });
  });

  it("returns null for no uploads and for a failed read", () => {
    expect(followersDelta([])).toBeNull();
    expect(followersDelta(null)).toBeNull();
  });
});

describe("connectionsDelta — the same rules, applied to an OPTIONAL count", () => {
  it("subtracts the previous recorded count from the latest", () => {
    const delta = connectionsDelta([
      upload({ id: "u2", connectionsCount: 4860 }),
      upload({ id: "u1", connectionsCount: 4820 }),
    ]);

    expect(delta).toEqual({ value: 40, direction: "up" });
  });

  it("reports a DECLINE as down, with a negative value", () => {
    const delta = connectionsDelta([
      upload({ id: "u2", connectionsCount: 4800 }),
      upload({ id: "u1", connectionsCount: 4860 }),
    ]);

    expect(delta).toEqual({ value: -60, direction: "down" });
  });

  it("SKIPS older uploads that recorded no count rather than treating them as zero", () => {
    // ⚠️ THE COMMON CASE FOR CONNECTIONS, NOT AN EDGE CASE. The field is optional
    // and no historical upload carries one, so gaps are everywhere. Reading a gap
    // as 0 would print a plausible-looking −4,820 then +4,860.
    const delta = connectionsDelta([
      upload({ id: "u3", connectionsCount: 4860 }),
      upload({ id: "u2", connectionsCount: null }),
      upload({ id: "u1", connectionsCount: 4820 }),
    ]);

    expect(delta).toEqual({ value: 40, direction: "up" });
  });

  it("reports NOTHING when the newest upload recorded no count", () => {
    const delta = connectionsDelta([
      upload({ id: "u3", connectionsCount: null }),
      upload({ id: "u2", connectionsCount: 4860 }),
      upload({ id: "u1", connectionsCount: 4820 }),
    ]);

    // The card shows the newest upload's count — an em dash here — so there is
    // nothing on screen for a delta to describe.
    expect(delta).toBeNull();
  });

  it("returns null when only ONE upload recorded a count", () => {
    expect(
      connectionsDelta([
        upload({ id: "u2", connectionsCount: 4860 }),
        upload({ id: "u1", connectionsCount: null }),
      ]),
    ).toBeNull();
  });

  it("reports an unchanged connection count as FLAT, not absent", () => {
    const delta = connectionsDelta([
      upload({ id: "u2", connectionsCount: 4860 }),
      upload({ id: "u1", connectionsCount: 4860 }),
    ]);

    expect(delta).toEqual({ value: 0, direction: "flat" });
  });

  it("returns null for no uploads and for a failed read", () => {
    expect(connectionsDelta([])).toBeNull();
    expect(connectionsDelta(null)).toBeNull();
  });

  it("reads connections ONLY — a follower count never stands in for a missing one", () => {
    // The two figures share a row but are independent readings; borrowing one
    // for the other would invent a connections history out of follower data.
    const delta = connectionsDelta([
      upload({ id: "u2", followerCount: 24460, connectionsCount: null }),
      upload({ id: "u1", followerCount: 24417, connectionsCount: null }),
    ]);

    expect(delta).toBeNull();
  });
});
