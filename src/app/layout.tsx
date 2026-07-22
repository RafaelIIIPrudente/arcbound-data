import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { config } from "@/config";

import "./globals.css";

// ArcBase type system (design brief): Geist for body/UI, Geist Mono for labels,
// Inter Tight for the wordmark and display headings.
//
// SELF-HOSTED, not `next/font/google`. Fetching these from Google at build time
// made the build depend on a third-party network call: a transient failure
// there aborted `next build` with a bare `NextFontError`, and a half-written
// `.next` afterwards surfaced as unrelated-looking missing-manifest errors.
// The files now live in ./fonts and the build is hermetic. See fonts/README.md
// for provenance and licensing.
//
// Each file is the LATIN subset of the family's VARIABLE font — one file spans
// weights 100-900, which is why `weight` is a range rather than a number. The
// design uses 400/500/600/800, all covered.
const geist = localFont({
  src: "./fonts/geist-latin-variable.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/geist-mono-latin-variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});
const interTight = localFont({
  src: "./fonts/inter-tight-latin-variable.woff2",
  variable: "--font-inter-tight",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(config.site.url),
  title: {
    default: config.site.name,
    template: `%s | ${config.site.name}`,
  },
  description: config.site.description,
  applicationName: config.site.name,
  openGraph: {
    type: "website",
    siteName: config.site.name,
    title: config.site.name,
    description: config.site.description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: config.site.name,
    description: config.site.description,
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Read a request header so this layout — and therefore every route — renders
  // dynamically per request. That lets Next.js apply the per-request CSP nonce
  // (set in src/middleware.ts) to its own framework scripts, which the enforced
  // strict CSP requires. Nonces are per-request, so pages cannot be static.
  await headers();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geist.variable} ${geistMono.variable} ${interTight.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
