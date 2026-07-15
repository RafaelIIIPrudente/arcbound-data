import { describe, expect, it } from "vitest";

import { buildRobots, buildSitemap, SITEMAP_ROUTES } from "./seo";

describe("buildSitemap", () => {
  it("lists every public route as an absolute URL (no double slashes)", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    const entries = buildSitemap("https://example.com/", date);

    expect(entries).toHaveLength(SITEMAP_ROUTES.length);
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://example.com/");
    expect(urls).toContain("https://example.com/auth/sign-in");
    // absolute + no accidental "//" after the scheme
    urls.forEach((u) => expect(u.replace("https://", "")).not.toContain("//"));
    expect(entries[0]?.lastModified).toBe(date);
  });
});

describe("buildRobots", () => {
  it("disallows the private dashboard and points at the sitemap", () => {
    const robots = buildRobots("https://example.com/");
    expect(robots.rules).toMatchObject({ userAgent: "*", disallow: "/dashboard/" });
    expect(robots.sitemap).toBe("https://example.com/sitemap.xml");
  });
});
