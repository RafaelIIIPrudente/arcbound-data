import { ImageResponse } from "next/og";

import { config } from "@/config";

// Next auto-wires this generated image into openGraph.images / twitter.images.
export const alt = config.site.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        backgroundColor: "#0a0a0a",
        color: "#ffffff",
        padding: "80px",
      }}
    >
      <div
        style={{
          fontSize: 38,
          opacity: 0.6,
          marginBottom: 28,
          textTransform: "uppercase",
          letterSpacing: 6,
        }}
      >
        Arcbound internal
      </div>
      <div style={{ display: "flex", fontSize: 108, fontWeight: 800, lineHeight: 1.05 }}>
        <span>Arc</span>
        <span style={{ color: "#f63a3a" }}>Base</span>
      </div>
      <div style={{ fontSize: 34, opacity: 0.75, marginTop: 28, maxWidth: 920, lineHeight: 1.3 }}>
        {config.site.description}
      </div>
    </div>,
    { ...size },
  );
}
