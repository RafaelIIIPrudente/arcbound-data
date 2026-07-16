import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostRow } from "@/services/types";

// ── Mocks: keep the suite hermetic — never touch the live DB. ────────────────
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ rpc: rpcMock }) }));

import { applyResolvedFormats, computeReviewPosts, ingestMetrics, resolveFormat } from "./ingest";

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
  it("prefers the row's own valid format, then a resolved choice, then null", () => {
    expect(resolveFormat(makeRow("a", { post_format_type: "video" }))).toBe("video");
    expect(resolveFormat(makeRow("a", { post_format_type: "" }), { a: "image" })).toBe("image");
    expect(resolveFormat(makeRow("a", { post_format_type: "" }), { a: "nonsense" })).toBeNull();
    expect(resolveFormat(makeRow("a", { post_format_type: "" }))).toBeNull();
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

  it("applies resolvedFormatTypes to the rows before the RPC", async () => {
    rpcMock.mockResolvedValue({ data: { inserted: 1, updated: 0, unchanged: 0 }, error: null });
    const rows = [makeRow("b", { post_format_type: "" })];

    await ingestMetrics({ ...base, rows, resolvedFormatTypes: { b: "carousel" } });

    const args = rpcMock.mock.calls[0]![1];
    expect(args.p_rows[0].post_format_type).toBe("carousel");
  });

  it("throws when the RPC returns an error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const rows = [makeRow("a", { post_format_type: "video" })];
    await expect(ingestMetrics({ ...base, rows })).rejects.toThrow(/Ingest failed: boom/);
  });
});
