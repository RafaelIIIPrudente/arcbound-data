import { describe, expect, it } from "vitest";

import type { BiPostRow } from "./analytics";
import { buildContentComposition } from "./content-composition";

// ─────────────────────────────────────────────────────────────────────────────
// Content composition is a PURE function over the client's post rows. It reports
// WHAT the content is made of — never what it earned. Every figure is a plain
// frequency, and the four honest states are kept apart: a feature genuinely not
// used is a REAL ZERO (an empty hashtag list, a "0 of M"); a post with no captured
// text CANNOT be analysed and is counted-but-omitted, never a zero of everything.
// ─────────────────────────────────────────────────────────────────────────────

function row(over: Partial<BiPostRow>): BiPostRow {
  return {
    client_id: "c1",
    client_name: "Bryan Wish",
    linkedin_post_id: "p",
    post_url: "https://www.linkedin.com/posts/self",
    post_content: null,
    post_age: null,
    estimated_post_date: "2026-07-01",
    impressions: 0,
    likes: 0,
    comments: 0,
    reposts: 0,
    saves: 0,
    interactions: 0,
    provided_engagement_rate: null,
    calculated_engagement_rate: null,
    scraped_at: null,
    uploaded_at: null,
    ...over,
  };
}

describe("buildContentComposition — hashtags", () => {
  it("CASE-FOLDS hashtags so #SaaS and #saas are one tag with a combined count", () => {
    const c = buildContentComposition([
      row({ linkedin_post_id: "a", post_content: "Big #SaaS news" }),
      row({ linkedin_post_id: "b", post_content: "loving #saas" }),
      row({ linkedin_post_id: "c", post_content: "#AI meets #saas" }),
    ]);
    // #saas used in all three posts, #ai in one; folded and merged.
    expect(c.hashtags).toEqual([
      { tag: "saas", count: 3 },
      { tag: "ai", count: 1 },
    ]);
  });

  it("counts EVERY use of a hashtag — 'usage count' is how often it appears", () => {
    const c = buildContentComposition([
      row({ linkedin_post_id: "a", post_content: "#saas #saas #saas everywhere" }),
    ]);
    // Three uses in one post is a count of three — the plain reading of "how
    // often each was used" (see the flag-5 decision).
    expect(c.hashtags).toEqual([{ tag: "saas", count: 3 }]);
  });

  it("returns an EMPTY list — a real zero — when the client used no hashtags", () => {
    const c = buildContentComposition([row({ post_content: "Just a plain update today." })]);
    // A genuine absence. The component renders this as "No hashtags used", never
    // an em dash (which would mean "could not be analysed").
    expect(c.hashtags).toEqual([]);
    expect(c.analysedPosts).toBe(1);
  });
});

describe("buildContentComposition — post length and the see-more fold", () => {
  it("reports the MEDIAN character count of the analysed posts", () => {
    const c = buildContentComposition([
      row({ linkedin_post_id: "a", post_content: "x".repeat(100) }),
      row({ linkedin_post_id: "b", post_content: "y".repeat(500) }),
      row({ linkedin_post_id: "c", post_content: "z".repeat(1301) }),
    ]);
    expect(c.medianLength).toBe(500); // median of 100, 500, 1301
  });

  it("counts posts that run PAST the 1,300-char see-more fold, and not those at it", () => {
    const c = buildContentComposition([
      row({ linkedin_post_id: "a", post_content: "a".repeat(1301) }), // past
      row({ linkedin_post_id: "b", post_content: "b".repeat(1300) }), // exactly at the fold, not past
      row({ linkedin_post_id: "c", post_content: "c".repeat(200) }), // short
    ]);
    expect(c.pastFold).toBe(1);
  });
});

describe("buildContentComposition — content elements as N of M", () => {
  it("counts a question, an IN-TEXT link, a mention and an emoji", () => {
    const c = buildContentComposition([
      row({ linkedin_post_id: "a", post_content: "What do you all think?" }),
      row({ linkedin_post_id: "b", post_content: "Read more at https://example.com today" }),
      row({ linkedin_post_id: "c", post_content: "Huge thanks to @jane for the intro" }),
      row({ linkedin_post_id: "d", post_content: "So proud of this launch 🚀" }),
    ]);
    expect(c.withQuestion).toBe(1);
    expect(c.withLink).toBe(1);
    expect(c.withMention).toBe(1);
    expect(c.withEmoji).toBe(1);
    expect(c.analysedPosts).toBe(4);
  });

  it("⚠️ 'includes a link' reads the TEXT, never post_url — a post with only its own address counts 0", () => {
    // Every post carries a post_url (its own address). Counting that would report
    // 100% of posts as "including a link". Only a URL inside post_content counts.
    const c = buildContentComposition([
      row({
        linkedin_post_id: "a",
        post_content: "No links in here at all.",
        post_url: "https://www.linkedin.com/posts/a",
      }),
      row({
        linkedin_post_id: "b",
        post_content: "Nor here.",
        post_url: "https://www.linkedin.com/posts/b",
      }),
    ]);
    expect(c.withLink).toBe(0); // both have a post_url; neither has an in-text URL
  });

  it("does not read an email address as a mention", () => {
    const c = buildContentComposition([
      row({ post_content: "Reach me at hello@example.com anytime" }),
    ]);
    expect(c.withMention).toBe(0);
  });
});

describe("buildContentComposition — the four low-N states", () => {
  it("0 posts at all: everything empty/zero, nothing to analyse", () => {
    const c = buildContentComposition([]);
    expect(c.totalPosts).toBe(0);
    expect(c.analysedPosts).toBe(0);
    expect(c.unanalysablePosts).toBe(0);
    expect(c.hashtags).toEqual([]);
    expect(c.medianLength).toBeNull();
    expect(c.pastFold).toBe(0);
  });

  it("a post with NULL or EMPTY text is COUNTED but OMITTED from every feature", () => {
    const c = buildContentComposition([
      row({ linkedin_post_id: "a", post_content: "Real #content with a question?" }),
      row({ linkedin_post_id: "b", post_content: null }),
      row({ linkedin_post_id: "c", post_content: "   " }), // whitespace-only is empty
    ]);
    expect(c.totalPosts).toBe(3); // counted
    expect(c.analysedPosts).toBe(1); // only the one with text
    expect(c.unanalysablePosts).toBe(2);
    // The two textless posts contribute NOTHING to any feature.
    expect(c.hashtags).toEqual([{ tag: "content", count: 1 }]);
    expect(c.withQuestion).toBe(1);
  });

  it("distinguishes GENUINELY ABSENT from COULD-NOT-ANALYSE: all-textless → median null, hashtags empty", () => {
    // ⚠️ THE DISCRIMINATING PAIR. With nothing analysable, medianLength is `null`
    // (the component's em dash — "could not be analysed"), while pastFold and the
    // element counts are a genuine 0. hashtags [] here means "could not analyse",
    // and the component must read analysedPosts to tell that from a real zero.
    const c = buildContentComposition([row({ post_content: null }), row({ post_content: "" })]);
    expect(c.analysedPosts).toBe(0);
    expect(c.medianLength).toBeNull();
    expect(c.hashtags).toEqual([]);
    expect(c.pastFold).toBe(0);
    expect(c.withQuestion).toBe(0);
  });
});
