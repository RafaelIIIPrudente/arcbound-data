import type { MetadataRoute } from "next";

import { getSiteURL } from "@/lib/get-site-url";
import { buildSitemap } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(getSiteURL(), new Date());
}
