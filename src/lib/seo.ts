import type { MetadataRoute } from "next";

/**
 * ArcBase is an internal, auth-gated tool (SRS §2): there is no public,
 * indexable surface, so the sitemap is empty and robots disallows all crawling.
 */
export const SITEMAP_ROUTES: readonly string[] = [];

/**
 * Pure: build sitemap entries as absolute URLs against `baseUrl`. `lastModified`
 * is passed in (not read from the clock) so the builder stays deterministic and
 * testable. Currently empty — ArcBase exposes no public routes.
 */
export function buildSitemap(baseUrl: string, lastModified: Date): MetadataRoute.Sitemap {
  return SITEMAP_ROUTES.map((route) => ({
    url: new URL(route, baseUrl).toString(),
    lastModified,
  }));
}

/** Pure: disallow all crawling — the whole app is behind authentication. */
export function buildRobots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
