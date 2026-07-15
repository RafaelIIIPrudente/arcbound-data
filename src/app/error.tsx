"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/error-state";

// Catches errors thrown in root-level segments (login, auth, …). Renders
// inside the root layout, so the ThemeProvider is in scope.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState onReset={reset} digest={error.digest} />;
}
