import type { NextConfig } from "next";

// Static security response headers applied to every route. CSP is intentionally
// NOT here — it needs a per-request nonce and is set in src/middleware.ts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS only in production (never send it over plain http in local dev).
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Dev and production build get SEPARATE output directories.
  //
  // Both default to `.next`, so running `pnpm build` while `next dev` is up made
  // the build replace the dev server's tree mid-write — after which dev ENOENTs
  // on `.next/static/development/_buildManifest.js.tmp.*` forever, because the
  // directory it renames into no longer exists. It cannot recover on its own.
  //
  // Production stays at `.next` on purpose: Dockerfile copies `.next/standalone`
  // and `.next/static`, and `next start` resolves this same config. Only dev
  // moves aside, so nothing downstream changes.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
