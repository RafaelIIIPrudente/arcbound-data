import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostRow } from "@/services/types";

// ── Mocks: keep the suite hermetic — never touch the live DB. ────────────────
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ rpc: rpcMock }) }));

import {
  applyResolvedFormats,
  attachTypedMetrics,
  computeReviewPosts,
  ingestMetrics,
  resolveFormat,
  typedMetrics,
} from "./ingest";

function makeRow(id: string, over: Partial<PostRow> = {}): PostRow {
  return {
    linkedin_post_id: id,
    post_content: `content for ${id}`,
    impressions: 100,
    likes: 10,
    comments: 2,
    reposts: 1,
    engagement_rate: 3.2,
    saves: null,
    post_format_type: "text",
    scraped_at: "2026-07-15T00:00:00.000Z",
    ...over,
  };
}

const base = {
  clientId: "11111111-1111-1111-1111-111111111111",
  sourceType: "csv" as const,
  followerCount: 18420,
};

beforeEach(() => rpcMock.mockReset());

describe("resolveFormat (pure)", () => {
  it("prefers the row's own confident format, then a resolved choice, then null", () => {
    expect(resolveFormat(makeRow("a", { post_format_type: "video" }))).toBe("video");
    expect(resolveFormat(makeRow("a", { post_format_type: "" }), { a: "image" })).toBe("image");
    expect(resolveFormat(makeRow("a", { post_format_type: "" }), { a: "nonsense" })).toBeNull();
    expect(resolveFormat(makeRow("a", { post_format_type: "" }))).toBeNull();
  });

  it("accepts the real scraper formats but sends UNKNOWN to review", () => {
    expect(resolveFormat(makeRow("a", { post_format_type: "DOCUMENT" }))).toBe("DOCUMENT");
    expect(resolveFormat(makeRow("a", { post_format_type: "SLIDE_SHOW" }))).toBe("SLIDE_SHOW");
    // UNKNOWN is storable but not confident — it must fall through to review.
    expect(resolveFormat(makeRow("a", { post_format_type: "UNKNOWN" }))).toBeNull();
    // A resolved choice of UNKNOWN is not a resolution either.
    expect(resolveFormat(makeRow("a", { post_format_type: "" }), { a: "UNKNOWN" })).toBeNull();
  });

  it("returns the RAW value it received, never a normalised one (ADR 0009)", () => {
    expect(resolveFormat(makeRow("a", { post_format_type: "image" }))).toBe("image");
    expect(resolveFormat(makeRow("a", { post_format_type: "Document" }))).toBe("Document");
    expect(resolveFormat(makeRow("a", { post_format_type: "" }), { a: "document" })).toBe(
      "document",
    );
  });
});

describe("computeReviewPosts (pure review gate)", () => {
  it("returns rows whose format is still unknown", () => {
    const rows = [
      makeRow("a", { post_format_type: "video" }),
      makeRow("b", { post_format_type: "" }),
    ];
    const review = computeReviewPosts(rows, undefined, undefined);
    expect(review.map((p) => p.linkedin_post_id)).toEqual(["b"]);
    expect(typeof review[0]!.snippet).toBe("string");
  });

  it("is empty when resolved covers the unknowns", () => {
    const rows = [makeRow("b", { post_format_type: "" })];
    expect(computeReviewPosts(rows, { b: "image" }, undefined)).toEqual([]);
  });

  it("is empty when skipReview is set", () => {
    const rows = [makeRow("b", { post_format_type: "" })];
    expect(computeReviewPosts(rows, undefined, true)).toEqual([]);
  });

  it("reviews UNKNOWN rows but lets real scraper formats through", () => {
    const rows = [
      makeRow("doc", { post_format_type: "DOCUMENT" }),
      makeRow("poll", { post_format_type: "POLL" }),
      makeRow("lower", { post_format_type: "image" }),
      makeRow("unk", { post_format_type: "UNKNOWN" }),
    ];
    const review = computeReviewPosts(rows, undefined, undefined);
    expect(review.map((p) => p.linkedin_post_id)).toEqual(["unk"]);
  });
});

describe("applyResolvedFormats (pure)", () => {
  it("settles each row's post_format_type to its resolved value", () => {
    const rows = [
      makeRow("a", { post_format_type: "video" }),
      makeRow("b", { post_format_type: "" }),
      makeRow("c", { post_format_type: "" }),
    ];
    const out = applyResolvedFormats(rows, { b: "image" });
    expect(out.map((r) => r.post_format_type)).toEqual(["video", "image", undefined]);
  });
});

describe("typedMetrics (pure) — ⚠️ NULL and 0 are different facts (ADR 0010, D4)", () => {
  it("keeps a GENUINE zero as 0 and an ABSENT value as null", () => {
    // The whole ADR in one assertion. `saves: 0` is a measurement — this post was
    // saved by nobody. `saves: null` is the absence of a measurement — the scrape
    // carried no saves column at all. A schema that stored both as 0 would make
    // the two indistinguishable forever, and every "0 saves" in the report would
    // be unfalsifiable.
    expect(typedMetrics(makeRow("a", { saves: 0 })).n_saves).toBe(0);

    const absent = typedMetrics(makeRow("a", { saves: null }));
    expect(absent.n_saves).toBeNull();
    // Stated separately and on purpose: `toBeNull()` alone still passes if a
    // future change returns 0, because this line is what fails then.
    expect(absent.n_saves).not.toBe(0);
  });

  it("carries a zero impression count through as 0, not as unreadable", () => {
    const t = typedMetrics(makeRow("a", { impressions: 0 }));
    expect(t.n_impressions).toBe(0);
    expect(t.n_impressions).not.toBeNull();
  });

  it("maps an unreadable metric to null rather than 0", () => {
    // ⚠️ `parse-metrics.ts` currently REJECTS the whole upload when a required
    // metric is unreadable, so this branch is unreachable from today's live
    // upload path. It is implemented and pinned anyway: the same rule governs the
    // historical backfill, which reads all-text staging where every column can be
    // unreadable, and it must not silently become 0 if parsing is ever relaxed.
    const t = typedMetrics({ ...makeRow("a"), impressions: null, likes: null });
    expect(t.n_impressions).toBeNull();
    expect(t.n_likes).toBeNull();
    expect(t.n_impressions).not.toBe(0);
  });

  it("derives interactions as likes + comments + reposts, EXCLUDING saves", () => {
    // Saves are deliberately not summed in. The scrape's own engagement_rate
    // reconciles exactly against (likes+comments+reposts)/impressions across
    // every sample row in this repo; adding saves would silently restate every
    // published interaction total.
    const t = typedMetrics(makeRow("a", { likes: 10, comments: 2, reposts: 1, saves: 99 }));
    expect(t.n_interactions).toBe(13);
  });

  it("returns a NULL interactions total when ANY component is unreadable", () => {
    // ⚠️ A partial sum printed as a total is the same lie as a null printed as a
    // zero. 10 + 2 + (unreadable) is not 12.
    expect(typedMetrics({ ...makeRow("a"), likes: null }).n_interactions).toBeNull();
    expect(typedMetrics({ ...makeRow("a"), comments: null }).n_interactions).toBeNull();
    expect(typedMetrics({ ...makeRow("a"), reposts: null }).n_interactions).toBeNull();
    // ...but an absent SAVES count does not poison it, because saves is not a term.
    expect(typedMetrics(makeRow("a", { saves: null })).n_interactions).toBe(13);
  });

  it("derives the engagement rate as a PERCENTAGE, matching the dashboard", () => {
    // data-quality.ts reconciles against `(interactions / impressions) * 100`;
    // storing a fraction here would read as a unit mismatch on that screen.
    const t = typedMetrics(makeRow("a", { impressions: 200, likes: 5, comments: 3, reposts: 2 }));
    expect(t.n_calculated_rate).toBeCloseTo(5, 10);
  });

  it("returns a NULL rate when impressions is ZERO — no divide-by-zero, no fake rate", () => {
    const t = typedMetrics(makeRow("a", { impressions: 0 }));
    expect(t.n_calculated_rate).toBeNull();
    expect(t.n_calculated_rate).not.toBe(0);
  });

  it("returns a NULL rate when impressions or interactions is unreadable", () => {
    expect(typedMetrics({ ...makeRow("a"), impressions: null }).n_calculated_rate).toBeNull();
    expect(typedMetrics({ ...makeRow("a"), likes: null }).n_calculated_rate).toBeNull();
  });

  it("passes the scrape's own rate through UNDERIVED, including its absence", () => {
    expect(typedMetrics(makeRow("a", { engagement_rate: 6.23 })).n_provided_rate).toBe(6.23);
    expect(typedMetrics({ ...makeRow("a"), engagement_rate: null }).n_provided_rate).toBeNull();
  });

  it("resolves the publish date from the age and the scrape instant", () => {
    const t = typedMetrics(
      makeRow("a", { post_date: "4d", scraped_at: "2026-07-15T15:25:39.889Z" }),
    );
    expect(t.n_estimated_post_date).toBe("2026-07-11T15:25:39.889Z");
  });

  it("leaves an hour-age post UNDATED, preserving today's charting behaviour", () => {
    expect(typedMetrics(makeRow("a", { post_date: "23h" })).n_estimated_post_date).toBeNull();
    expect(typedMetrics(makeRow("a", { post_date: undefined })).n_estimated_post_date).toBeNull();
  });
});

describe("attachTypedMetrics (pure) — dual-write payload", () => {
  it("adds typed siblings WITHOUT altering a single raw key", () => {
    // ⚠️ The staging write must stay byte-for-byte what it is today, because
    // the staging write stayed byte-identical through the cutover. The typed
    // keys rode alongside it, and are all that is written now.
    const row = makeRow("a", { post_date: "4d", saves: null });
    const [out] = attachTypedMetrics([row]);

    for (const key of Object.keys(row) as (keyof PostRow)[]) {
      expect(out![key]).toEqual(row[key]);
    }
    expect(out!.n_interactions).toBe(13);
    expect(out!.n_saves).toBeNull();
  });

  it("returns one output row per input row, in order", () => {
    const out = attachTypedMetrics([makeRow("a"), makeRow("b"), makeRow("c")]);
    expect(out.map((r) => r.linkedin_post_id)).toEqual(["a", "b", "c"]);
  });
});

describe("ingestMetrics (seam → RPC)", () => {
  it("returns review WITHOUT calling the RPC when a format needs review", async () => {
    const rows = [makeRow("x", { post_format_type: "" })];
    const result = await ingestMetrics({ ...base, rows });
    expect(result.status).toBe("review");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls ingest_metrics with raw rows and returns the summary on ok", async () => {
    rpcMock.mockResolvedValue({ data: { inserted: 2, updated: 1, unchanged: 0 }, error: null });
    const rows = [
      makeRow("a", { post_format_type: "video" }),
      makeRow("b", { post_format_type: "" }),
    ];

    const result = await ingestMetrics({ ...base, rows, skipReview: true });

    expect(result).toEqual({ status: "ok", summary: { inserted: 2, updated: 1, unchanged: 0 } });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0]!;
    expect(fn).toBe("ingest_metrics");
    expect(args.p_client_id).toBe(base.clientId);
    expect(args.p_source_type).toBe("csv");
    expect(args.p_follower_count).toBe(18420);
    // row b's unknown format was written as null (skipReview), a kept "video"
    expect(args.p_rows.map((r: PostRow) => r.post_format_type)).toEqual(["video", undefined]);
  });

  it("passes the connection count through as p_connections_count", async () => {
    rpcMock.mockResolvedValue({ data: { inserted: 1, updated: 0, unchanged: 0 }, error: null });

    await ingestMetrics({ ...base, rows: [makeRow("a")], connectionsCount: 4820 });

    expect(rpcMock.mock.calls[0]![1].p_connections_count).toBe(4820);
  });

  it("sends p_connections_count as NULL when the scrape carried none — never 0", async () => {
    // ⚠️ THE COUNT IS OPTIONAL, AND ABSENT IS NOT ZERO. A `0` here would write a
    // measured zero into an immutable audit row for a number nobody supplied,
    // and every trend, delta and table downstream would then read it as a real
    // reading. The RPC parameter must be explicitly present and null — omitting
    // it entirely would leave the argument unbound at the database.
    rpcMock.mockResolvedValue({ data: { inserted: 1, updated: 0, unchanged: 0 }, error: null });

    await ingestMetrics({ ...base, rows: [makeRow("a")] });

    const args = rpcMock.mock.calls[0]![1];
    expect(args).toHaveProperty("p_connections_count");
    expect(args.p_connections_count).toBeNull();
    expect(args.p_connections_count).not.toBe(0);
  });

  it("keeps a GENUINE zero connection count as 0", async () => {
    rpcMock.mockResolvedValue({ data: { inserted: 1, updated: 0, unchanged: 0 }, error: null });

    await ingestMetrics({ ...base, rows: [makeRow("a")], connectionsCount: 0 });

    expect(rpcMock.mock.calls[0]![1].p_connections_count).toBe(0);
  });

  it("applies resolvedFormatTypes to the rows before the RPC", async () => {
    rpcMock.mockResolvedValue({ data: { inserted: 1, updated: 0, unchanged: 0 }, error: null });
    const rows = [makeRow("b", { post_format_type: "" })];

    await ingestMetrics({ ...base, rows, resolvedFormatTypes: { b: "DOCUMENT" } });

    const args = rpcMock.mock.calls[0]![1];
    expect(args.p_rows[0].post_format_type).toBe("DOCUMENT");
  });

  it("writes format values to the RPC byte-for-byte raw (ADR 0009)", async () => {
    rpcMock.mockResolvedValue({ data: { inserted: 2, updated: 0, unchanged: 0 }, error: null });
    const rows = [
      makeRow("a", { post_format_type: "DOCUMENT" }),
      makeRow("b", { post_format_type: "image" }), // lowercase as received
    ];

    await ingestMetrics({ ...base, rows });

    const args = rpcMock.mock.calls[0]![1];
    // Recognition is case-insensitive; storage is NOT re-cased.
    expect(args.p_rows.map((r: PostRow) => r.post_format_type)).toEqual(["DOCUMENT", "image"]);
  });

  it("routes an UNKNOWN row to review without calling the RPC", async () => {
    const rows = [makeRow("u", { post_format_type: "UNKNOWN" })];
    const result = await ingestMetrics({ ...base, rows });
    expect(result.status).toBe("review");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("sends the typed siblings alongside the raw values in ONE array", async () => {
    // One array, one loop at the database — no join-by-id and no second array
    // that could drift out of alignment with the first.
    rpcMock.mockResolvedValue({ data: { inserted: 1, updated: 0, unchanged: 0 }, error: null });
    const rows = [
      makeRow("a", {
        post_format_type: "video",
        post_date: "4d",
        scraped_at: "2026-07-15T15:25:39.889Z",
        impressions: 200,
        likes: 5,
        comments: 3,
        reposts: 2,
        saves: null,
      }),
    ];

    await ingestMetrics({ ...base, rows });

    const sent = rpcMock.mock.calls[0]![1].p_rows[0];
    // Raw, exactly as received — this is what still lands in staging.
    expect(sent.impressions).toBe(200);
    expect(sent.post_date).toBe("4d");
    // Typed, resolved, four-state-preserving — this is what lands in posts.
    expect(sent.n_impressions).toBe(200);
    expect(sent.n_interactions).toBe(10);
    expect(sent.n_calculated_rate).toBeCloseTo(5, 10);
    expect(sent.n_saves).toBeNull();
    expect(sent.n_estimated_post_date).toBe("2026-07-11T15:25:39.889Z");
  });

  it("throws when the RPC returns an error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const rows = [makeRow("a", { post_format_type: "video" })];
    await expect(ingestMetrics({ ...base, rows })).rejects.toThrow(/Ingest failed: boom/);
  });
});
