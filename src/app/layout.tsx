import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { config } from "@/config";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
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
