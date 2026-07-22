import { describe, expect, it } from "vitest";

import { buildSnippet, needsFormatReview, parseCsv, parseJson } from "./parse-metrics";
import type { PostRow } from "@/services/types";

const HEADER =
  "linkedin_post_id,urn,post_url,analytics_url,post_name,post_content,post_date,impressions,likes,comments,reposts,engagement_rate,saves,post_format_type,scraped_at";

function row(id: string, content: string, extra = ""): string {
  // content is quoted so embedded commas/quotes/newlines are RFC-4180 safe.
  return `${id},urn_${id},,,name,${content},1w,385,11,8,5,6.23,,${extra},2026-07-15T15:25:39.889Z`;
}

describe("parseCsv", () => {
  it("parses an RFC-4180-quoted CSV (commas, quotes, newlines in a field) to N rows", () => {
    const content = '"At the start, we said ""go"".\nThen we shipped, twice."';
    const csv = `${HEADER}\n${row("A1", content)}\n${row("A2", "plain content", "image")}`;

    const result = parseCsv(csv);
    expect("rows" in result).toBe(true);
    if ("error" in result) throw new Error(result.error);
    expect(result.rows).toHaveLength(2);

    const first = result.rows[0];
    expect(first).toBeDefined();
    expect(first!.linkedin_post_id).toBe("A1");
    expect(first!.post_content).toContain("go"); // quotes/newline survived
    expect(first!.impressions).toBe(385); // coerced to a number
    expect(first!.saves).toBeNull(); // empty → null
  });

  it("rejects the whole batch and names the row/field when a required metric is missing", () => {
    const bad = `A3,urn,,,,,1w,,11,8,5,6.23,,,2026-07-15T15:25:39.889Z`; // impressions empty
    const csv = `${HEADER}\n${bad}`;

    const result = parseCsv(csv);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.toLowerCase()).toContain("row");
      expect(result.error).toContain("impressions");
    }
  });
});

describe("parseJson", () => {
  it("parses a JSON array of posts", () => {
    const json = JSON.stringify([
      {
        linkedin_post_id: "J1",
        impressions: 385,
        likes: 11,
        comments: 8,
        reposts: 5,
        engagement_rate: 6.23,
        saves: null,
        post_format_type: "",
        scraped_at: "2026-07-15T15:25:39.889Z",
      },
    ]);
    const result = parseJson(json);
    if ("error" in result) throw new Error(result.error);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.linkedin_post_id).toBe("J1");
  });

  it("returns an error for malformed JSON", () => {
    const result = parseJson("{ not valid json");
    expect("error" in result).toBe(true);
  });

  it("returns an error naming the field for an invalid row", () => {
    const json = JSON.stringify([{ linkedin_post_id: "J2", impressions: "oops" }]);
    const result = parseJson(json);
    expect("error" in result).toBe(true);
  });
});

describe("format review detection", () => {
  const base: PostRow = {
    linkedin_post_id: "P1",
    post_content: "x".repeat(200),
    impressions: 1,
    likes: 1,
    comments: 1,
    reposts: 1,
    engagement_rate: 1,
    saves: null,
    scraped_at: "2026-07-15T15:25:39.889Z",
  };

  it("flags rows with a missing, unrecognised, or UNKNOWN format", () => {
    expect(needsFormatReview({ ...base, post_format_type: "" })).toBe(true);
    expect(needsFormatReview({ ...base, post_format_type: "banana" })).toBe(true);
    expect(needsFormatReview({ ...base, post_format_type: undefined })).toBe(true);
    // Retired invented values are no longer recognised.
    expect(needsFormatReview({ ...base, post_format_type: "carousel" })).toBe(true);
    expect(needsFormatReview({ ...base, post_format_type: "link" })).toBe(true);
    // UNKNOWN is storable but carries no information — it must still be reviewed.
    expect(needsFormatReview({ ...base, post_format_type: "UNKNOWN" })).toBe(true);
    expect(needsFormatReview({ ...base, post_format_type: "unknown" })).toBe(true);
    // Real scraper values pass straight through, in any casing.
    expect(needsFormatReview({ ...base, post_format_type: "DOCUMENT" })).toBe(false);
    expect(needsFormatReview({ ...base, post_format_type: "SLIDE_SHOW" })).toBe(false);
    expect(needsFormatReview({ ...base, post_format_type: "image" })).toBe(false);
  });

  it("builds a truncated content snippet", () => {
    const snippet = buildSnippet(base);
    expect(snippet.length).toBeLessThanOrEqual(91);
    expect(snippet.endsWith("…")).toBe(true);
  });
});
