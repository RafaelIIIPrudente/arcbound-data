import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Favicon (also referenced by the web manifest). Generated via next/og so the
// template ships no binary asset.
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        color: "#ffffff",
        fontSize: 340,
        fontWeight: 700,
        borderRadius: 96,
      }}
    >
      W
    </div>,
    { ...size },
  );
}
