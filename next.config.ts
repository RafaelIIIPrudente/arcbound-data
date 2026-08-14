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
  experimental: {
    serverActions: {
      // ⚠️ RAISED FROM NEXT'S 1 MB DEFAULT BECAUSE THE REAL FILE DOES NOT FIT.
      //
      // The Outreach "Master Database" CSV measured 1,493,914 bytes (1.42 MiB)
      // on 2026-07-27 at 1,435 prospects — about 1.46x the default — and it grows
      // every time a prospect is added. Left unset, the Outreach upload fails
      // with a body-size error BEFORE any action code runs: no validation
      // message, no parse error, nothing the form could show. The feature simply
      // cannot work at the default, so this is not tuning, it is a prerequisite.
      //
      // ⚠️ THIS TRANSPORT HAS A CEILING, AND 4 MB IS ALREADY NEAR IT. Vercel caps
      // a serverless function's request body at roughly 4.5 MB, so raising this
      // number further buys nothing: past the platform cap the request is
      // rejected upstream of Next entirely and this setting never gets consulted.
      // 4mb is therefore close to the practical maximum for this path — headroom
      // of roughly 2.8x today's file, or very roughly 4,000 prospects at the
      // current ~1,041 bytes per row.
      //
      // ⚠️ WHAT TO DO WHEN THE SHEET OUTGROWS IT — and it eventually will. Do NOT
      // keep raising this. A materially larger export needs a different ingest
      // path: upload the file directly to storage from the browser, then ingest
      // it server-side, which never puts the bytes in a Server Action body at
      // all. That is deliberately not built here.
      //
      // ⚠️ THIS VALUE HAS A TWIN IN `src/lib/upload-size.ts`, AND THEY MUST MOVE
      // TOGETHER. Both upload forms now refuse an over-limit file in the BROWSER,
      // before dispatch, because past this limit the request is rejected in
      // transport and no action code ever runs — there is nothing for a form to
      // display. That guard hard-codes this number (as 4 * 1024 * 1024, since
      // Next parses "4mb" with the `bytes` package where mb is 1024²) and
      // subtracts a reserve for the rest of the body. It cannot import this
      // config — it runs in the browser — so the two are held in step by these
      // comments alone. CHANGE ONE AND YOU MUST CHANGE THE OTHER: leave them
      // apart and the guard either refuses files that would have fitted, or goes
      // back to letting the silent failure through.
      bodySizeLimit: "4mb",
    },
  },
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
