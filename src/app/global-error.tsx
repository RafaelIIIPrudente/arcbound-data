"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/error-state";

// Import global styles directly: global-error REPLACES the root layout, so the
// layout's styles/ThemeProvider are not in scope. Without a ThemeProvider the
// page renders in the default (light) theme — acceptable for a last-resort page.
import "./globals.css";

// Catches errors thrown by the ROOT layout itself. Because it replaces the root
// layout, it must render its own <html> and <body> and stay self-contained.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased">
        <ErrorState onReset={reset} digest={error.digest} />
      </body>
    </html>
  );
}
