import { describe, expect, it } from "vitest";

import { ingestMetrics } from "./ingest";
import type { PostRow } from "@/services/types";

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

const base = { clientId: "CLIENT-0001", sourceType: "csv" as const, followerCount: 18420 };

describe("ingestMetrics (mock seam)", () => {
  it("inserts every row on the first upload", async () => {
    const rows = [makeRow("t1-a"), makeRow("t1-b"), makeRow("t1-c")];
    const r = await ingestMetrics({ ...base, rows });
    expect(r).toMatchObject({ status: "ok", summary: { inserted: 3, updated: 0, unchanged: 0 } });
  });

  it("counts an identical re-upload as unchanged", async () => {
    const rows = [makeRow("t2-a"), makeRow("t2-b")];
    await ingestMetrics({ ...base, rows });
    const r = await ingestMetrics({ ...base, rows });
    expect(r).toMatchObject({ status: "ok", summary: { inserted: 0, updated: 0, unchanged: 2 } });
  });

  it("counts a row with a changed metric as updated", async () => {
    await ingestMetrics({ ...base, rows: [makeRow("t3-a")] });
    const r = await ingestMetrics({ ...base, rows: [makeRow("t3-a", { likes: 999 })] });
    expect(r).toMatchObject({ status: "ok", summary: { inserted: 0, updated: 1, unchanged: 0 } });
  });

  it("returns review for new posts missing a format and writes nothing (all-or-nothing)", async () => {
    const rows = [
      makeRow("t4-a", { post_format_type: "" }),
      makeRow("t4-b", { post_format_type: "banana" }),
    ];
    const review = await ingestMetrics({ ...base, rows });
    expect(review.status).toBe("review");
    if (review.status === "review") {
      expect(review.posts.map((p) => p.linkedin_post_id)).toEqual(["t4-a", "t4-b"]);
      expect(review.posts[0]!.snippet).toContain("content for t4-a");
    }
    // Nothing was persisted during review — skipping now inserts all, none unchanged.
    const written = await ingestMetrics({ ...base, rows, skipReview: true });
    expect(written).toMatchObject({ status: "ok", summary: { inserted: 2, unchanged: 0 } });
  });

  it("writes without review when resolvedFormatTypes covers the new posts", async () => {
    const rows = [makeRow("t5-a", { post_format_type: "" })];
    const r = await ingestMetrics({ ...base, rows, resolvedFormatTypes: { "t5-a": "image" } });
    expect(r).toMatchObject({ status: "ok", summary: { inserted: 1 } });
  });

  it("does not review when every new post already has a valid format", async () => {
    const r = await ingestMetrics({
      ...base,
      rows: [makeRow("t6-a", { post_format_type: "video" })],
    });
    expect(r.status).toBe("ok");
  });

  it("does not review posts that are already stored", async () => {
    const rows = [makeRow("t7-a", { post_format_type: "" })];
    await ingestMetrics({ ...base, rows, skipReview: true }); // now stored
    const r = await ingestMetrics({ ...base, rows }); // not new → no review
    expect(r).toMatchObject({ status: "ok", summary: { inserted: 0, unchanged: 1 } });
  });
});
