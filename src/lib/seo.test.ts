import { describe, expect, it } from "vitest";

import { buildRobots, buildSitemap, SITEMAP_ROUTES } from "./seo";

describe("buildSitemap", () => {
  it("is empty — ArcBase is an internal app with no public, indexable routes", () => {
    const entries = buildSitemap("https://example.com/", new Date("2026-01-01T00:00:00.000Z"));
    expect(entries).toEqual([]);
    expect(SITEMAP_ROUTES).toHaveLength(0);
  });
});

describe("buildRobots", () => {
  it("disallows all crawling of the internal app", () => {
    expect(buildRobots().rules).toMatchObject({ userAgent: "*", disallow: "/" });
  });
});
