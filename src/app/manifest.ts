import type { MetadataRoute } from "next";

import { config } from "@/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: config.site.name,
    short_name: config.site.name,
    description: config.site.description,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    // Served by app/icon.tsx (generated via next/og).
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
